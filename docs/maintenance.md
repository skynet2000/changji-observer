# 厂际观察：小白维护说明

## 日常需要做什么

网站、数据库与采集任务运行在腾讯云首尔服务器，正式启用后不依赖你的电脑。按每小时更新；打开网页不会调用模型。每周看一次首页、最近日报和后台的信源/任务/模型费用，留意长时间没更新、失败积压和不合适的精选。不要把后台密码、DeepSeek密钥或SSH私钥发到聊天、截图或GitHub。

源码仓库：[skynet2000/changji-observer](https://github.com/skynet2000/changji-observer)（私有）。域名为 `innews.site`，服务器为腾讯云首尔 `43.155.165.21`、实例 `lhins-kynmo5rw`。网站管理员密码与服务器登录方式是两回事：网站密码用于 `/admin`，服务器用 `ubuntu` 加SSH私钥。没有查到名为 `skynet` 的系统用户；腾讯云网页账号仍按你原来的方式登录。

## 登录服务器

在这台Mac的终端执行：

```bash
cd "/Users/skynet/Documents/ChatGPT/信息流/tiantian-hot"
ssh -i .data/deploy/changji-ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.data/deploy/known_hosts ubuntu@43.155.165.21
```

私钥仅保存在本机 `.data/deploy/changji-ed25519`。请另存一份到你自己保管的加密存储或密码管理器；不要上传GitHub。更换电脑时需要安全迁移私钥。出现“主机密钥变化”警告时先核对服务器是否重装，不要直接忽略警告。

当前服务器SSH已关闭密码认证，原密码不能用于SSH。系统账号和密码并没有因此被删除；如以后要改回密码方式，应先保留已验证的密钥会话，再通过腾讯云控制台处理，由你本人完成密码重置。不要直接重装系统，重装会影响网站和数据库。

## 查看状态和日志

登录服务器后执行：

```bash
cd /home/ubuntu/changji-observer/current
sudo docker compose ps
sudo docker compose logs --tail=80 worker
sudo docker compose logs --tail=80 api web
```

网站打不开但服务器可以登录时，先保存错误信息。只重启网页与API可执行 `sudo docker compose restart api web`。worker停止时会等待在途模型请求收尾，请不要强制杀进程或反复重启，避免重复付费。不要执行 `docker compose down -v`，它会删除数据库等持久化数据卷。

## 更新网站

后续可以直接在本项目里告诉Codex要改什么。发布顺序应是：修改、检查、备份、推送GitHub、部署新版本、数据库迁移、网站验收。云端的 `current` 指向当前版本，旧版本源码保留在 `releases/`。不要重新部署祖宗仓库覆盖本项目，不要直接用旧代码连接不兼容的新数据库。

## 模型版本和费用

当前所有资讯处理步骤使用DeepSeek官方 `deepseek-flash`，官方2026-10-17更新说明其对应 V4.1-Flash-1017；评分开启低强度推理，其他常规结构化步骤关闭推理。官方API使用别名，不能保证未来永久固定同一日期版本；改模型前应重新核验[官方更新说明](https://api-docs.deepseek.com/zh-cn/updates/)。

2026-10-21免模型金额与调用次数上限，仍记费用并保留并发、停用及回执保护。北京时间当天结束后恢复原有限额配置；当前基础金额上限为0.5元/滚动24小时，今天的花费也计入该窗口，恢复限额后可能暂缓生成。网页阅读继续正常。后续要长期调整预算，明确告诉Codex金额和适用期限即可。

## 备份与恢复

部署配置提供每日北京时间04:10的服务器内备份，保留最近七天的成功副本，包含数据库、上传附件、发布版本及SHA256校验。路径为 `/home/ubuntu/changji-observer/backups/automatic/`。检查命令：

```bash
systemctl status changji-backup.timer
journalctl -u changji-backup.service --no-pager -n 20
```

服务器内备份能应对误改数据，不能应对整台服务器或磁盘丢失。迁移快照另有本机副本；自动异地备份尚未接通。需要再选择异地存储后，完成上传、权限、生命周期和恢复验收。不要把数据库备份放到网页目录或GitHub普通文件里。恢复前先停止worker，再备份当前库，在隔离库验证恢复后才切换。

## 到期和仍需关注的事项

域名当前到期为2027-10-19，服务器为2027-10-21。服务器未开启自动续费，未来续费价以当时账单为准，不承诺永久199元。请在到期前核对并续费，不需要额外购买模型主机或GPU。

外部故障通知、自动异地备份、连续运行观察和新样本精选验收尚未完成。Alizila官方RSS当前在首尔返回403，其他已接通入口不受影响；X与小红书企业官方免费直连覆盖仍有缺口。遇到模型误选或历史归组遗漏，请保留文章链接，先做人工纠正再调整规则，不能只为凑日报条数降低门槛。
