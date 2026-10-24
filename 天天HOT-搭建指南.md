# 天天HOT：从本地预览到正式上线

> 历史记录：本文保留当时的站名与配置，不代表当前运行状态。网站现名为「大厂观察」；当前操作请参阅维护说明（`docs/maintenance.md`，本目录内为 `maintenance.md`）。

## 当前进度（2026-10-13）

第一步已完成：从 https://github.com/KKKKhazix/AIHOT 克隆了项目（起点提交 `e36480d`），修改站名为「天天HOT」，完成依赖安装、数据库初始化、构建和本地启动。

- 首页：http://localhost:3000
- 管理后台：http://localhost:3000/admin
- 管理员密码：在本项目 `.env` 的 `ADMIN_PASSWORD` 中查看。
- 网站目前只在本机开放，没有部署到公网，也没有创建你的 GitHub 仓库。
- 第二步已完成：面向互联网大厂员工，重点关注阿里、电商与本地生活的业务变化。大厂战略、组织人才、产品/AI、职业成长栏目优先；已加入对应公司主题与行业筛选规则。
- 当前13个已核验来源：8家媒体的9个栏目（虎嗅、界面、钛媒体、第一财经、品玩、21世纪经济报道、TechNode、雷峰网），加4个企业官方来源。IT之家和少数派暂作备用，36氪与拼多多的候选入口尚未成功接入。中文媒体扩充见 `docs/tiantian-media-expansion.md`，官方来源核验见 `docs/tiantian-source-round2.md`。
- 站长已授权本地自动运行：每小时采集一次，DeepSeek费用滚动24小时上限0.5元。新增职场样本和费用保护见 `docs/tiantian-auto-workplace.md`；中文媒体扩充见 `docs/tiantian-media-expansion.md`。

## 本机怎么打开、关闭

在终端中进入项目：

```bash
cd '/Users/skynet/Documents/ChatGPT/信息流/tiantian-hot'
bash scripts/local.sh start
```

查看状态或关闭：

```bash
bash scripts/local.sh status
bash scripts/local.sh stop
```

需要保持终端会话运行时使用 `bash scripts/local.sh serve`。日志位于 `.data/logs/`。本次预览使用 Codex 的持续运行会话；会话结束或电脑重启后，可以重新启动。

本机工具安装在 `.data/tooling/`：npm 11.6.2，以及 `@embedded-postgres/darwin-arm64` 提供的 PostgreSQL 17.10 二进制。Node 24.19 使用 Codex 自带运行时，`.data/tooling/bin/node` 指向该运行时；如果 Codex 升级后该路径变化，需要重新指向可用的 Node 24.11+。这些是这台 Mac 的开发工具，不作为线上部署方案。

已补齐 PostgreSQL 17.10 的 `pg_dump` 与 `pg_restore`，放在 `.data/tooling/pg-client/` 并链接到工具目录，备份恢复测试已通过。本地数据库快照在 `.data/backups/tiantianhot-health-round5.dump`，尚未配置异地自动备份。

数据库监听 `127.0.0.1:55432`，数据放在 `.data/postgres/`；本地开发库使用 trust 验证，仅适用于这台开发机。正式部署使用项目 Docker 配置及随机数据库密码。不要删除 `.data/postgres/` 或把本机数据目录上传到 Git。

修改站点配置后重新构建并启动：

```bash
bash scripts/local.sh stop
export PATH="$PWD/.data/tooling/bin:$PATH"
npm run build -w @aihot/web
bash scripts/local.sh start
```

## 第二步：内容定位（已确定）

已确定面向互联网大厂员工，重点为阿里、电商与本地生活。主要看公司战略、组织人才、产品与AI、业务竞争、工作方式和职业成长；不以商家开店、选品、投流教程为核心，抑制营销与无依据传闻。详细范围和信源核验记录见 `docs/tiantian-editorial.md`。后续可以继续细化：

1. 首批关注的具体网站、RSS、公众号或账号。
2. 哪些内容值得精选，例如产品发布、技术进展、政策变化。
3. 哪些内容应过滤，例如重复转载、营销广告、无依据传言。
4. 首页栏目如何划分。

上述方向已经写入 `industry/sources.json`、`industry/taxonomy.ts`、`industry/topics.json` 和 `industry/prompts/`。上游门槛先保留，积累自己的标注样本后再校准。

## 第三步：接入模型（已完成首批试采）

已接通DeepSeek，完成9篇真实文章试采。结果、用量和后续安排见 `docs/tiantian-first-run.md`。以下配置说明供后续更换服务商时参考。

先确定你要使用的模型服务商。密钥只填本机 `.env`，不需要发到聊天里：

```dotenv
LLM_BASE_URL=服务商的兼容接口地址
LLM_API_KEY=你的密钥
LLM_MODEL=服务商提供的模型标识
```

服务商不同，`LLM_EXTRA_JSON`、推理额度和 JSON 模式可能需要调整，按其实际文档配置。不要直接假定上游示例适用于你的账户。

先验证接口并在后台设定请求上限，再开启少量已确认的信源；准备开始真实采集时，将两个开关设成 `true` 并重启。精选和日报需要真实内容经过处理后才会出现。

## 第四步：正式上线

确定你自己的代码仓库、服务器、域名和模型预算，再按 `docs/deploy.md` 的 Docker 方案部署。将 `SITE_URL` 改成真实域名，配置 HTTPS，验证持久化和备份恢复。

`site/pages/terms.md` 与 `site/pages/privacy.md` 当前仍是上游模板，正式上线前需要结合实际运营方式由你确认。正式上线日期也应更新到 `site/changelog.json`。

## 已做的验证

- TypeScript 类型检查：通过。
- 网页生产构建：通过。
- 网页测试：50 项通过，1 项跳过。新增空首页的手机/电脑展示、分类跳转与返回验证。
- 官方整站检查：30 项全部通过，含主要页面、API、RSS、MCP、分享图及图标。
- 后端测试：767 项全部通过，包含真实备份恢复、互联网公司身份保护、费用预留、仅当天取消限额、日报起刊与正文提取回归测试。
- 已确认首页1条真实精选、全部动态14篇，保留原始发布日期。栏目为大厂员工视角，日报报头为互联网方向。
- 首轮9篇模型样本后，已按最终定位排除Firefox、小众App与iOS家庭操作指南，补充官方和行业媒体样本。媒体扩充的六篇均通过行业与企业发展预筛；样本量仍有限，尚未完成站长标注和门槛校准。

验证日志位于 `.data/typecheck.log`、`.data/build.log`、`.data/web-tests.log`、`.data/backend-tests.log`、`.data/navigation-tests.log`、`.data/smoke.log`。

最新排障日志在 `.data/health-round5/`。站长后续授权2026-10-13当天模型费用不限额，设置`LLM_BUDGET_UNLIMITED_DATE=2026-10-13`，北京时间次日零点自动恢复原滚动24小时0.5元限制，今天的费用仍计入滚动窗口。详见`docs/tiantian-auto-workplace.md`。

本项目的 `.env`、`.data/`、`node_modules/` 和构建产物均已被 Git 忽略。保留了上游 MIT 许可和框架署名。
