import datetime as dt
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prune', Path(__file__).parents[1] / 'prune-site-storage.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class StorageCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.releases = self.root / 'releases'
        self.releases.mkdir()
        (self.root / 'backups').mkdir()
        (self.root / 'shared').mkdir()
        self.now = dt.datetime.now(dt.timezone.utc)
        self.ids = [f'{i:07x}' + '0' * 33 for i in range(1, 19)]
        for i, ident in enumerate(self.ids):
            directory = self.releases / ident
            directory.mkdir()
            (directory / 'source.txt').write_text('site')
            at = self.now.timestamp() - (i + 1) * 86400
            os.utime(directory, (at, at))
        (self.root / 'current').symlink_to(self.releases / self.ids[0])
        self.root_patch = patch.object(p, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def snapshot(self):
        return (self.releases / self.ids[0], [], [], set(), {self.ids[16][:7]},
                [self.releases / self.ids[13] / 'config'], {self.ids[12]})

    def test_release_candidates_preserve_recent_backup_mount_open_and_configured(self):
        with patch.object(p, 'opened_paths', return_value=[self.releases / self.ids[14] / 'open']), \
             patch.object(p, 'configured_references', return_value={self.ids[15]}):
            candidates = p.release_candidates(self.now, self.snapshot())
        self.assertEqual({c['id'] for c in candidates}, {self.ids[10], self.ids[11], self.ids[17]})

    def test_image_candidates_preserve_recent_used_other_site_and_current(self):
        images = []
        for i in range(12):
            images.append({'Id': str(i), 'Created': (self.now - dt.timedelta(days=i+1)).isoformat(),
                           'RepoTags': [f'aihot-app:release-{i}']})
        images[7]['RepoTags'].append('other-site:image')
        images[8]['RepoTags'].append('aihot-app:' + self.ids[0][:7])
        images[9]['RepoTags'].append('aihot-app:latest')
        snapshot = (self.releases / self.ids[0], [], images, {'10'}, set(), [], set())
        self.assertEqual({c['id'] for c in p.image_candidates(self.now, snapshot)}, {'5', '6', '11'})

    def test_dry_run_never_deletes(self):
        with patch.object(p, 'state', return_value=self.snapshot()), \
             patch.object(p, 'image_candidates', return_value=[{'id':'old-image', 'tags':['aihot-app:old']}]), \
             patch.object(p, 'release_candidates', return_value=[{'id':self.ids[17], 'mtime':1}]), \
             patch.object(p, 'docker') as docker, patch.object(p.shutil, 'rmtree') as remove:
            result = p.run(False)
        self.assertEqual(result['mode'], 'dry-run')
        docker.assert_not_called()
        remove.assert_not_called()

    def test_rechecks_before_deletion_and_never_forces_docker(self):
        image = {'id':'old-image', 'tags':['aihot-app:old']}
        release = {'id':self.ids[17], 'mtime':1}
        with patch.object(p, 'state', return_value=self.snapshot()), \
             patch.object(p, 'image_candidates', side_effect=[[image], [image]]), \
             patch.object(p, 'release_candidates', side_effect=[[release], []]), \
             patch.object(p, 'docker') as docker, patch.object(p.shutil, 'rmtree') as remove:
            result = p.run(True)
        docker.assert_called_once_with('image', 'rm', 'aihot-app:old')
        remove.assert_not_called()
        self.assertEqual(result['removed_images'], ['old-image'])
        self.assertEqual(result['skipped'][0]['id'], self.ids[17])

    def test_changed_current_stops_before_deletion(self):
        image = {'id':'old-image', 'tags':['aihot-app:old']}
        changed = (self.releases / self.ids[1], *self.snapshot()[1:])
        with patch.object(p, 'state', side_effect=[self.snapshot(), changed]), \
             patch.object(p, 'image_candidates', return_value=[image]), \
             patch.object(p, 'release_candidates', return_value=[]), patch.object(p, 'docker') as docker:
            with self.assertRaisesRegex(RuntimeError, 'release changed'):
                p.run(True)
        docker.assert_not_called()

    def test_deletes_only_the_rechecked_old_release(self):
        candidate = {'id':self.ids[17], 'mtime':1}
        with patch.object(p, 'state', return_value=self.snapshot()), \
             patch.object(p, 'image_candidates', return_value=[]), \
             patch.object(p, 'release_candidates', side_effect=[[candidate], [candidate]]):
            result = p.run(True)
        self.assertEqual(result['removed_releases'], [self.ids[17]])
        self.assertFalse((self.releases / self.ids[17]).exists())
        self.assertTrue((self.releases / self.ids[13]).exists())

    def test_unsafe_release_name_is_rejected(self):
        candidate = {'id':'..', 'mtime':1}
        with patch.object(p, 'state', return_value=self.snapshot()), \
             patch.object(p, 'image_candidates', return_value=[]), \
             patch.object(p, 'release_candidates', side_effect=[[candidate], [candidate]]):
            with self.assertRaisesRegex(RuntimeError, 'unsafe release'):
                p.run(True)
        self.assertTrue(self.root.exists())

    def test_invalid_backup_version_stops_before_cleanup(self):
        (self.root / 'backups' / 'release.txt').write_text('unknown')
        with patch.object(p, 'docker', side_effect=['', '']):
            with self.assertRaisesRegex(RuntimeError, 'backup release'):
                p.state()


if __name__ == '__main__':
    unittest.main()
