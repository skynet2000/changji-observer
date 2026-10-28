#!/usr/bin/env python3
"""Prune only obsolete Dachang Observer images and release directories.

Without --apply, print candidates without deleting anything. Run as root on the host.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path('/home/ubuntu/changji-observer')
RELEASE_ID = re.compile(r'[0-9a-f]{40}')
AGE = dt.timedelta(days=3)
KEEP_IMAGES = 5
KEEP_RELEASES = 10


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, timeout=60)


def inspect(kind, ids):
    return json.loads(docker(kind, 'inspect', *ids)) if ids else []


def state():
    releases = ROOT / 'releases'
    current = (ROOT / 'current').resolve(strict=True)
    if current.parent != releases or not RELEASE_ID.fullmatch(current.name):
        raise RuntimeError('current release is not a site release')
    container_ids = docker('ps', '-aq', '--no-trunc').splitlines()
    containers = json.loads(docker('inspect', *container_ids)) if container_ids else []
    image_ids = list(dict.fromkeys(docker('image', 'ls', '-q', '--no-trunc', 'aihot-app').splitlines()))
    images = inspect('image', image_ids)
    images.sort(key=lambda image: dt.datetime.fromisoformat(image['Created']), reverse=True)
    used_ids = {c['Image'] for c in containers}
    used_images = inspect('image', list(used_ids))
    used_tags = {tag.removeprefix('aihot-app:') for image in used_images
                 for tag in (image.get('RepoTags') or []) if tag.startswith('aihot-app:')}
    for container in containers:
        if container['Name'].lstrip('/') in ('aihot-web-1', 'aihot-api-1', 'aihot-worker-1', 'aihot-setup-1'):
            image = next((x for x in used_images if x['Id'] == container['Image']), None)
            if not image or not any(re.fullmatch(r'aihot-app:[0-9a-f]{7,40}', t) for t in (image.get('RepoTags') or [])):
                raise RuntimeError('cannot identify release for a site container')
    mounts = [pathlib.Path(m['Source']).resolve() for c in containers for m in c.get('Mounts', []) if m.get('Source')]
    backups = set()
    for file in (ROOT / 'backups').rglob('release.txt'):
        value = file.read_text().strip()
        if not RELEASE_ID.fullmatch(value):
            raise RuntimeError('backup release identity cannot be verified')
        backups.add(value)
    return current, containers, images, used_ids, used_tags, mounts, backups


def image_candidates(now, snapshot):
    current, _, images, used_ids, _, _, _ = snapshot
    keep = {x['Id'] for x in images[:KEEP_IMAGES]} | used_ids
    candidates = []
    for image in images:
        tags = image.get('RepoTags') or []
        if (image['Id'] in keep or not tags or any(not tag.startswith('aihot-app:') for tag in tags)
                or 'aihot-app:latest' in tags or 'aihot-app:' + current.name[:7] in tags
                or now - dt.datetime.fromisoformat(image['Created']) < AGE):
            continue
        candidates.append({'id': image['Id'], 'tags': sorted(tags), 'created': image['Created']})
    return list(reversed(candidates))


def opened_paths(releases):
    result = subprocess.run(['lsof', '-nP', '-Fn', '+D', str(releases)], text=True,
                            capture_output=True, timeout=60)
    if result.returncode not in (0, 1) or result.stderr:
        raise RuntimeError('cannot verify open release files')
    return [pathlib.Path(line[1:]).resolve() for line in result.stdout.splitlines() if line.startswith('n/')]


def configured_references(releases):
    # Scheduled system services may refer to old releases even when they are not currently running.
    references = set()
    pattern = re.compile(re.escape(str(releases)) + r'/([0-9a-f]{40})(?:/|\b)')
    for base in (pathlib.Path('/etc/systemd/system'), pathlib.Path('/etc/cron.d')):
        if not base.exists():
            continue
        for file in base.rglob('*'):
            if not file.is_file() or file.stat().st_size > 1024 * 1024:
                continue
            text = file.read_text(errors='strict')
            references.update(pattern.findall(text))
    # Preserve explicit links elsewhere in the site's shared directory, without following them.
    for base in (ROOT, ROOT / 'shared'):
        entries = base.iterdir() if base == ROOT else base.rglob('*')
        for path in entries:
            if path.is_symlink():
                target = path.resolve()
                if releases in target.parents:
                    references.add(target.relative_to(releases).parts[0])
    return references


def release_candidates(now, snapshot):
    current, _, _, _, used_tags, mounts, backups = snapshot
    releases = ROOT / 'releases'
    paths = [p for p in releases.iterdir() if not p.is_symlink() and p.is_dir() and RELEASE_ID.fullmatch(p.name)]
    paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    keep = {p.name for p in paths[:KEEP_RELEASES]} | backups | {current.name} | configured_references(releases)
    open_files = opened_paths(releases)
    candidates = []
    for path in paths:
        if (path.name in keep or path.name[:7] in used_tags
                or any(ref == path or path in ref.parents for ref in mounts + open_files)
                or now.timestamp() - path.stat().st_mtime < AGE.total_seconds()):
            continue
        candidates.append({'id': path.name, 'mtime': path.stat().st_mtime})
    return list(reversed(candidates))


def run(apply=False):
    now = dt.datetime.now(dt.timezone.utc)
    snapshot = state()
    images, releases = image_candidates(now, snapshot), release_candidates(now, snapshot)
    result = {'mode': 'apply' if apply else 'dry-run', 'images': images, 'releases': releases,
              'removed_images': [], 'removed_releases': [], 'skipped': []}
    if not apply:
        return result
    for candidate in images:
        latest = state()
        if latest[0] != snapshot[0]:
            raise RuntimeError('release changed during cleanup; stopping')
        if candidate not in image_candidates(dt.datetime.now(dt.timezone.utc), latest):
            result['skipped'].append({'id': candidate['id'], 'reason': 'image state changed'})
            continue
        try:
            docker('image', 'rm', *candidate['tags'])  # no --force and no global prune
            result['removed_images'].append(candidate['id'])
            print(json.dumps({'removed_image': candidate['id']}), file=sys.stderr, flush=True)
        except subprocess.CalledProcessError:
            result['skipped'].append({'id': candidate['id'], 'reason': 'Docker refused deletion'})
    for candidate in releases:
        latest = state()
        if latest[0] != snapshot[0]:
            raise RuntimeError('release changed during cleanup; stopping')
        if candidate not in release_candidates(dt.datetime.now(dt.timezone.utc), latest):
            result['skipped'].append({'id': candidate['id'], 'reason': 'release state changed'})
            continue
        path = ROOT / 'releases' / candidate['id']
        if not RELEASE_ID.fullmatch(candidate['id']) or path.is_symlink() or path.parent != ROOT / 'releases':
            raise RuntimeError('unsafe release path')
        shutil.rmtree(path)
        result['removed_releases'].append(candidate['id'])
        print(json.dumps({'removed_release': candidate['id']}), file=sys.stderr, flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        # Prevent overlapping runs of this cleaner. Recheck all external references for each deletion.
        with open('/run/lock/dachang-storage-cleanup.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = run(args.apply)
        print(json.dumps(result, ensure_ascii=False))
        if result['skipped']:
            sys.exit(1)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
