# 服务器模型费用邮件

用户确认 Gmail 发件、QQ 邮箱收件；每天北京时间 09:00 发送前滚动 24 小时费用，从 2026-10-25 开始。配置模板为 `deploy/cost-email.env.example`。收件人、发件账号、SMTP 应用专用密码及首日配置只放服务器 `shared/cost-email.env`（600 权限），不写进 Git、前端或容器镜像。

`deploy/cost-report.py` 使用服务器上的 Docker/PostgreSQL 回执，不调用模型：统计人民币费用、付费尝试次数、用途、免费成功与拒绝次数，并提示未知价格或未知调用结果。金额是本站账本估算，不能代替供应商最终账单，也不包含同一密钥在其他项目的调用。

`changji-cost-mail.timer` 使用 Asia/Shanghai 时区，每日 09:00 触发，Persistent=true 会补跑关机期间错过的任务。首日由配置再次检查，今天手动验证不会发送明天日报。补跑统计实际执行前 24 小时，不伪装成漏过时刻的数据。单日成功只发一次；SMTP 发送结果未知时不盲目重发，避免重复邮件。明确拒绝、登录失败等由 systemd 最多有限重试。

部署：代码先推 GitHub并发布，再将两个 unit 安装到 `/etc/systemd/system/`，`systemctl daemon-reload`、`systemctl enable --now changji-cost-mail.timer`。服务不开放任何入站端口。它读取生产私有配置，借助既有 Docker 本地访问数据库。

验证（服务器根目录，加载私有环境后执行）：

- `python3 current/deploy/cost-report.py --check-login`：只验证 SMTP 登录，不发送。
- `sudo python3 current/deploy/cost-report.py --dry-run`：读取真实过去24小时，输出邮件预览，不发送。
- `systemctl list-timers changji-cost-mail.timer`：确认下次时间。
- `journalctl -u changji-cost-mail.service -n 30`：检查执行结果，不记录密码。

如状态为 unknown/sending，先在发件箱确认是否送达，再由维护者处理 `shared/cost-mail-state.json`；不要直接反复手动发信。Google 登录密码变更或撤销应用专用密码后，需要更新服务器发信凭据。停用邮件时使用 `systemctl disable --now changji-cost-mail.timer`，不影响网站或采集。

本机测试：`PYTHONPYCACHEPREFIX=.data/python-cache python3 -m unittest discover -s deploy/tests`。
