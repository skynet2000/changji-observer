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
SAMPLE = {'start':'2026-10-24 09:00','end':'2026-10-25 09:00','paid_cny':'0.123456','paid_calls':3,
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
        self.assertIn('2026-10-24 09:00', body)
        self.assertIn('最终以供应商账单为准', body)
        self.assertEqual(msg['To'],'owner@example.com')

    def test_never_send_before_first_day(self):
        with patch.dict(os.environ,{'COST_EMAIL_START_DATE':'2999-01-01'}):
            self.run_send()
        self.client.send_message.assert_not_called()

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
