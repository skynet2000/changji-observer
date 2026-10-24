import importlib.util
import os
from pathlib import Path
import smtplib
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('ops_notify', Path(__file__).parents[1] / 'ops-notify.py')
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)
FAULT = {'worker.heartbeat':{'title':'后台心跳中断', 'action':'检查 worker'}}


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        (self.root/'shared').mkdir()
        self.env = patch.dict(os.environ, {'SMTP_FROM':'sender@example.com','COST_EMAIL_TO':'owner@example.com'})
        self.env.start()
        self.root_patch = patch.object(notify, 'ROOT', self.root)
        self.root_patch.start()
        self.client = MagicMock()
        self.client.__enter__.return_value = self.client

    def tearDown(self):
        self.root_patch.stop()
        self.env.stop()
        self.folder.cleanup()

    def run_check(self, findings):
        with patch('sys.argv',['ops-notify.py','--send']), patch.object(notify,'probe',return_value=findings), patch.object(notify.mail,'smtp',return_value=self.client):
            notify.main()

    def test_short_deploy_fault_is_ignored(self):
        self.run_check(FAULT)
        self.run_check({})
        self.client.send_message.assert_not_called()

    def test_persistent_fault_and_recovery_are_each_sent_once(self):
        self.run_check(FAULT)
        self.run_check(FAULT)
        self.run_check(FAULT)
        self.run_check({})
        self.run_check({})
        self.assertEqual(self.client.send_message.call_count, 2)
        first = self.client.send_message.call_args_list[0].args[0]
        last = self.client.send_message.call_args_list[1].args[0]
        self.assertIn('异常：后台心跳中断', first.get_content())
        self.assertIn('恢复：后台心跳中断', last.get_content())
        self.assertEqual(first['To'], 'owner@example.com')
        self.assertIn('大厂观察', first['Subject'])

    def test_ambiguous_delivery_is_not_repeated(self):
        self.run_check(FAULT)
        self.client.send_message.side_effect = smtplib.SMTPServerDisconnected('lost')
        with self.assertRaises(smtplib.SMTPServerDisconnected):
            self.run_check(FAULT)
        with self.assertRaises(RuntimeError):
            self.run_check(FAULT)
        self.client.send_message.assert_called_once()

    def test_explicit_rejection_can_retry(self):
        self.run_check(FAULT)
        self.client.send_message.side_effect = [smtplib.SMTPDataError(451,b'temporary rejection'),{}]
        with self.assertRaises(smtplib.SMTPDataError):
            self.run_check(FAULT)
        self.run_check(FAULT)
        self.assertEqual(self.client.send_message.call_count, 2)

    def test_dry_check_sends_nothing_and_does_not_change_state(self):
        with patch('sys.argv',['ops-notify.py']), patch.object(notify,'probe',return_value=FAULT), patch.object(notify.mail,'smtp') as smtp:
            notify.main()
        smtp.assert_not_called()
        self.assertFalse((self.root/'shared/ops-mail-state.json').exists())


if __name__ == '__main__':
    unittest.main()
