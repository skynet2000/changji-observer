import importlib.util
import json
import os
from pathlib import Path
import smtplib
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('cost_report', Path(__file__).parents[1] / 'cost-report.py')
reporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reporter)
SAMPLE = {'start':'2026-10-24 00:00','end':'2026-10-25 00:00','paid_cny':'0.123456','paid_calls':3,
          'free_success':20,'free_failed':1,'unknown_outcomes':0,'unpriced_paid':0,
          'purposes':[{'purpose':'score_article','calls':3,'cny':0.123456}]}

class CostReportTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        (self.root/'shared').mkdir()
        self.env = patch.dict(os.environ, {'COST_EMAIL_START_DATE':'2000-01-01',
                    'SMTP_FROM':'sender@example.com','COST_EMAIL_TO':'owner@example.com'})
        self.env.start()
        self.root_patch = patch.object(reporter, 'ROOT', self.root)
        self.root_patch.start()
        self.client = MagicMock()
        self.client.__enter__.return_value = self.client

    def tearDown(self):
        self.root_patch.stop()
        self.env.stop()
        self.folder.cleanup()

    def run_send(self):
        with patch('sys.argv',['cost-report.py','--send']), patch.object(reporter.subprocess,'check_output',return_value=json.dumps(SAMPLE)), patch.object(reporter,'smtp',return_value=self.client):
            reporter.main()

    def test_mail_contains_window_estimate_and_purpose_without_secret(self):
        msg = reporter.message(SAMPLE,'sender@example.com','owner@example.com','2026-10-25')
        body = msg.get_content()
        self.assertIn('0.1235 元', body)
        self.assertIn('精选评分', body)
        self.assertIn('2026-10-24 00:00', body)
        self.assertIn('最终以供应商账单为准', body)
        self.assertEqual(msg['To'],'owner@example.com')
        self.assertIn('大厂观察', msg['Subject'])
        self.assertIn('大厂观察', msg['From'])

    def test_scnet_quota_usage_is_separate_from_paid_cny_and_does_not_claim_zero_cost(self):
        report = {**SAMPLE, 'scnet_success':7, 'scnet_failed':2, 'scnet_unknown':1,
                  'scnet_tokens':4567, 'scnet_missing_usage':1}
        body = reporter.message(report,'sender@example.com','owner@example.com','2026-10-25').get_content()
        self.assertIn('成功 7 次；拒绝 2 次；结果未知/进行中 1 次', body)
        self.assertIn('4567 Token', body)
        self.assertIn('缺少可读用量的成功调用 1 次', body)
        self.assertIn('付费通道估算费用：0.1235 元', body)
        self.assertIn('不把未知费用记成0元', body)
        self.assertIn('书生 DeepSeek → 国家超算 GLM', body)

    def test_operating_mail_distinguishes_yesterday_from_rolling_costs_and_partial_coverage(self):
        report = {**SAMPLE, 'traffic': {'day':'2026-10-24','available':True,'views':12,'bots':4,'errors':1,'notFound':2,
                  'since':'2026-10-24T12:00:00+08:00','complete':False,'topPages':[('/all',8),('/',4)]},
                  'operations':{'collected':10,'blocked':3,'published':5,'selected':2,'failing_sources':1,'backlog':0}}
        msg = reporter.message(report,'sender@example.com','owner@example.com','2026-10-25')
        body = msg.get_content()
        self.assertIn('网站运营日报', msg['Subject'])
        self.assertIn('2026-10-24 00:00–24:00', body)
        self.assertIn('页面访问请求：12 次',body)
        self.assertIn('部分时段',body)
        self.assertIn('/all：8 次',body)
        self.assertIn('采集入库：10 篇',body)
        self.assertIn('缺失不代表零访问',reporter.message(SAMPLE,'s@e.com','r@e.com','2026-10-25').get_content())

    def test_traffic_day_uses_beijing_midnight_and_missing_history_is_not_zero(self):
        payload = {'views':3,'bots':1,'errors':0,'notFound':0,'pages':{'/all':3},'since':'2026-10-24T16:00:00Z'}
        with patch.object(reporter.subprocess,'check_output',return_value=json.dumps(payload)):
            self.assertFalse(reporter.traffic_report('2026-10-25')['available'])
            r = reporter.traffic_report('2026-10-26')
            self.assertEqual(r['day'],'2026-10-25');self.assertTrue(r['complete'])
        with patch.object(reporter.subprocess,'check_output',side_effect=OSError()):
            self.assertFalse(reporter.traffic_report('2026-10-26')['available'])

    def test_never_send_before_first_day(self):
        with patch.dict(os.environ,{'COST_EMAIL_START_DATE':'2999-01-01'}):
            self.run_send()
        self.client.send_message.assert_not_called()

    def test_uv_coverage_is_independent_of_pv_and_missing_uv_is_not_zero(self):
        payload = {'views':30,'bots':1,'errors':0,'notFound':0,'pages':{'/all':30},'since':'2026-10-23T16:00:00Z'}
        def read(extra):
            with patch.object(reporter.subprocess,'check_output',return_value=json.dumps({**payload,**extra})):
                return reporter.traffic_report('2026-10-26')
        missing = read({})
        self.assertTrue(missing['complete']);self.assertFalse(missing['uvAvailable'])
        self.assertIn('缺失不代表零访客',reporter.message({**SAMPLE,'traffic':missing},'s@e.com','r@e.com','2026-10-26').get_content())
        self.assertFalse(read({'uniqueVisitors':0,'uvSince':'2026-10-25T16:00:00Z'})['uvAvailable'])
        partial = read({'uniqueVisitors':4,'uvSince':'2026-10-25T12:00:00Z'})
        self.assertTrue(partial['complete']);self.assertTrue(partial['uvAvailable']);self.assertFalse(partial['uvComplete'])
        body = reporter.message({**SAMPLE,'traffic':partial},'s@e.com','r@e.com','2026-10-26').get_content()
        self.assertIn('独立访客（UV）：4',body);self.assertIn('仅覆盖部分时段',body)
        full = read({'uniqueVisitors':0,'uvSince':'2026-10-24T16:00:00Z'})
        self.assertTrue(full['uvAvailable']);self.assertTrue(full['uvComplete']);self.assertEqual(full['uniqueVisitors'],0)
        self.assertFalse(read({'uniqueVisitors':31,'uvSince':'2026-10-24T16:00:00Z'})['uvAvailable'])
        self.assertFalse(read({'uniqueVisitors':True,'uvSince':'2026-10-24T16:00:00Z'})['uvAvailable'])
        invalid = read({'uniqueVisitors':2,'uvSince':'invalid'})
        self.assertTrue(invalid['available']);self.assertFalse(invalid['uvAvailable'])

    def test_success_is_deduplicated(self):
        self.run_send()
        self.run_send()
        self.client.send_message.assert_called_once()

    def test_ambiguous_delivery_is_not_resent(self):
        self.client.send_message.side_effect = smtplib.SMTPServerDisconnected('connection lost')
        with self.assertRaises(smtplib.SMTPServerDisconnected):
            self.run_send()
        with self.assertRaises(RuntimeError):
            self.run_send()
        self.client.send_message.assert_called_once()

    def test_explicit_rejection_can_retry(self):
        self.client.send_message.side_effect = [smtplib.SMTPDataError(451,b'temporary rejection'),{}]
        with self.assertRaises(smtplib.SMTPDataError):
            self.run_send()
        self.run_send()
        self.assertEqual(self.client.send_message.call_count,2)

if __name__ == '__main__':
    unittest.main()
