# 服务器网站运营日报

用户确认 Gmail 发件、QQ 邮箱收件；每天北京时间 09:00 发送北京时间前一自然日00:00–24:00的模型费用、匿名访问和内容产出，从 2026-10-25 开始。配置模板为 `deploy/cost-email.env.example`。收件人、发件账号、SMTP 应用专用密码及首日配置只放服务器 `shared/cost-email.env`（600 权限），不写进 Git、前端或容器镜像。

`deploy/cost-report.py` 使用服务器上的 Docker/PostgreSQL 回执，不调用模型：统计人民币费用、付费尝试次数、用途、免费成功与拒绝次数，并提示未知价格或未知调用结果。金额是本站账本估算，不能代替供应商最终账单，也不包含同一密钥在其他项目的调用。

`changji-cost-mail.timer` 使用 Asia/Shanghai 时区，每日 09:00 触发，Persistent=true 会补跑关机期间错过的任务。首日由配置再次检查，今天手动验证不会发送明天日报。补跑统计实际执行日的前一个北京时间自然日，不伪装成漏过时刻的数据。单日成功只发一次；SMTP 发送结果未知时不盲目重发，避免重复邮件。明确拒绝、登录失败等由 systemd 最多有限重试。

部署：代码先推 GitHub并发布，再将两个 unit 安装到 `/etc/systemd/system/`，`systemctl daemon-reload`、`systemctl enable --now changji-cost-mail.timer`。服务不开放任何入站端口。它读取生产私有配置，借助既有 Docker 本地访问数据库。

验证（服务器根目录，加载私有环境后执行）：

- `python3 current/deploy/cost-report.py --check-login`：只验证 SMTP 登录，不发送。
- `sudo python3 current/deploy/cost-report.py --dry-run`：读取真实昨日数据，输出邮件预览，不发送。
- `systemctl list-timers changji-cost-mail.timer`：确认下次时间。
- `journalctl -u changji-cost-mail.service -n 30`：检查执行结果，不记录密码。

如状态为 unknown/sending，先在发件箱确认是否送达，再由维护者处理 `shared/cost-mail-state.json`；不要直接反复手动发信。Google 登录密码变更或撤销应用专用密码后，需要更新服务器发信凭据。停用邮件时使用 `systemctl disable --now changji-cost-mail.timer`，不影响网站或采集。

本机测试：`PYTHONPYCACHEPREFIX=.data/python-cache python3 -m unittest discover -s deploy/tests`。

## 故障与恢复通知

`changji-ops-mail.timer` 每五分钟运行 `deploy/ops-notify.py`，复用同一份私有发信配置和收件邮箱。检查网站健康、容器状态、worker 心跳、内容积压、日报缺刊，以及本机备份和费用邮件任务。异常连续两次存在才通知，相同异常不反复发信；已通知的故障消失时发送一次恢复邮件。后台等级为“稍后处理”的信源提醒仍在后台查看，不因单个来源被拦截而刷邮件。

代码发布后安装 `changji-ops-mail.service` 和 `changji-ops-mail.timer`，运行 `systemctl daemon-reload` 与 `systemctl enable --now changji-ops-mail.timer`。`sudo python3 current/deploy/ops-notify.py` 只检查并输出异常，不发邮件、不写状态。检查定时器和日志使用 `systemctl list-timers changji-ops-mail.timer`、`journalctl -u changji-ops-mail.service -n 30`。

通知状态保存在 `shared/ops-mail-state.json`，权限 600。SMTP 结果未知时停止盲目重发，先核查发件箱后再处理状态。整台服务器或网络宕机，以及 SMTP 服务自身故障时，本机任务无法保证发送；这不等于已经配置独立站外监测。


## 访问与内容指标（2026-10-25）

费用、页面请求、估算UV与内容产出统一按昨天北京时间00:00–24:00统计；当前连续失败来源与处理积压是发送时的状态，单独标明。访问由web服务器聚合，HTML和客户端导航请求计入，排除HEAD、预取、静态资源、API和后台；已识别爬虫单列。浏览器缓存和无请求导航可能漏计。

估算UV使用可信代理提供的连接地址（未配置可信代理时仅用套接字地址）与浏览器标识，通过每日随机密钥计算HMAC去重。不设置统计Cookie，不保存原始IP、浏览器标识、账号或查询词。相同连接地址与浏览器标识一天计一次，共享网络可能合并、切换网络/浏览器可能重复，不能解读为准确人数。`uv-current.state`仅在私有统计目录保存当日随机密钥和去重值，下一自然日首次统计时替换；不进入每日`*.json`聚合备份。`uv-started.json`和各日`uvSince`标明UV独立覆盖起点。

Docker的`traffic`专用持久卷保存30天聚合数据，镜像升级不清空；非Docker可设置`ACCESS_STATS_DIR`。首次启用无历史可补：缺失写“无历史记录/读取失败”，局部覆盖注明启用时间，不伪装零访问。升级保留既有PV，UV从实际启用时开始；正常重启继续当天去重，恢复不含去重值的备份时重新开始UV局部窗口并标注，不能把旧PV推成UV。每天邮件展示页面请求、估算UV及其覆盖范围、爬虫、5xx/404、Top5公共页面、采集/阻止/公开/精选篇数，以及当前故障源和积压。费用日报原去重状态与09:00定时器不变；既有即时异常邮件继续运行。生成邮件不调用模型。


## 超算中间层统计（2026-10-26）

运营邮件仍统一统计昨天北京时间00:00–24:00。书生免费请求与超算GLM请求分别列出；超算展示成功、拒绝、结果未知/进行中、已返回总Token及成功但缺少用量的条数。官方DeepSeek等已定价付费请求继续列人民币估算与用途。不会因超算缺少现金价格就宣称费用0元，也不会把超算成功次数算入官方付费尝试。平台剩余赠送额度、同一Key在其他程序的调用及未核实的超算现金账单不包含在这些数字中。

## 免费通道恢复状态（2026-10-27）

每天09:00邮件新增昨日免费通道失败原因分布（额度拒绝、限流、未知、服务错误等）；仍按昨天北京时间00:00–24:00统计，每次发送尝试单独计数。另列当前共享冷却及恢复探测状态，并明确该部分不是昨日统计。健康状态不是平台剩余额度；冷却跳过不伪造请求次数，收到模型回复也不等于通过全部业务校验。两层优先、单探测恢复和重试规则见[模型路由](model-routing.md)。
