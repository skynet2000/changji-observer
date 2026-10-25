# 参与大厂观察

本仓库维护面向互联网中大厂职场人的大厂观察网站，基于AIHOT定制并保留其MIT许可。请把本项目的反馈提交到[本仓库Issues](https://github.com/skynet2000/changji-observer/issues/new/choose)，安全问题按[安全说明](SECURITY.md)私密报告。

## 欢迎的贡献

- 可复现的界面、交互、采集、归组、翻译与出刊问题。
- 有公开出处、许可与时间信息的信源建议；配置入口不等于已验证稳定可用。
- 文档、部署体验、无障碍与测试改进。
- 大改产品范围、分类、模型门槛或账号权限之前，先说明场景。职场重点、内容边界与已有人工标注不能随意覆盖。

如果要向原AIHOT项目贡献通用框架能力，请另行阅读其[贡献说明](https://github.com/KKKKhazix/AIHOT/blob/main/CONTRIBUTING.md)，不要把本站专属需求默认提交给上游。

## 本地准备

1. Fork本仓库，从`main`创建工作分支。
2. 按[上手教程](docs/quick-start.md)启动自己的实例，阅读[AGENTS.md](AGENTS.md)及改动相关文档。
3. 使用自己的私有凭据和独立测试数据库。测试不连接生产站或真实付费供应商，不提交`.env`、私钥、数据库、读者记录或含敏感信息的截图。
4. 纯文档改动核对链接、命令与实际渲染；代码改动完成以下检查：

```bash
npm ci
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/dachang_test npm test
npm run build -w @aihot/web
npx playwright install chromium webkit
node --test apps/web/tests/*.test.ts
python3 -m unittest discover -s deploy/tests
# 自己的站点已启动后：
node scripts/smoke.ts --base http://localhost:3000
```

测试账号需要建库权限，数据库名必须以`_test`或`_ci`结尾。`npm test`会为每个文件创建独立副本；单独跑数据库测试时也要使用隔离库/测试引导，不能把临时样本写入下一轮完整测试使用的模板。浏览器在Linux上可能还需安装系统依赖。密钥检查见[安全说明](SECURITY.md)。

## 提交PR

- 一次改动解决一个明确问题，说明最终行为、验证结果与兼容影响；页面改动附匿名截图。
- 改了配置或使用方式，同步更新README、`.env.example`及对应文档。数据库迁移遵守[在线迁移约定](docs/architecture.md#数据库迁移)，不修改已发布迁移。
- 采集、分类或归组改动应提供真实公开材料的前后对照，区分开发样本与独立验收，不能编造准确率。
- 不因分类、改名或归组删除用户收藏、人工标注和历史刊物快照。第三方新闻与素材遵循各自许可。
- 贡献代码继续使用[MIT许可证](LICENSE)，保留原作者版权声明和[第三方说明](NOTICE)。

本仓库不提供生产服务器权限、共享模型Key或新闻全文授权。维护者会评估PR，不承诺全部合并或固定处理时间。
