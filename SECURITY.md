# 安全与敏感信息

## 私密报告

大厂观察由本仓库维护。疑似权限绕过、凭据泄露、注入或数据泄露，请使用[本仓库的私密漏洞报告](https://github.com/skynet2000/changji-observer/security/advisories/new)，或联系已公开的维护邮箱 [skynettiantian@gmail.com](mailto:skynettiantian@gmail.com)。不要把本项目漏洞发到上游仓库。

提供受影响版本、最小复现步骤、影响范围和已脱敏的证据。**不要在公开Issue、讨论或PR里贴真实API Key、SSH私钥、管理员密码、OAuth Secret、Cookie、SMTP授权码、数据库或读者数据。** 暂不承诺固定响应时间或奖励。

## 仓库公开范围

- 公开应用源码、配置模板、提示词、信源清单、文档和匿名界面截图。
- `.env`、`.data/`、`outputs/`、数据库、部署备份及真实凭据不进入Git；模板中的密码与Key字段留空。
- 截图只使用公开阅读页面，不展示后台、个人账号或密钥配置页。
- 公共示例使用占位主机与路径。在线站的地址、公开联系邮箱、开源依赖及许可署名不属于凭据。
- 公开仓库不意味着新闻全文可转载，也不意味着读者数据、生产数据库或模型额度开放。

## 提交前自查

```bash
git status --short
git diff --cached
# 使用自行从官方渠道安装并校验的Gitleaks：
gitleaks git . --log-opts="--all --full-history" --redact=100
```

CI使用固定版本和SHA256校验的Gitleaks检查历史；`.gitleaksignore`只记录人工核对的、绑定旧提交和行号的误报，不整目录忽略测试或文档。GitHub的密钥扫描/推送保护只覆盖支持的格式，**不能保证发现所有密码、截图中的文字或自定义Token**。

如误提交真实凭据，先在供应商处撤销并替换，再处理Git历史、缓存、Actions日志与附件。删除当前文件不能清除历史；隐藏仓库或添加`.gitignore`也不能撤销已暴露的凭据。不要把新凭据再次贴到公开渠道。

普通使用故障、界面问题和功能建议走[本仓库Issues](https://github.com/skynet2000/changji-observer/issues/new/choose)。当前只维护最新版本，没有另行承诺长期支持分支。
