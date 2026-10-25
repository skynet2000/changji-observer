# Agent-Reach 与信源复查

2026-10-26，使用 [Agent-Reach](https://github.com/Panniantong/Agent-Reach) 辅助复查公开订阅目录和职场社区。它是维护时使用的检索工具，**不是本站模型，也不是网站的运行依赖**。安装工具不代表其全部渠道已经接通。

## 本次安装与权限

- 固定上游提交 `14c213405669414492bda0f8d52cc6531d062c45`，CLI 版本 `1.6.0`；使用 Python 3.12 独立虚拟环境。
- 本机安装目录 `.data/agent-reach-20261026/venv/`，项目工具入口 `.data/tooling/bin/agent-reach`。进入仓库后执行 `export PATH="$PWD/.data/tooling/bin:$PATH"`，再运行 `agent-reach version`。
- 来自指定 GitHub 源码，未安装 PyPI 上的同名项目。依赖兼容性检查通过；完整环境与诊断结果仅保存在忽略目录 `.data/`。
- 本轮只使用公开 GitHub REST、V2EX API 和 Jina 网页读取。没有运行上游 `setup`、`add` 或 `login`，没有安装浏览器、插件或注册上游技能，没有导入浏览器 Cookie、登录会话或本站密钥。CLI 自身会在 `~/.agent-reach/` 保存诊断状态。
- GitHub 公开项目读取与 V2EX 职场节点实测成功；Jina 无密钥读取返回 HTTP 401，未启用认证或其他后端作为替代。这一失败不能归咎于所有目标媒体，也不能把渠道能力清单当成连通证明。

示例（使用公开后端，不触发浏览器登录）：

```bash
agent-reach version
env -u GH_TOKEN -u GITHUB_TOKEN agent-reach github read fuxiaoai/tidings-rss --backend github-api
agent-reach v2ex node career --limit 8 --backend v2ex-api
```

公开接口可能限流或失效；本轮没有开启 X、微博、小红书登录采集。上游默认安装流程具有额外工具安装和浏览器会话复用能力，不能未经复核直接作为生产采集任务运行。可选浏览器渠道不在本次代码审查与验收范围内。

## 新增入口与用途

| 来源 | 网站适配器 | 范围及边界 |
| --- | --- | --- |
| [投中网](https://www.chinaventure.com.cn/) | HTML 直连 | 企业与人才报道；按详情页发布时间读取，不能用文章 URL 中的日期代替正文时间。VC、传统制造及初创宣传仍需准入复核。 |
| [时代周报科技](https://www.time-weekly.com/category/12) | HTML 直连 | 读取有日期的栏目列表，排除置顶旧推荐；保留互联网企业、平台业务及员工相关候选。 |
| [蓝鲸新闻](https://www.lanjinger.com/) | 页面内公开 JSON | 保留互联网商业候选；文章 ID 用字符串处理，使用原始发布秒时间，不把访问量当热度独立信源。 |
| [创业邦](https://wechat2rss.bestblogs.dev/feed/f5e0d8e342d9e2ec5b2942f08522cfaec17acc8d.xml) | 第三方 RSS | 地址来自 [BestBlogs OPML](https://github.com/ginobefun/BestBlogs/blob/main/opml/bestblogs_wechat2rss_opml_all.opml)，不是媒体官方 RSS；与既有公众号入口共享桥接依赖。汇总稿不意味着其中所有行业都可收录。 |
| [V2EX 职场](https://www.v2ex.com/go/career) | 公开 JSON API | **仅隔离线索**（`participation_mode=isolated`），不生成公开稿、不参与热点；用户自述不是已核实公司事实。接单、设备问答等泛节点不接入。 |

上述五个入口已分别在本机和首尔现有采集器预览；生产启用仍按正常发布、初始化和实际采集结果核对。预览成功只证明当时可读取，不能保证后续持续可用。

前四个是公开信息流的候选来源，V2EX 是内部待核实线索，二者数量应分开报告。每个新入口首次最多导入 2 条，限定近一个月并保留原文时间；轮询基准 120 分钟，失败继续使用原退避。既有相关性预筛、事件归组、摘要引用和全文许可边界不变，自动精选仍暂停。

## 没有启用的候选

- 部分企业 IR RSS 返回 403/404，或证书校验失败；没有关闭 TLS 校验、绕过访问限制或把空页面计为已接通。
- 硅星人 Pro 的公开桥接可读，但本轮样本偏工具、硬件和项目推广，不为增加数量而启用。
- X 免费公开直连覆盖仍有限；微博、小红书继续限已核验大厂官方账号，不因安装工具扩大为个人博主采集。

每次增加信源，应先看真实标题、正文、链接与日期，再用本站适配器预览，最后经模型准入与归组。公开 RSS 目录只是发现入口的线索，不是自动全量导入名单。
