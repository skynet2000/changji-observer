// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "industry", label: "大厂战略", feedLabel: "大厂战略", section: "大厂战略与经营", guide: "仅限互联网公司整体经营、集团战略、财报盈利、现金流、融资估值、上市、投资并购与股权控制。不是所有大厂新闻的兜底类。具体产品、市场扩张、补贴、增长和商业化竞争归对应业务类；组织人事与员工制度归组织人才。按主要新增事实区分，不因产品报道提到收入就归集团经营。观点与预测不当作事实。" },
  { key: "career", label: "组织人才", section: "组织与人才", guide: "互联网公司的裁员、部门撤并、管理层变动、招聘冻结、薪酬绩效、奖金晋升、人才流动、考勤制度、职场争议，以及有材料支持的职业规划、管理协作和员工处境分析。必须以人、组织或用工关系为主线，不因面向程序员、帮助工作提效或出现团队一词就归此类。保留适用范围与公开出处；员工自述、匿名爆料与未证实的裁员传闻明确归因并标注未证实，不改写成公司已确认事实。不采个人隐私与无出处的人身攻击。技术架构、系统扩容、工具用法和工程复盘归技术实践，政府劳动政策归政策。" },
  { key: "ai-products", label: "产品/AI", feedLabel: "产品与AI应用", section: "产品与AI应用", guide: "互联网产品、云服务、AI应用、工具、功能和API的发布更新，以及产品和平台的市场竞争；也包括短剧、游戏、内容、社交与搜索，不要求涉及AI。重点是用户入口、产品竞争、办公研发流程、价格、开放范围和商业化变化。内容平台分成与流量竞争归此类，不能仅因内容变现就归电商。购物交易或履约变化优先归相应业务栏目；模型本体发布归模型。" },
  { key: "ecommerce", label: "电商竞争", section: "电商竞争", guide: "货架、内容与跨境电商的业务布局、产品机制、增长、商业化和竞争。平台规则仅在体现业务战略、用户体验或行业结构变化时重点收录；单店投流、选品、开店、佣金操作手册不作为员工核心资讯。即时零售与履约归本地生活。" },
  { key: "local-life", label: "本地生活", section: "本地生活与即时零售", guide: "外卖、到店、酒旅、即时零售、配送网络的业务竞争、用户体验、增长、成本与履约效率。帮助员工理解公司战略和业务机制；不以商户入驻、店铺经营教程为核心。集团财报归战略，组织调整归组织人才。" },
  { key: "tip", label: "技术实践", section: "产品与技术实践", guide: "互联网产品与技术的工程复盘、系统架构、存储扩容、开发工具用法、数据分析方法与AI工作流。读者得到的是如何构建或使用产品、系统的方法，公开阅读栏目归业务竞争；不能因面向技术员工或帮助工作提效而归职场。以管理协作、职业规划、组织和员工处境为主线的材料归组织人才，产品发布归产品/AI。不收卖课、面试押题营销或商家开店教程。", commentary: true },
  { key: "opinion", label: "深度分析", section: "行业深度分析", guide: "历史兼容分类；新资料不得仅因分析、评论或访谈文体选择此类。按正文主线归集团经营、组织人才、产品/AI、电商竞争、本地生活或政策监管；分析属性保留在标签中。历史分类身份和订阅保持兼容。", commentary: true },
  { key: "policy", label: "政策监管", section: "政策与行业环境", guide: "对互联网业务与员工有实际影响的监管、反垄断、数据隐私、AI治理与劳动政策。区分征求意见、发布、实施；公司工作制度归组织人才，平台商家规则不冒充政府监管。" },
  { key: "ai-models", label: "模型", feedLabel: "AI 模型", section: "模型发布/更新", guide: "模型本身的发布、版本、权重开放、能力或价格变化，以及既有榜单上的模型成绩。公布一次跑分不是发布新基准，也不是教程。" },
  { key: "paper", label: "研究", feedLabel: "研究报告", section: "研究报告", guide: "历史兼容分类；新资料不因研究报告或论文的形式单独选此类。招聘薪酬研究归组织人才，财务资本研究归集团经营，用户与产品研究归对应业务类，监管研究归政策；方法、样本与限制仍需保留，内容形态用论文/研究等标签。" },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "ai-models", tag: "模型发布", unit: "个新模型" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "llm", "gpu", "agi", "ceo", "ipo", "gmv", "mau", "dau", "roi", "saas", "电商", "本地生活", "即时零售", "互联网"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "产品更新", "模型发布", "论文/研究", "开源/仓库", "教程/实践", "现象/趋势", "大佬观点", "评测/基准", "安全/对齐", "行业动态", "政策/监管",
  "非AI/通用工具", "其他", "平台规则", "经营数据", "组织战略",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "Agent", "编码", "推理", "多模态", "语音", "视频", "图像生成", "RAG", "端侧", "数据/训练", "搜索", "部署/工程", "开源生态", "具身智能", "MCP/工具调用",
  "电商", "本地生活", "即时零售", "外卖", "到店酒旅", "商家生态", "流量分发", "补贴佣金", "物流履约", "内容电商", "跨境出海", "广告商业化", "用户增长", "财报", "组织变动", "云计算", "AI应用", "数据隐私", "招聘趋势", "薪酬绩效", "工作制度", "职业发展", "协作管理", "AI工作流", "裁员", "人才流动", "职场争议", "未证实", "深度分析", "访谈", "全员信", "员工发声", "劳动权益",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["阿里巴巴", "淘宝天猫", "阿里云", "美团", "京东", "拼多多", "字节跳动", "小红书", "腾讯", "快手", "百度", "Amazon", "OpenAI", "Anthropic", "DeepSeek", "DeepMind", "Google", "Meta", "Microsoft", "xAI", "Hugging Face", "GitHub", "arXiv"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "教程/玩法": "教程/实践", "技巧/最佳实践": "教程/实践", "合作/生态": "行业动态", "融资/收购": "行业动态", "公司动态": "行业动态",
  合作: "行业动态", 生态: "行业动态", 融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态",
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 安全: "安全/对齐", 对齐: "安全/对齐",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", papers: "论文/研究",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库",
  教程: "教程/实践", 玩法: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 最佳实践: "教程/实践", 实践: "教程/实践",
  产品: "产品更新", 更新: "产品更新", 发布: "模型发布", 模型: "模型发布", 趋势: "现象/趋势", 现象: "现象/趋势", 观点: "大佬观点",
  视频生成: "视频", 非ai: "非AI/通用工具", "non-ai": "非AI/通用工具", 通用工具: "非AI/通用工具", 工程工具: "非AI/通用工具",
  安全扫描: "非AI/通用工具", devops: "非AI/通用工具", 行业: "行业动态", 动态: "行业动态",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是公司自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  alibaba: { name: "阿里巴巴", displayTag: "阿里巴巴", aliases: ["阿里巴巴", "Alibaba", "阿里集团", "阿里"], otherNames: ["Alibaba Group", "阿里巴巴集团"] },
  taotian: { name: "淘宝天猫", displayTag: "淘宝天猫", aliases: ["淘宝", "天猫", "淘天", "Taobao", "Tmall"], otherNames: ["淘天集团", "淘宝闪购"] },
  "alibaba-cloud": { name: "阿里云", displayTag: "阿里云", aliases: ["阿里云", "Alibaba Cloud", "Aliyun"] },
  eleme: { name: "饿了么", displayTag: null, aliases: ["饿了么", "Ele.me"] },
  amap: { name: "高德", displayTag: null, aliases: ["高德", "高德地图", "Amap", "AutoNavi"] },
  cainiao: { name: "菜鸟", displayTag: null, aliases: ["菜鸟", "菜鸟网络", "Cainiao"] },
  meituan: { name: "美团", displayTag: "美团", aliases: ["美团", "Meituan"], otherNames: ["大众点评", "美团闪购", "美团外卖", "Keeta"] },
  jd: { name: "京东", displayTag: "京东", aliases: ["京东", "JD.com"], otherNames: ["京东零售", "京东物流", "京东秒送", "京东外卖"] },
  pdd: { name: "拼多多 / PDD", displayTag: "拼多多", aliases: ["拼多多", "Pinduoduo", "PDD Holdings"], otherNames: ["Temu"] },
  bytedance: { name: "字节跳动 / 抖音", displayTag: "字节跳动", aliases: ["字节跳动", "ByteDance", "抖音", "TikTok"], otherNames: ["抖音电商", "抖音生活服务", "火山引擎", "豆包", "Doubao"] },
  xiaohongshu: { name: "小红书", displayTag: "小红书", aliases: ["小红书", "Xiaohongshu", "RedNote"] },
  tencent: { name: "腾讯", displayTag: "腾讯", aliases: ["腾讯", "Tencent", "微信", "WeChat"], otherNames: ["微信小店", "视频号"] },
  kuaishou: { name: "快手", displayTag: "快手", aliases: ["快手", "Kuaishou", "Kwai"] },
  baidu: { name: "百度", displayTag: "百度", aliases: ["百度", "Baidu", "文心"] },
  amazon: { name: "Amazon / AWS", displayTag: "Amazon", aliases: ["Amazon", "亚马逊", "AWS"] },
  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], otherNames: ["Claude Code"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], otherNames: ["Google DeepMind", "Google Research", "Google AI", "Google Labs", "Google Cloud"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "千问"], otherNames: ["通义千问", "千问APP", "Qwen Team", "通义实验室"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"], otherNames: ["Moonshot AI"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"], otherNames: ["稀宇科技"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"], otherNames: ["智谱AI", "Zhipu", "Zhipu AI"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], otherNames: ["SpaceXAI"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], otherNames: ["Meta AI", "AI at Meta"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"], otherNames: ["Microsoft Research", "Microsoft AI"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], otherNames: ["HuggingFace"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "alibaba", name: "阿里巴巴", patterns: [/阿里(?:巴巴|集团)?|\balibaba\b/i] },
  { id: "taotian", name: "淘宝天猫", patterns: [/淘宝|天猫|淘天|\btaobao\b|\btmall\b/i] },
  { id: "alibaba-cloud", name: "阿里云", patterns: [/阿里云|\balibaba\s+cloud\b|\baliyun\b/i] },
  { id: "eleme", name: "饿了么", patterns: [/饿了么|\bele\.me\b/i] },
  { id: "amap", name: "高德", patterns: [/高德|\bamap\b|\bautonavi\b/i] },
  { id: "cainiao", name: "菜鸟", patterns: [/菜鸟|\bcainiao\b/i] },
  { id: "meituan", name: "美团", patterns: [/美团|大众点评|\bmeituan\b|\bkeeta\b/i] },
  { id: "jd", name: "京东", patterns: [/京东|\bjd\.com\b/i] },
  { id: "pdd", name: "拼多多", patterns: [/拼多多|\bpinduoduo\b|\bpdd\b|\btemu\b/i] },
  { id: "bytedance", name: "字节跳动", patterns: [/字节跳动|抖音|\bbytedance\b|\btiktok\b/i] },
  { id: "xiaohongshu", name: "小红书", patterns: [/小红书|\bxiaohongshu\b|\brednote\b/i] },
  { id: "tencent", name: "腾讯", patterns: [/腾讯|微信|\btencent\b|\bwechat\b/i] },
  { id: "kuaishou", name: "快手", patterns: [/快手|\bkuaishou\b|\bkwai\b/i] },
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
