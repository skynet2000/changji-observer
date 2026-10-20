# 可选读者登录

用途是跨设备同步收藏与已读，匿名阅读不受影响；读者账号和管理员身份、Cookie、接口、数据表彼此独立，读者不能进入后台。

## 开放前

默认 `READER_LOGIN_ENABLED=false`，没有配置完整的提供商不会显示对应按钮。先确认下方实际数据处理方式并更新隐私页，再配置凭据、用真实账号完成两个提供商的登录/退出验收，最后开启。不要把 Client Secret 提交到 GitHub、写入前端、发在聊天或截图中；本机填写文件为 `.data/deploy/reader-oauth.env`，发布时经专用 SSH 加密传输到服务器环境文件。

1. 在 [GitHub OAuth Apps](https://github.com/settings/developers) 创建独立应用，首页 `https://innews.site/`，回调 `https://innews.site/api/reader/callback/github`。填入 `READER_GITHUB_CLIENT_ID` 和 `READER_GITHUB_CLIENT_SECRET`。
2. 在 [Google 身份平台](https://console.cloud.google.com/auth/clients) 创建网站 OAuth 客户端，按实际运营者填写应用信息、首页、使用规则与隐私页，回调为 `https://innews.site/api/reader/callback/google`。配置可用的受众及测试用户/发布状态，填入 `READER_GOOGLE_CLIENT_ID` 和 `READER_GOOGLE_CLIENT_SECRET`。Google 的控制台发布和必要的域名验证需应用所有者完成。
3. Google 仅请求 `openid profile`；GitHub 不增加 OAuth scope，只读取公开账号标识与昵称，不索取邮箱、仓库、邮件或发帖权限。应用不保存提供商的访问/刷新 Token。
4. 启用后先在两个设备验证同一提供商账号：登录→手动导入本机旧记录→新增和取消收藏→读过文章→跨设备核对→退出→重新登录。Google/GitHub 暂为独立账号，不按邮箱自动合并，避免误绑定。

## 同步与安全边界

账号使用提供商的稳定 ID，显示昵称。服务器保存账号、收藏/已读和 30 天不透明会话；会话 Token 在数据库中只留哈希。生产 Cookie 使用 Secure、HttpOnly、SameSite=Lax 和 `__Host-` 前缀。OAuth 使用随机 state、浏览器绑定、PKCE 和十分钟一次性握手；回调只回本站固定页面。写入、退出、删号均检查 Origin 和 CSRF。

云端更新使用版本比较，冲突后重新获取并做三方合并。不同设备新增的收藏保留，本机自上次同步后的取消收藏优先；未改动的条目跟随云端。同步请求期间新发生的操作留在本机，下轮继续处理。已读合并保留最近最多 5000 条，收藏最多 500 条；超限按时间保留较新记录。匿名旧记录不会因登录而自动上传，需要用户按“导入本机原有收藏与已读”。

匿名记录在登录期间另存本机，退出后恢复。离线记录及最后同步快照保存在浏览器；会话过期先保留待同步副本，再恢复匿名记录，用同一账号登录可继续同步。手动正常退出先完成同步；删除账号会删除本站账号、云端记录及所有会话，匿名记录保留。服务器备份里的旧副本随轮转删除，离线设备的本机副本不能由服务器远程擦除。

账号页和接口不做共享缓存，接口有每地址每分钟 60 次的进程内限制。它是基础保护，不替代服务商 DDoS 防护。账号创建、登录和同步均不触发模型调用。

## 待完成验收

两个真实提供商的应用凭据、Google 应用发布状态和真实授权回调尚需配置。假服务测试只能验证本项目流程，不能当作提供商已接通。当前隐私页说明匿名运行，未经运营者确认增补文本不得开启读者登录。

官方协议参考：[Google 网站授权](https://developers.google.com/identity/protocols/oauth2/web-server)、[GitHub 网站授权与 PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)。
