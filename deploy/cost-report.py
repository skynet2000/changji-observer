#!/usr/bin/env python3
"""Read the rolling 24h model ledger; send one private SMTP report per Beijing day."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import smtplib
import ssl
import subprocess
import sys
from datetime import datetime
from decimal import Decimal
from email.message import EmailMessage
from email.utils import formataddr, format_datetime
from zoneinfo import ZoneInfo

ROOT = Path('/home/ubuntu/changji-observer')
QUERY = """
WITH calls AS (
 SELECT r.service,r.purpose,a.status,a.cost,a.currency
 FROM receipt_attempts a JOIN receipts r ON r.id=a.receipt_id
 WHERE a.origin='live' AND a.model IS NOT NULL
 AND a.started_at >= now()-interval '24 hours' AND a.started_at < now()
)
SELECT json_build_object(
 'start',(now()-interval '24 hours') AT TIME ZONE 'Asia/Shanghai',
 'end',now() AT TIME ZONE 'Asia/Shanghai',
 'paid_cny',coalesce(sum(cost) FILTER(WHERE currency='CNY'),0)::text,
 'paid_calls',count(*) FILTER(WHERE service<>'intern'),
 'free_success',count(*) FILTER(WHERE service='intern' AND status='received'),
 'free_failed',count(*) FILTER(WHERE service='intern' AND status='failed'),
 'unknown_outcomes',count(*) FILTER(WHERE service<>'intern' AND status IN('unknown','pending')),
 'unpriced_paid',count(*) FILTER(WHERE service<>'intern' AND status='received' AND (cost IS NULL OR currency IS DISTINCT FROM 'CNY')),
 'purposes',(SELECT coalesce(json_agg(p ORDER BY p.cny DESC),'[]'::json) FROM
   (SELECT purpose,count(*) AS calls,coalesce(sum(cost) FILTER(WHERE currency='CNY'),0) AS cny
    FROM calls WHERE service<>'intern' GROUP BY purpose) p)
) FROM calls;
"""
LABELS = {'prefilter_article':'行业预筛','score_article':'精选评分','understand_article':'内容理解',
          'summarize_article':'标题与摘要','structure_article':'结构抽取','mend_wording':'措辞修订',
          'group_article':'报道归组','group_review':'归组复核','group_story':'事件合并',
          'group_story_review':'事件合并复核','group_signal':'热点信号归组','story_digest':'事件综述',
          'language.english':'中英文翻译','translate_body':'全文翻译','translate_quoted':'引用翻译',
          'report_weekly':'周报','report_monthly':'月报','ops.priority_probe':'通道验收'}


def money(value):
    return f'{Decimal(str(value)):.4f}'


def message(report, sender, recipient, day):
    msg = EmailMessage()
    msg['From'] = formataddr(('大厂观察', sender))
    msg['To'] = recipient
    msg['Subject'] = f'大厂观察｜过去24小时模型费用｜{day}'
    msg['Message-ID'] = f'<changji-cost-{day}@innews.site>'
    msg['Date'] = format_datetime(datetime.now(ZoneInfo('Asia/Shanghai')))
    rows = [f"统计窗口（北京时间）：{report['start']} 至 {report['end']}",
            f"付费通道估算费用：{money(report['paid_cny'])} 元", f"付费通道尝试：{report['paid_calls']} 次",
            f"免费通道成功：{report['free_success']} 次；拒绝：{report['free_failed']} 次", '', '费用用途：']
    rows.extend(f"- {LABELS.get(p['purpose'], p['purpose'])}：{money(p['cny'])} 元，{p['calls']} 次" for p in report['purposes'])
    if not report['purposes']:
        rows.append('- 本窗口没有付费通道调用。')
    if report['unknown_outcomes'] or report['unpriced_paid']:
        rows += ['', f"待核对：{report['unknown_outcomes']} 次调用结果未知/进行中，{report['unpriced_paid']} 次成功调用缺少可信人民币价格。未知结果可能保留费用上界。"]
    rows += ['', '当前策略：所有任务先使用免费通道，限流或发生问题时回退付费 DeepSeek。',
             '以上来自本站调用回执，按既有价格估算；最终以供应商账单为准。',
             '不含同一密钥在其他项目的调用、服务器费用和免费平台的墨点换算。此报告生成不调用模型。']
    msg.set_content('\n'.join(rows))
    return msg


def save_state(path, state):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(state, ensure_ascii=False))
    temp.chmod(0o600)
    temp.replace(path)


def smtp():
    required = ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','COST_EMAIL_TO']
    if any(not os.environ.get(key) for key in required):
        raise ValueError('SMTP configuration incomplete')
    client = smtplib.SMTP_SSL(os.environ['SMTP_HOST'], int(os.environ.get('SMTP_PORT','465')),
                             timeout=30, context=ssl.create_default_context())
    try:
        client.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'].replace(' ',''))
    except Exception:
        client.close()
        raise
    return client


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--send', action='store_true')
    mode.add_argument('--check-login', action='store_true')
    mode.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.check_login:
        with smtp():
            print('SMTP login verified; no email sent.')
        return
    day = datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
    if args.send and day < os.environ['COST_EMAIL_START_DATE']:
        print('Before configured first report date; no email sent.')
        return
    report = json.loads(subprocess.check_output(['docker','compose','exec','-T','db','psql','-U','aihot','-d','aihot','-Atc',QUERY], cwd=ROOT/'current', text=True))
    if not args.send:
        print(message(report, os.environ.get('SMTP_FROM','operator@example.com'),
                      os.environ.get('COST_EMAIL_TO','operator@example.com'), day).as_string())
        return
    state_path = ROOT/'shared/cost-mail-state.json'
    with state_path.with_suffix('.lock').open('w') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        if state.get(day, {}).get('status') == 'sent':
            print('Already sent today; no duplicate email.')
            return
        if state.get(day, {}).get('status') in ('sending','unknown'):
            raise RuntimeError('Previous delivery outcome unknown; check mailbox before retrying')
        with smtp() as client:
            msg = message(report, os.environ['SMTP_FROM'], os.environ['COST_EMAIL_TO'], day)
            state = {k:v for k,v in sorted(state.items())[-34:]}
            state[day] = {'status':'sending','cny':report['paid_cny'],'window_end':report['end']}
            save_state(state_path, state)
            try:
                client.send_message(msg, to_addrs=[os.environ['COST_EMAIL_TO']])
            except (smtplib.SMTPResponseException, smtplib.SMTPRecipientsRefused):
                state[day]['status'] = 'rejected'
                save_state(state_path, state)
                raise
            except Exception:
                state[day]['status'] = 'unknown'
                save_state(state_path, state)
                raise
            state[day]['status'] = 'sent'
            save_state(state_path, state)
            print(f"Cost report accepted by SMTP: {day}, CNY {money(report['paid_cny'])}")


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No SMTP response bodies, environment values or credential-bearing tracebacks in logs.
        print(f'Cost report failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
