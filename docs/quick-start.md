# 从零运行大厂观察

本教程用于**你自己的新实例**。只想阅读可直接打开 [innews.site](https://innews.site/)，无需服务器或账号。已有生产实例请按[升级说明](deploy.md)操作，不要重新生成环境或清空数据卷。

## 你会运行什么

| 组件 | 作用 | 是否需要单独买模型主机 |
| --- | --- | --- |
| Web | 网页、登录入口、中文/英文阅读 | 不需要 |
| API | 读取资讯、后台管理、RSS/API/MCP | 不需要 |
| Worker | 定时采集、模型筛选、摘要、归组和出刊 | 不需要 |
| PostgreSQL | 保存资讯、事件、任务与读者记录 | 不需要 |

Docker Compose 会启动这些组件。模型通过供应商 API 调用，**不是在服务器安装 DeepSeek，不需要 GPU**。电脑本地运行时，关机后任务就停止；部署到持续在线的云主机后，电脑关机不影响它。

## 第一步：准备工具

- 安装 [Node.js](https://nodejs.org/) **24.11 或以上**、Git、Docker 和 Docker Compose。
- Docker 桌面应用须处于运行状态；Linux 需要 Docker 服务和 Compose 插件。
- 在终端检查：

```bash
node --version
git --version
docker --version
docker compose version
```

## 第二步：先启动一个不花模型费用的空站

```bash
git clone https://github.com/skynet2000/dachang-observer.git
cd dachang-observer
node scripts/init-env.ts
```

初始化会在本机生成 `.env`，填入随机管理员密码、数据库密码和签名密钥。管理员密码只在你的终端显示，并保存在 `.env` 的 `ADMIN_PASSWORD`；不要把该输出或整个文件贴到 Issue。已有 `.env` 时脚本会拒绝覆盖。

用本机编辑器打开 `.env`，保持这两项关闭：

```dotenv
COLLECT_ENABLED=false
MODEL_CALLS_ENABLED=false
```

本机试用可将 `.env` 的 `PORT` 设置为 `127.0.0.1:3000`。然后启动：

```bash
docker compose up -d --build
docker compose ps
```

首次会下载镜像和构建网页。`setup` 完成迁移与信源初始化后退出是正常状态；`web`、`api`、`worker` 和 `db` 应继续运行。

| 要查看的页面 | 地址 | 正常表现 |
| --- | --- | --- |
| 资讯首页 | <http://localhost:3000> | 页面可打开；还没采集时为空 |
| 管理后台 | <http://localhost:3000/admin> | 使用 `.env` 中的管理员密码 |
| 健康检查 | <http://localhost:3000/api/health> | 返回 `ok: true` |

**空站不是故障**：此时采集和模型仍关闭，仓库也不附送线上数据库、读者记录或文章正文。

## 第三步：接通模型，再开启采集

1. 在供应商自己的平台创建 API Key；只填写到本机 `.env`，不要填写到前端文件或 GitHub Issue。
2. 使用模板中的官方 DeepSeek 端点时，将自己的 Key 填入 `LLM_API_KEY` 与 `DEEPSEEK_API_KEY`。不要将 Key 写在终端命令参数里。通用兼容端点需要同时配置 `LLM_BASE_URL`、`LLM_MODEL`，见[模型路由](model-routing.md)。
3. 设置自己能接受的 `LLM_DAILY_BUDGET_CNY`。**模板目前为 `unlimited`，不是免费承诺**；填写正数表示人民币滚动24小时预算。按供应商账单核对实际支出。
4. 在后台先检查少量信源、模型选择和内容范围。项目当前有75个默认启用入口，但入口不等于独立媒体，也不保证每次都有新稿；不需要的可停用。
5. 准备好后，将 `COLLECT_ENABLED` 与 `MODEL_CALLS_ENABLED` 改为 `true`，执行：

```bash
docker compose up -d
```

后台查看信源最近成功时间、任务状态与模型回执。自动信源以120分钟为基准轮询，失败时退避更久；文章还要经过准入、摘要和归组，网页打开不等于立即采完。

可选的 Intern 免费优先通道需要你自己的 `INTERN_API_KEY`，再按[模型路由](model-routing.md)逐项设置：预筛用低强度推理，其余常规任务用普通模式；自动精选当前暂停。**仅填写 Intern Key 不会自动切换所有任务**，免费渠道失败后的官方回退仍可能收费。免费服务人民币价格未知，有限预算可能阻止该通道；先核对实际回执和预算规则，不关闭保护来追求“免费”。

## 第四步：使用与订阅

- **资讯**：综合／裁员与招聘／职场与组织／经营与竞争／政策与监管。同一事件可展开看不同报道与进展。
- **热点**：按本站收录的来源信号与时间计算，**不是微博热搜，也不是访问量排行**。
- **日报**：规则编排，周报和月报按各自周期汇编；历史快照不因普通重跑而改写。
- **我的**：本机收藏与显示设置。可选 Google/GitHub 登录用于跨设备同步，两种提供商暂为独立账号。
- 新打开或刷新默认中文，主动点击 EN 后在站内保持英文；缺译保留中文，读者切换不触发模型。

```text
全部资讯RSS：http://localhost:3000/feed/all.xml
当前资讯API：http://localhost:3000/api/v1/items?mode=all&window=24h&limit=5
接入说明：http://localhost:3000/agent
```

Google/GitHub读者登录默认关闭。启用前必须创建**你自己的**OAuth应用、设置本站回调并确认隐私说明，不能借用在线站的凭据；见[读者登录](reader-login.md)。

## 第五步：部署到自己的服务器

准备持续在线的主机、自己的域名与 SSH 密钥。先在本机验收，再参照[部署文档](deploy.md)配置 `SITE_URL`、域名和自动HTTPS。所有示例中的主机与路径都要换成你自己的，不要连接项目维护者的生产主机。

`deploy/` 中的04:10备份和09:00运营邮件是**可选运维配置**，并不会因为执行 `docker compose up` 就在你的服务器自动安装。需要自己的私有发信配置、systemd任务和恢复验收；脚本中的`ROOT`以及unit的`WorkingDirectory`、`ExecStart`要按实际部署目录修改，见[运营邮件](cost-email.md)。统计功能不调用模型，UV是估算值，不等于准确人数。

## 常见问题

| 现象 | 先检查 |
| --- | --- |
| 首页能打开但没新闻 | 采集和模型开关、信源启用状态、原文日期、任务积压和准入结果；不要为凑数关闭筛选 |
| 模型报401/403 | 后端Key、端点和模型是否对应；不要把完整错误响应含密钥部分公开 |
| 模型报429 | RPM/TPM、账户额度及共享通道容量；免费通道已有统一45RPM节奏，仍不能保证上游可用 |
| 3000端口被占用 | 修改 `.env` 的 `PORT`，并同步 `SITE_URL`；重新运行Compose |
| Google/GitHub按钮没有开放 | 读者登录开关、Client ID/Secret、域名回调；管理员登录是另一套账号 |
| 改了配置没生效 | 使用 `docker compose up -d` 重建受影响的容器，而不只是刷新网页 |
| 要看服务错误 | `docker compose logs --tail=80 api web worker`；分享前脱敏 |

不要执行 `docker compose down -v` 来“重启”，它会删除持久化数据卷。更新前先备份并验证恢复；同机备份不能替代异地副本。

## 继续阅读

[架构](architecture.md) · [信源接入](sources.md) · [分类](categories.md) · [精选与恢复](selection.md) · [部署](deploy.md) · [维护](maintenance.md) · [安全报告](../SECURITY.md)
