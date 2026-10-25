#!/usr/bin/env python3
"""Read yesterday's Beijing-day model ledger; send one private SMTP report per Beijing day."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import smtplib
import ssl
import subprocess
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from email.message import EmailMessage
from email.utils import formataddr, format_datetime
from zoneinfo import ZoneInfo

ROOT = Path('/home/ubuntu/changji-observer')
QUERY = """
WITH bounds AS (SELECT (date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai')-interval '1 day') AT TIME ZONE 'Asia/Shanghai' AS start_at, date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' AS end_at), calls AS (
 SELECT r.service,r.purpose,a.status,a.cost,a.currency
 FROM receipt_attempts a JOIN receipts r ON r.id=a.receipt_id
 WHERE a.origin='live' AND a.model IS NOT NULL
 AND a.started_at >= (SELECT start_at FROM bounds) AND a.started_at < (SELECT end_at FROM bounds)
)
SELECT json_build_object(
 'start',(SELECT start_at FROM bounds) AT TIME ZONE 'Asia/Shanghai',
 'end',(SELECT end_at FROM bounds) AT TIME ZONE 'Asia/Shanghai',
 'paid_cny',coalesce(sum(cost) FILTER(WHERE currency='CNY'),0)::text,
 'paid_calls',count(*) FILTER(WHERE service<>'intern'),
 'free_success',count(*) FILTER(WHERE service='intern' AND status='received'),
 'free_failed',count(*) FILTER(WHERE service='intern' AND status='failed'),
 'unknown_outcomes',count(*) FILTER(WHERE service<>'intern' AND status IN('unknown','pending')),
 'unpriced_paid',count(*) FILTER(WHERE service<>'intern' AND status='received' AND (cost IS NULL OR currency IS DISTINCT FROM 'CNY')),
 'operations',json_build_object(
  'collected',(SELECT count(*) FROM articles WHERE discovered_at>=(SELECT start_at FROM bounds) AND discovered_at<(SELECT end_at FROM bounds)),
  'blocked',(SELECT count(*) FROM articles WHERE discovered_at>=(SELECT start_at FROM bounds) AND discovered_at<(SELECT end_at FROM bounds) AND processing_state='blocked'),
  'published',(SELECT count(*) FROM publications WHERE discovered_at>=(SELECT start_at FROM bounds) AND discovered_at<(SELECT end_at FROM bounds) AND visibility='public' AND eligible AND (NOT selected OR visible_after<=now())),
  'selected',(SELECT count(*) FROM publications WHERE discovered_at>=(SELECT start_at FROM bounds) AND discovered_at<(SELECT end_at FROM bounds) AND visibility='public' AND eligible AND selected AND visible_after<=now()),
  'failing_sources',(SELECT count(*) FROM sources WHERE enabled AND health='failing'),
  'backlog',(SELECT count(*) FROM articles WHERE processing_state='new' AND discovered_at<now()-interval '2 hours' AND discovered_at>now()-interval '2 days')),
 'purposes',(SELECT coalesce(json_agg(p ORDER BY p.cny DESC),'[]'::json) FROM
   (SELECT purpose,count(*) AS calls,coalesce(sum(cost) FILTER(WHERE currency='CNY'),0) AS cny
    FROM calls WHERE service<>'intern' GROUP BY purpose) p)
) FROM calls;
"""
LABELS = {'maintenance.category4':'历史四栏准入与分类复核', 'maintenance.category4.confirm':'疑似无关报道二次复核', 'prefilter_article':'行业预筛','score_article':'精选评分','understand_article':'内容理解',
          'summarize_article':'标题与摘要','structure_article':'结构抽取','mend_wording':'措辞修订',
          'group_article':'报道归组','group_review':'归组复核','group_story':'事件合并',
          'group_story_review':'事件合并复核','group_signal':'热点信号归组','story_digest':'事件综述',
          'language.english':'中英文翻译','translate_body':'全文翻译','translate_quoted':'引用翻译',
          'maintenance.prefilter.round3':'第三轮准入开发回归','maintenance.score.round3':'第三轮评分开发回归',
          'maintenance.prefilter.boundary':'准入开发回归','maintenance.selection.holdout':'独立验收预筛','maintenance.group.history':'历史归组复核',
          'report_weekly':'周报','report_monthly':'月报','ops.priority_probe':'通道验收'}


def money(value):
    return f'{Decimal(str(value)):.4f}'


def message(report, sender, recipient, day):
    msg = EmailMessage()
    msg['From'] = formataddr(('大厂观察', sender))
    msg['To'] = recipient
    msg['Subject'] = f'大厂观察｜网站运营日报｜{day}'
    msg['Message-ID'] = f'<changji-cost-{day}@innews.site>'
    msg['Date'] = format_datetime(datetime.now(ZoneInfo('Asia/Shanghai')))
    rows = [f"统一统计窗口（北京时间）：{report['start']} 至 {report['end']}",
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
    traffic = report.get('traffic', {})
    rows += ['', f"昨日访问（北京时间）：{traffic.get('day', '未取得')} 00:00–24:00"]
    if traffic.get('available'):
        rows += [f"页面访问请求：{traffic['views']} 次（排除已识别爬虫；不是独立访客数）",
                 f"已识别爬虫/自动化请求：{traffic['bots']} 次；页面5xx错误：{traffic['errors']} 次；404：{traffic['notFound']} 次",
                 f"统计启用时间：{traffic['since']}；{'完整自然日' if traffic['complete'] else '仅覆盖启用后的部分时段'}。", '热门页面：']
        rows.extend(f"- {page}：{count} 次" for page, count in traffic['topPages'])
        if not traffic['topPages']: rows.append('- 本统计时段暂无成功页面请求。')
        rows += ['未统计UV、IP、设备指纹、Cookie、登录身份或搜索词；不包含浏览器完全从缓存读取的页面。']
    else:
        rows.append('访问统计未启用、无历史记录或读取失败；缺失不代表零访问。')
    ops = report.get('operations')
    if ops:
        rows += ['', '昨日内容产出与当前运行状态：',
                 f"采集入库：{ops['collected']} 篇；准入阻止：{ops['blocked']} 篇；公开报道：{ops['published']} 篇；精选：{ops['selected']} 篇。",
                 f"当前连续失败信源：{ops['failing_sources']} 个；等待超2小时：{ops['backlog']} 篇。"]
    rows += ['', '访问信息只做站内匿名聚合，不调用模型；故障与恢复通知仍单独及时发送。']
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


def traffic_report(day):
    yesterday = (datetime.fromisoformat(day).date() - timedelta(days=1)).isoformat()
    result = {'day': yesterday, 'available': False}
    try:
        # Read only the private aggregate volume; never query cookies, addresses or raw access logs.
        script = "const f=require('fs');const dir=process.env.ACCESS_STATS_DIR;if(!dir)process.exit(2);const since=JSON.parse(f.readFileSync(dir+'/started.json')).since;let d;try{d=JSON.parse(f.readFileSync(dir+'/'+process.argv[1]+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;d={views:0,bots:0,errors:0,notFound:0,pages:{}};}console.log(JSON.stringify({...d,since}));"
        raw = subprocess.check_output(['docker','compose','exec','-T','web','node','-e',script,yesterday], cwd=ROOT/'current', text=True, stderr=subprocess.DEVNULL, timeout=20)
        data = json.loads(raw)
        since = datetime.fromisoformat(data['since'].replace('Z','+00:00'))
        start = datetime.fromisoformat(yesterday).replace(tzinfo=ZoneInfo('Asia/Shanghai'))
        if since >= start + timedelta(days=1): return result
        counts = {k: data[k] for k in ('views','bots','errors','notFound')}
        if any(not isinstance(n,int) or isinstance(n,bool) or n<0 for n in counts.values()): return result
        pages = data['pages']
        if not isinstance(pages,dict) or any(not isinstance(k,str) or not isinstance(v,int) or v<0 for k,v in pages.items()): return result
        return {**result, **counts, 'available': True, 'since': since.astimezone(ZoneInfo('Asia/Shanghai')).isoformat(),
                'complete': since<=start, 'topPages': sorted(pages.items(), key=lambda p: (-p[1],p[0]))[:5]}
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError):
        return result


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
    report['traffic'] = traffic_report(day)
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
