/**
 * 文件说明：该文件实现整木网编辑中台的本地状态存储层。
 * 功能说明：负责默认数据、SQLite 关系表初始化、旧数据迁移、状态规范化与持久化。
 *
 * 结构概览：
 *   第一部分：默认状态与乱码修正
 *   第二部分：SQLite 读写工具
 *   第三部分：状态存储工厂
 */

const fs = require("fs");
const initSqlJs = require("sql.js");
const {
  AI_ENV_CONFIG,
  ARTICLE_STATUS,
  DATA_DIR,
  DB_FILE,
  DUPLICATE_STATUS,
  FAILURE_STAGES,
  KEYWORD_TYPES,
  LEGACY_DATA_FILE,
  LOG_TYPES,
  PUBLISH_STATUS,
  ROLES,
  SOURCE_TYPES,
  TASK_STATUS
} = require("../shared/constants");
const {
  createId,
  normalizeNumber,
  nowText,
  safeJsonParse,
  sha256,
  sortByTimeDesc
} = require("../shared/utils");

// ========== 第一部分：默认状态与乱码修正 ==========
function ensureDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function createDefaultAiSettings() {
  return {
    apiKey: "",
    baseUrl: AI_ENV_CONFIG.baseUrl,
    defaultModel: AI_ENV_CONFIG.defaultModel,
    reasonerModel: AI_ENV_CONFIG.reasonerModel,
    temperature: AI_ENV_CONFIG.temperature,
    maxTokens: AI_ENV_CONFIG.maxTokens,
    timeoutMs: AI_ENV_CONFIG.timeoutMs,
    lastUpdatedAt: "",
    lastUpdatedBy: ""
  };
}

const DEFAULT_USER_DISPLAY_NAMES = {
  [ROLES.ADMIN]: "系统管理员",
  [ROLES.EDITOR]: "内容编辑",
  [ROLES.REVIEWER]: "审核员",
  [ROLES.VIEWER]: "运营查看"
};

const ARTICLE_STATUS_RULES = [
  { match: "寰呭", value: ARTICLE_STATUS.PENDING_REVIEW },
  { match: "缂栬緫涓", value: ARTICLE_STATUS.EDITING },
  { match: "寰呭瀹", value: ARTICLE_STATUS.PENDING_APPROVAL },
  { match: "宸查€氳繃", value: ARTICLE_STATUS.APPROVED },
  { match: "宸插彂甯", value: ARTICLE_STATUS.PUBLISHED },
  { match: "宸插綊妗", value: ARTICLE_STATUS.ARCHIVED },
  { match: "宸查┏鍥", value: ARTICLE_STATUS.REJECTED }
];

const PUBLISH_STATUS_RULES = [
  { match: "鏈彂甯", value: PUBLISH_STATUS.UNPUBLISHED },
  { match: "寰呭彂甯", value: PUBLISH_STATUS.PENDING },
  { match: "宸插彂甯", value: PUBLISH_STATUS.PUBLISHED }
];

const DUPLICATE_STATUS_RULES = [
  { match: "閫氳繃", value: DUPLICATE_STATUS.PASSED },
  { match: "鐤戜技閲嶅", value: DUPLICATE_STATUS.SUSPECTED },
  { match: "閲嶅", value: DUPLICATE_STATUS.DUPLICATE }
];

const TASK_STATUS_RULES = [
  { match: "鎵ц涓", value: TASK_STATUS.RUNNING },
  { match: "宸插畬鎴", value: TASK_STATUS.COMPLETED }
];

const SOURCE_TYPE_RULES = [
  { match: "缃戠珯", value: SOURCE_TYPES.SITE },
  { match: "鑷獟浣撶綉椤", value: SOURCE_TYPES.MEDIA_PAGE },
  { match: "鎵嬪姩閾炬帴", value: SOURCE_TYPES.MANUAL_LINK }
];

const KEYWORD_TYPE_RULES = [
  { match: "琛屼笟璇", value: KEYWORD_TYPES.INDUSTRY },
  { match: "浜у搧璇", value: KEYWORD_TYPES.PRODUCT },
  { match: "鍦烘櫙璇", value: KEYWORD_TYPES.SCENARIO },
  { match: "闂璇", value: KEYWORD_TYPES.PROBLEM },
  { match: "鍝佺墝璇", value: KEYWORD_TYPES.BRAND }
];

const LOG_TYPE_RULES = [
  { match: "鐧诲綍鏃ュ織", value: LOG_TYPES.LOGIN },
  { match: "閰嶇疆鏃ュ織", value: LOG_TYPES.CONFIG },
  { match: "鎶撳彇鏃ュ織", value: LOG_TYPES.CRAWL },
  { match: "AI 鏃ュ織", value: LOG_TYPES.AI },
  { match: "缂栬緫鏃ュ織", value: LOG_TYPES.EDIT },
  { match: "瀹℃牳鏃ュ織", value: LOG_TYPES.REVIEW },
  { match: "鍙戝竷鏃ュ織", value: LOG_TYPES.PUBLISH },
  { match: "褰掓。鏃ュ織", value: LOG_TYPES.ARCHIVE }
];

const FAILURE_STAGE_RULES = [
  { match: "鐧藉悕鍗曟姄鍙", value: FAILURE_STAGES.CRAWL },
  { match: "鍏抽敭璇嶅懡涓", value: FAILURE_STAGES.MATCH },
  { match: "鎻愬彇棰勮", value: FAILURE_STAGES.PREVIEW }
];

const AI_HISTORY_TYPE_RULES = [
  { match: "鎽樿", value: "摘要" },
  { match: "鏍囬", value: "标题" },
  { match: "鏀瑰啓", value: "改写" },
  { match: "鎵╁啓", value: "扩写" }
];

const CORRUPTED_MARKERS = [
  "鏁存湪",
  "缂栬緫",
  "鎶撳彇",
  "鍏抽敭",
  "鐧诲綍",
  "寰呭",
  "宸插",
  "鏉ユ簮",
  "鍐呭",
  "鍙戝竷",
  "鎻愬彇",
  "鏈",
  "璇峰",
  "琛屼笟",
  "鏀瑰啓"
];

const SEED_SOURCE_FIXTURES = {
  1: {
    name: "整木行业观察",
    sourceType: SOURCE_TYPES.SITE,
    crawlInterval: "每天 09:00",
    parseRule: "article .content-body",
    excludeRule: ".ad,.recommend-list",
    lastResult: "最近一次抓取 3 条，新增 2 条。"
  }
};

const SEED_CATEGORY_FIXTURES = {
  1: "整木快讯",
  2: "整木智造",
  3: "整木材料",
  4: "品牌观察"
};

const SEED_KEYWORD_FIXTURES = {
  101: {
    keyword: "整木定制",
    keywordType: KEYWORD_TYPES.INDUSTRY,
    excludeWords: "招聘,培训",
    remark: "重点追踪整木行业趋势"
  },
  102: {
    keyword: "智能开料",
    keywordType: KEYWORD_TYPES.PRODUCT,
    excludeWords: "二手",
    remark: "关注设备与产线升级"
  }
};

const SEED_ARTICLE_FIXTURES = {
  5001: {
    originalTitle: "整木定制门店开始把设计与交付节点拉到同一套系统内",
    sourceName: "整木行业观察",
    authorName: "行业编辑部",
    rawText: "整木定制门店开始把设计、拆单和交付节点放进统一流程系统。",
    cleanText: "整木定制门店开始把设计、拆单和交付节点放进统一流程系统，目的是缩短返工周期并提升交付稳定性。",
    hitKeywords: ["整木定制"],
    assignedEditor: DEFAULT_USER_DISPLAY_NAMES[ROLES.EDITOR],
    newTitle: "整木定制门店正在把设计与交付协同拉到一条系统链路中",
    summary: "整木定制门店开始通过统一流程系统打通设计、拆单和交付。",
    rewrittenContent: "整木定制门店的数字化动作正在从单点工具试用，转向更完整的流程协同。",
    tags: ["整木定制", "交付协同"],
    seoTitle: "整木定制门店加速打通设计与交付协同",
    seoDescription: "聚焦整木定制门店如何用统一流程系统降低返工、提升交付效率。",
    sourceNote: "来源已保留，后续发布需保留原始链接与原始时间。"
  }
};

const SEED_LOG_FIXTURES = {
  9001: {
    type: LOG_TYPES.CRAWL,
    message: "任务“晨间白名单抓取”执行完成，新增 1 条线索。"
  }
};

function looksCorrupted(value) {
  const text = String(value || "");
  return CORRUPTED_MARKERS.some((marker) => text.includes(marker));
}

function normalizeByRules(value, rules, fallback = "") {
  const text = String(value || "").trim();
  if (!text) {
    return fallback;
  }
  const matchedRule = rules.find((rule) => text.includes(rule.match));
  return matchedRule ? matchedRule.value : text;
}

function repairFixtureRecord(record, fixture, fields) {
  if (!record || !fixture) {
    return record;
  }
  const needsRepair = fields.some((field) => !record[field] || looksCorrupted(record[field]));
  return needsRepair ? { ...record, ...fixture } : record;
}

function inferKeepSuspectedDuplicates(task) {
  if (typeof task.keepSuspectedDuplicates === "boolean") {
    return task.keepSuspectedDuplicates;
  }

  const logText = String(task.logText || "");
  if (logText.includes("疑似重复保留：关闭")) {
    return false;
  }
  if (logText.includes("疑似重复保留：开启")) {
    return true;
  }
  return true;
}

function createDefaultState() {
  return {
    users: [
      { id: 1, username: "admin", displayName: DEFAULT_USER_DISPLAY_NAMES[ROLES.ADMIN], role: ROLES.ADMIN, passwordHash: sha256("admin123"), status: "enabled" },
      { id: 2, username: "editor", displayName: DEFAULT_USER_DISPLAY_NAMES[ROLES.EDITOR], role: ROLES.EDITOR, passwordHash: sha256("editor123"), status: "enabled" },
      { id: 3, username: "reviewer", displayName: DEFAULT_USER_DISPLAY_NAMES[ROLES.REVIEWER], role: ROLES.REVIEWER, passwordHash: sha256("reviewer123"), status: "enabled" },
      { id: 4, username: "viewer", displayName: DEFAULT_USER_DISPLAY_NAMES[ROLES.VIEWER], role: ROLES.VIEWER, passwordHash: sha256("viewer123"), status: "enabled" }
    ],
    sourceSites: [
      {
        id: 1,
        name: "整木行业观察",
        domain: "news.wood.example.com",
        sourceType: SOURCE_TYPES.SITE,
        entryUrl: "https://news.wood.example.com/industry",
        enabled: true,
        crawlInterval: "每天 09:00",
        parseRule: "article .content-body",
        excludeRule: ".ad,.recommend-list",
        lastResult: "最近一次抓取 3 条，新增 2 条。",
        createdAt: "2026-04-01 08:00:00",
        updatedAt: "2026-04-01 08:00:00"
      }
    ],
    categories: [
      { id: 1, name: "整木快讯", portalCategoryId: 301 },
      { id: 2, name: "整木智造", portalCategoryId: 302 },
      { id: 3, name: "整木材料", portalCategoryId: 303 },
      { id: 4, name: "品牌观察", portalCategoryId: 304 }
    ],
    keywords: [
      { id: 101, keyword: "整木定制", keywordType: KEYWORD_TYPES.INDUSTRY, priority: 10, categoryId: 1, enabled: true, excludeWords: "招聘,培训", remark: "重点追踪整木行业趋势", hitCount: 1, createdAt: "2026-04-01 08:10:00", updatedAt: "2026-04-01 08:10:00" },
      { id: 102, keyword: "智能开料", keywordType: KEYWORD_TYPES.PRODUCT, priority: 8, categoryId: 2, enabled: true, excludeWords: "二手", remark: "关注设备与产线升级", hitCount: 1, createdAt: "2026-04-01 08:10:00", updatedAt: "2026-04-01 08:10:00" }
    ],
    tasks: [],
    articles: [
      {
        id: 5001,
        sourceId: 1,
        originalTitle: "整木定制门店开始把设计与交付节点拉到同一套系统内",
        originalUrl: "https://news.wood.example.com/simulated/1-101",
        sourceName: "整木行业观察",
        authorName: "行业编辑部",
        publishTime: "2026-04-01 08:35:00",
        crawlTime: "2026-04-01 09:00:02",
        rawText: "整木定制门店开始把设计、拆单和交付节点放进统一流程系统。",
        cleanText: "整木定制门店开始把设计、拆单和交付节点放进统一流程系统，目的是缩短返工周期并提升交付稳定性。",
        coverImage: "",
        hitKeywords: ["整木定制"],
        duplicateStatus: DUPLICATE_STATUS.PASSED,
        similarityScore: 34,
        recommendedCategoryId: 1,
        status: ARTICLE_STATUS.PENDING_REVIEW,
        assignedEditor: DEFAULT_USER_DISPLAY_NAMES[ROLES.EDITOR],
        reviewer: "",
        newTitle: "整木定制门店正在把设计与交付协同拉到一条系统链路中",
        summary: "整木定制门店开始通过统一流程系统打通设计、拆单和交付。",
        rewrittenContent: "整木定制门店的数字化动作正在从单点工具试用，转向更完整的流程协同。",
        tags: ["整木定制", "交付协同"],
        seoTitle: "整木定制门店加速打通设计与交付协同",
        seoDescription: "聚焦整木定制门店如何用统一流程系统降低返工、提升交付效率。",
        sourceNote: "来源已保留，后续发布需保留原始链接与原始时间。",
        reviewComment: "",
        aiHistory: [{ id: 1, type: "摘要", model: "deepseek-chat", createdAt: "2026-04-01 09:05:00" }],
        publishStatus: PUBLISH_STATUS.UNPUBLISHED,
        portalArticleId: "",
        portalUrl: "",
        createdAt: "2026-04-01 09:00:02",
        updatedAt: "2026-04-01 09:05:00"
      }
    ],
    logs: [
      { id: 9001, type: LOG_TYPES.CRAWL, message: "任务“晨间白名单抓取”执行完成，新增 1 条线索。", createdAt: "2026-04-01 09:00:12" }
    ],
    crawlFailures: [],
    aiSettings: createDefaultAiSettings()
  };
}

function mergeState(rawState) {
  const defaultState = createDefaultState();
  const nextState = {
    users: Array.isArray(rawState.users) && rawState.users.length ? rawState.users : defaultState.users,
    sourceSites: Array.isArray(rawState.sourceSites) && rawState.sourceSites.length ? rawState.sourceSites : defaultState.sourceSites,
    categories: Array.isArray(rawState.categories) && rawState.categories.length ? rawState.categories : defaultState.categories,
    keywords: Array.isArray(rawState.keywords) && rawState.keywords.length ? rawState.keywords : defaultState.keywords,
    tasks: Array.isArray(rawState.tasks) ? rawState.tasks : defaultState.tasks,
    articles: Array.isArray(rawState.articles) ? rawState.articles : defaultState.articles,
    logs: Array.isArray(rawState.logs) ? rawState.logs : defaultState.logs,
    crawlFailures: Array.isArray(rawState.crawlFailures) ? rawState.crawlFailures : [],
    aiSettings: {
      ...defaultState.aiSettings,
      ...(rawState.aiSettings || {})
    }
  };

  nextState.users = nextState.users.map((user) => ({
    ...user,
    displayName: !user.displayName || looksCorrupted(user.displayName) ? DEFAULT_USER_DISPLAY_NAMES[user.role] || user.displayName : user.displayName
  }));

  nextState.sourceSites = nextState.sourceSites
    .map((source) => ({
      ...source,
      sourceType: normalizeByRules(source.sourceType, SOURCE_TYPE_RULES, SOURCE_TYPES.SITE),
      crawlInterval: !source.crawlInterval || looksCorrupted(source.crawlInterval) ? "每天 09:00" : source.crawlInterval,
      lastResult: !source.lastResult || looksCorrupted(source.lastResult) ? "最近一次抓取已完成，请查看任务记录。" : source.lastResult
    }))
    .map((source) => repairFixtureRecord(source, SEED_SOURCE_FIXTURES[source.id], ["name", "sourceType", "crawlInterval", "lastResult"]));

  nextState.categories = nextState.categories.map((category) => ({
    ...category,
    name: looksCorrupted(category.name) && SEED_CATEGORY_FIXTURES[category.id] ? SEED_CATEGORY_FIXTURES[category.id] : category.name
  }));

  nextState.keywords = nextState.keywords
    .map((keyword) => ({
      ...keyword,
      keywordType: normalizeByRules(keyword.keywordType, KEYWORD_TYPE_RULES, KEYWORD_TYPES.INDUSTRY),
      excludeWords: looksCorrupted(keyword.excludeWords) ? "" : keyword.excludeWords,
      remark: looksCorrupted(keyword.remark) ? "" : keyword.remark
    }))
    .map((keyword) => repairFixtureRecord(keyword, SEED_KEYWORD_FIXTURES[keyword.id], ["keyword", "keywordType", "excludeWords", "remark"]));

  nextState.tasks = nextState.tasks.map((task) => ({
    ...task,
    keywordIds: Array.isArray(task.keywordIds) ? task.keywordIds.map(Number) : [],
    taskType: !task.taskType || looksCorrupted(task.taskType) ? "手动抓取" : task.taskType,
    status: normalizeByRules(task.status, TASK_STATUS_RULES, TASK_STATUS.RUNNING),
    logText: looksCorrupted(task.logText) ? "任务已执行，请查看最新抓取结果。" : task.logText,
    keepSuspectedDuplicates: inferKeepSuspectedDuplicates(task)
  }));

  nextState.articles = nextState.articles
    .map((article) => ({
      ...article,
      hitKeywords: Array.isArray(article.hitKeywords) ? article.hitKeywords : [],
      tags: Array.isArray(article.tags) ? article.tags : [],
      aiHistory: Array.isArray(article.aiHistory)
        ? article.aiHistory.map((history) => ({
            ...history,
            type: normalizeByRules(history.type, AI_HISTORY_TYPE_RULES, history.type || "摘要")
          }))
        : [],
      duplicateStatus: normalizeByRules(article.duplicateStatus, DUPLICATE_STATUS_RULES, DUPLICATE_STATUS.PASSED),
      status: normalizeByRules(article.status, ARTICLE_STATUS_RULES, ARTICLE_STATUS.PENDING_REVIEW),
      publishStatus: normalizeByRules(article.publishStatus, PUBLISH_STATUS_RULES, PUBLISH_STATUS.UNPUBLISHED),
      sourceName: looksCorrupted(article.sourceName) ? "整木行业观察" : article.sourceName,
      authorName: looksCorrupted(article.authorName) ? "行业编辑部" : article.authorName,
      assignedEditor: looksCorrupted(article.assignedEditor) ? DEFAULT_USER_DISPLAY_NAMES[ROLES.EDITOR] : article.assignedEditor,
      reviewer: looksCorrupted(article.reviewer) ? "" : article.reviewer,
      sourceNote: looksCorrupted(article.sourceNote) ? "来源已保留，后续发布需保留原始链接与原始时间。" : article.sourceNote
    }))
    .map((article) => repairFixtureRecord(article, SEED_ARTICLE_FIXTURES[article.id], [
      "originalTitle",
      "sourceName",
      "authorName",
      "rawText",
      "cleanText",
      "newTitle",
      "summary",
      "rewrittenContent",
      "seoTitle",
      "seoDescription",
      "sourceNote"
    ]));

  nextState.logs = sortByTimeDesc(
    nextState.logs
      .map((log) => ({
        ...log,
        type: normalizeByRules(log.type, LOG_TYPE_RULES, LOG_TYPES.CONFIG),
        message: looksCorrupted(log.message) && SEED_LOG_FIXTURES[log.id] ? SEED_LOG_FIXTURES[log.id].message : log.message
      }))
      .map((log) => repairFixtureRecord(log, SEED_LOG_FIXTURES[log.id], ["type", "message"])),
    "createdAt"
  ).slice(0, 120);

  nextState.crawlFailures = sortByTimeDesc(
    nextState.crawlFailures.map((failure) => ({
      ...failure,
      stage: normalizeByRules(failure.stage, FAILURE_STAGE_RULES, FAILURE_STAGES.CRAWL),
      sourceName: looksCorrupted(failure.sourceName) ? "预览抓取源" : failure.sourceName,
      message: looksCorrupted(failure.message) ? "抓取失败，请查看详情。" : failure.message
    })),
    "createdAt"
  ).slice(0, 80);

  return nextState;
}

function loadLegacyState() {
  ensureDirectory(DATA_DIR);
  if (!fs.existsSync(LEGACY_DATA_FILE)) {
    return createDefaultState();
  }
  return mergeState(safeJsonParse(fs.readFileSync(LEGACY_DATA_FILE, "utf8"), {}));
}

// ========== 第二部分：SQLite 读写工具 ==========
function createStateStore() {
  let sqlModule = null;
  let sqliteDatabase = null;
  let state = createDefaultState();

  function readRows(query, params = []) {
    const statement = sqliteDatabase.prepare(query);
    statement.bind(params);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    statement.free();
    return rows;
  }

  function readScalar(query, params = [], fallback = 0) {
    const rows = readRows(query, params);
    if (!rows.length) {
      return fallback;
    }
    const firstKey = Object.keys(rows[0])[0];
    return rows[0][firstKey];
  }

  function exportDatabase() {
    const buffer = Buffer.from(sqliteDatabase.export());
    fs.writeFileSync(DB_FILE, buffer);
  }

  function createDatabaseTables() {
    sqliteDatabase.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_sites (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        source_type TEXT NOT NULL,
        entry_url TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        crawl_interval TEXT NOT NULL,
        parse_rule TEXT NOT NULL,
        exclude_rule TEXT NOT NULL,
        last_result TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        portal_category_id INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS keywords (
        id INTEGER PRIMARY KEY,
        keyword TEXT NOT NULL,
        keyword_type TEXT NOT NULL,
        priority INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        enabled INTEGER NOT NULL,
        exclude_words TEXT NOT NULL,
        remark TEXT NOT NULL,
        hit_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crawl_tasks (
        id INTEGER PRIMARY KEY,
        task_name TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        success_count INTEGER NOT NULL,
        fail_count INTEGER NOT NULL,
        duplicate_count INTEGER NOT NULL,
        log_text TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_keywords (
        task_id INTEGER NOT NULL,
        keyword_id INTEGER NOT NULL,
        PRIMARY KEY (task_id, keyword_id)
      );
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY,
        source_id INTEGER NOT NULL,
        original_title TEXT NOT NULL,
        original_url TEXT NOT NULL,
        source_name TEXT NOT NULL,
        author_name TEXT NOT NULL,
        publish_time TEXT NOT NULL,
        crawl_time TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        clean_text TEXT NOT NULL,
        cover_image TEXT NOT NULL,
        duplicate_status TEXT NOT NULL,
        similarity_score INTEGER NOT NULL,
        recommended_category_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        assigned_editor TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        new_title TEXT NOT NULL,
        summary TEXT NOT NULL,
        rewritten_content TEXT NOT NULL,
        seo_title TEXT NOT NULL,
        seo_description TEXT NOT NULL,
        source_note TEXT NOT NULL,
        review_comment TEXT NOT NULL,
        publish_status TEXT NOT NULL,
        portal_article_id TEXT NOT NULL,
        portal_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS article_keywords (
        article_id INTEGER NOT NULL,
        keyword_text TEXT NOT NULL,
        PRIMARY KEY (article_id, keyword_text)
      );
      CREATE TABLE IF NOT EXISTS article_tags (
        article_id INTEGER NOT NULL,
        tag_text TEXT NOT NULL,
        PRIMARY KEY (article_id, tag_text)
      );
      CREATE TABLE IF NOT EXISTS article_ai_history (
        id INTEGER PRIMARY KEY,
        article_id INTEGER NOT NULL,
        ai_type TEXT NOT NULL,
        model_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crawl_failures (
        id INTEGER PRIMARY KEY,
        task_id INTEGER NOT NULL,
        source_id INTEGER NOT NULL,
        keyword_id INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        keyword_text TEXT NOT NULL,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_state (
        collection_name TEXT PRIMARY KEY,
        payload_text TEXT NOT NULL
      );
    `);
  }

  function hasRelationalRows() {
    return ["users", "source_sites", "categories", "keywords"].some(
      (tableName) => Number(readScalar(`SELECT COUNT(*) AS total FROM ${tableName}`, [], 0)) > 0
    );
  }

  function hasLegacySnapshotRows() {
    return Number(readScalar("SELECT COUNT(*) AS total FROM app_state", [], 0)) > 0;
  }

  function readSnapshotStateFromDatabase() {
    const rows = readRows("SELECT collection_name, payload_text FROM app_state");
    const dbState = {};
    rows.forEach((row) => {
      dbState[row.collection_name] = safeJsonParse(row.payload_text, []);
    });
    return mergeState(dbState);
  }

  function buildAiSettingsMap(aiSettings) {
    return {
      apiKey: aiSettings.apiKey || "",
      baseUrl: aiSettings.baseUrl || "",
      defaultModel: aiSettings.defaultModel || "",
      reasonerModel: aiSettings.reasonerModel || "",
      temperature: String(aiSettings.temperature ?? ""),
      maxTokens: String(aiSettings.maxTokens ?? ""),
      timeoutMs: String(aiSettings.timeoutMs ?? ""),
      lastUpdatedAt: aiSettings.lastUpdatedAt || "",
      lastUpdatedBy: aiSettings.lastUpdatedBy || ""
    };
  }

  // ========== 第三部分：状态存储工厂 ==========
  function loadStateFromDatabase() {
    const users = readRows("SELECT id, username, display_name, role, password_hash, status FROM users ORDER BY id ASC").map((row) => ({
      id: Number(row.id),
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      passwordHash: row.password_hash,
      status: row.status
    }));

    const sourceSites = readRows("SELECT id, name, domain, source_type, entry_url, enabled, crawl_interval, parse_rule, exclude_rule, last_result, created_at, updated_at FROM source_sites ORDER BY id DESC").map((row) => ({
      id: Number(row.id),
      name: row.name,
      domain: row.domain,
      sourceType: row.source_type,
      entryUrl: row.entry_url,
      enabled: Boolean(Number(row.enabled)),
      crawlInterval: row.crawl_interval,
      parseRule: row.parse_rule,
      excludeRule: row.exclude_rule,
      lastResult: row.last_result,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const categories = readRows("SELECT id, name, portal_category_id FROM categories ORDER BY id ASC").map((row) => ({
      id: Number(row.id),
      name: row.name,
      portalCategoryId: Number(row.portal_category_id)
    }));

    const keywords = readRows("SELECT id, keyword, keyword_type, priority, category_id, enabled, exclude_words, remark, hit_count, created_at, updated_at FROM keywords ORDER BY priority DESC, id DESC").map((row) => ({
      id: Number(row.id),
      keyword: row.keyword,
      keywordType: row.keyword_type,
      priority: Number(row.priority),
      categoryId: Number(row.category_id),
      enabled: Boolean(Number(row.enabled)),
      excludeWords: row.exclude_words,
      remark: row.remark,
      hitCount: Number(row.hit_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const taskKeywordMap = new Map();
    readRows("SELECT task_id, keyword_id FROM task_keywords").forEach((row) => {
      const taskId = Number(row.task_id);
      const list = taskKeywordMap.get(taskId) || [];
      list.push(Number(row.keyword_id));
      taskKeywordMap.set(taskId, list);
    });

    const tasks = readRows("SELECT id, task_name, source_id, source_name, task_type, status, start_time, end_time, success_count, fail_count, duplicate_count, log_text FROM crawl_tasks ORDER BY start_time DESC").map((row) => ({
      id: Number(row.id),
      taskName: row.task_name,
      sourceId: Number(row.source_id),
      sourceName: row.source_name,
      keywordIds: taskKeywordMap.get(Number(row.id)) || [],
      taskType: row.task_type,
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      successCount: Number(row.success_count),
      failCount: Number(row.fail_count),
      duplicateCount: Number(row.duplicate_count),
      logText: row.log_text,
      keepSuspectedDuplicates: inferKeepSuspectedDuplicates({ logText: row.log_text })
    }));

    const articleKeywordMap = new Map();
    readRows("SELECT article_id, keyword_text FROM article_keywords ORDER BY article_id ASC").forEach((row) => {
      const articleId = Number(row.article_id);
      const list = articleKeywordMap.get(articleId) || [];
      list.push(row.keyword_text);
      articleKeywordMap.set(articleId, list);
    });

    const articleTagMap = new Map();
    readRows("SELECT article_id, tag_text FROM article_tags ORDER BY article_id ASC").forEach((row) => {
      const articleId = Number(row.article_id);
      const list = articleTagMap.get(articleId) || [];
      list.push(row.tag_text);
      articleTagMap.set(articleId, list);
    });

    const aiHistoryMap = new Map();
    readRows("SELECT id, article_id, ai_type, model_name, created_at FROM article_ai_history ORDER BY created_at DESC").forEach((row) => {
      const articleId = Number(row.article_id);
      const list = aiHistoryMap.get(articleId) || [];
      list.push({ id: Number(row.id), type: row.ai_type, model: row.model_name, createdAt: row.created_at });
      aiHistoryMap.set(articleId, list);
    });

    const articles = readRows("SELECT id, source_id, original_title, original_url, source_name, author_name, publish_time, crawl_time, raw_text, clean_text, cover_image, duplicate_status, similarity_score, recommended_category_id, status, assigned_editor, reviewer, new_title, summary, rewritten_content, seo_title, seo_description, source_note, review_comment, publish_status, portal_article_id, portal_url, created_at, updated_at FROM articles ORDER BY crawl_time DESC").map((row) => ({
      id: Number(row.id),
      sourceId: Number(row.source_id),
      originalTitle: row.original_title,
      originalUrl: row.original_url,
      sourceName: row.source_name,
      authorName: row.author_name,
      publishTime: row.publish_time,
      crawlTime: row.crawl_time,
      rawText: row.raw_text,
      cleanText: row.clean_text,
      coverImage: row.cover_image,
      hitKeywords: articleKeywordMap.get(Number(row.id)) || [],
      duplicateStatus: row.duplicate_status,
      similarityScore: Number(row.similarity_score),
      recommendedCategoryId: Number(row.recommended_category_id),
      status: row.status,
      assignedEditor: row.assigned_editor,
      reviewer: row.reviewer,
      newTitle: row.new_title,
      summary: row.summary,
      rewrittenContent: row.rewritten_content,
      tags: articleTagMap.get(Number(row.id)) || [],
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      sourceNote: row.source_note,
      reviewComment: row.review_comment,
      aiHistory: aiHistoryMap.get(Number(row.id)) || [],
      publishStatus: row.publish_status,
      portalArticleId: row.portal_article_id,
      portalUrl: row.portal_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const logs = readRows("SELECT id, type, message, created_at FROM logs ORDER BY created_at DESC").map((row) => ({
      id: Number(row.id),
      type: row.type,
      message: row.message,
      createdAt: row.created_at
    }));

    const crawlFailures = readRows("SELECT id, task_id, source_id, keyword_id, source_name, keyword_text, stage, message, created_at FROM crawl_failures ORDER BY created_at DESC").map((row) => ({
      id: Number(row.id),
      taskId: Number(row.task_id),
      sourceId: Number(row.source_id),
      keywordId: Number(row.keyword_id),
      sourceName: row.source_name,
      keyword: row.keyword_text,
      stage: row.stage,
      message: row.message,
      createdAt: row.created_at
    }));

    const aiSettingsMap = {};
    readRows("SELECT setting_key, setting_value FROM ai_settings").forEach((row) => {
      aiSettingsMap[row.setting_key] = row.setting_value;
    });

    return mergeState({
      users,
      sourceSites,
      categories,
      keywords,
      tasks,
      articles,
      logs,
      crawlFailures,
      aiSettings: {
        apiKey: aiSettingsMap.apiKey || "",
        baseUrl: aiSettingsMap.baseUrl || "",
        defaultModel: aiSettingsMap.defaultModel || "",
        reasonerModel: aiSettingsMap.reasonerModel || "",
        temperature: normalizeNumber(aiSettingsMap.temperature, AI_ENV_CONFIG.temperature),
        maxTokens: normalizeNumber(aiSettingsMap.maxTokens, AI_ENV_CONFIG.maxTokens),
        timeoutMs: normalizeNumber(aiSettingsMap.timeoutMs, AI_ENV_CONFIG.timeoutMs),
        lastUpdatedAt: aiSettingsMap.lastUpdatedAt || "",
        lastUpdatedBy: aiSettingsMap.lastUpdatedBy || ""
      }
    });
  }

  function writeStateToDatabase() {
    sqliteDatabase.run("BEGIN TRANSACTION;");
    [
      "task_keywords",
      "article_keywords",
      "article_tags",
      "article_ai_history",
      "crawl_failures",
      "logs",
      "articles",
      "crawl_tasks",
      "keywords",
      "categories",
      "source_sites",
      "users",
      "ai_settings"
    ].forEach((tableName) => {
      sqliteDatabase.run(`DELETE FROM ${tableName};`);
    });

    let statement = sqliteDatabase.prepare("INSERT INTO users (id, username, display_name, role, password_hash, status) VALUES (?, ?, ?, ?, ?, ?);");
    state.users.forEach((user) => {
      statement.run([user.id, user.username, user.displayName, user.role, user.passwordHash, user.status]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO source_sites (id, name, domain, source_type, entry_url, enabled, crawl_interval, parse_rule, exclude_rule, last_result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
    state.sourceSites.forEach((source) => {
      statement.run([
        source.id,
        source.name,
        source.domain,
        source.sourceType,
        source.entryUrl,
        source.enabled ? 1 : 0,
        source.crawlInterval,
        source.parseRule || "",
        source.excludeRule || "",
        source.lastResult || "",
        source.createdAt,
        source.updatedAt
      ]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO categories (id, name, portal_category_id) VALUES (?, ?, ?);");
    state.categories.forEach((category) => {
      statement.run([category.id, category.name, category.portalCategoryId]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO keywords (id, keyword, keyword_type, priority, category_id, enabled, exclude_words, remark, hit_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
    state.keywords.forEach((keyword) => {
      statement.run([
        keyword.id,
        keyword.keyword,
        keyword.keywordType,
        keyword.priority,
        keyword.categoryId,
        keyword.enabled ? 1 : 0,
        keyword.excludeWords || "",
        keyword.remark || "",
        keyword.hitCount || 0,
        keyword.createdAt,
        keyword.updatedAt
      ]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO crawl_tasks (id, task_name, source_id, source_name, task_type, status, start_time, end_time, success_count, fail_count, duplicate_count, log_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
    state.tasks.forEach((task) => {
      statement.run([
        task.id,
        task.taskName,
        task.sourceId,
        task.sourceName,
        task.taskType,
        task.status,
        task.startTime,
        task.endTime || "",
        task.successCount || 0,
        task.failCount || 0,
        task.duplicateCount || 0,
        task.logText || ""
      ]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO task_keywords (task_id, keyword_id) VALUES (?, ?);");
    state.tasks.forEach((task) => {
      (task.keywordIds || []).forEach((keywordId) => statement.run([task.id, keywordId]));
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO articles (id, source_id, original_title, original_url, source_name, author_name, publish_time, crawl_time, raw_text, clean_text, cover_image, duplicate_status, similarity_score, recommended_category_id, status, assigned_editor, reviewer, new_title, summary, rewritten_content, seo_title, seo_description, source_note, review_comment, publish_status, portal_article_id, portal_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);");
    state.articles.forEach((article) => {
      statement.run([
        article.id,
        article.sourceId,
        article.originalTitle,
        article.originalUrl,
        article.sourceName,
        article.authorName,
        article.publishTime,
        article.crawlTime,
        article.rawText || "",
        article.cleanText || "",
        article.coverImage || "",
        article.duplicateStatus || DUPLICATE_STATUS.PASSED,
        article.similarityScore || 0,
        article.recommendedCategoryId || 1,
        article.status || ARTICLE_STATUS.PENDING_REVIEW,
        article.assignedEditor || "",
        article.reviewer || "",
        article.newTitle || "",
        article.summary || "",
        article.rewrittenContent || "",
        article.seoTitle || "",
        article.seoDescription || "",
        article.sourceNote || "",
        article.reviewComment || "",
        article.publishStatus || PUBLISH_STATUS.UNPUBLISHED,
        article.portalArticleId || "",
        article.portalUrl || "",
        article.createdAt || "",
        article.updatedAt || ""
      ]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO article_keywords (article_id, keyword_text) VALUES (?, ?);");
    state.articles.forEach((article) => {
      (article.hitKeywords || []).forEach((keywordText) => statement.run([article.id, keywordText]));
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO article_tags (article_id, tag_text) VALUES (?, ?);");
    state.articles.forEach((article) => {
      (article.tags || []).forEach((tagText) => statement.run([article.id, tagText]));
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO article_ai_history (id, article_id, ai_type, model_name, created_at) VALUES (?, ?, ?, ?, ?);");
    state.articles.forEach((article) => {
      (article.aiHistory || []).forEach((history) => statement.run([history.id || createId(), article.id, history.type, history.model, history.createdAt]));
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO logs (id, type, message, created_at) VALUES (?, ?, ?, ?);");
    state.logs.forEach((log) => {
      statement.run([log.id, log.type, log.message, log.createdAt]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO crawl_failures (id, task_id, source_id, keyword_id, source_name, keyword_text, stage, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);");
    state.crawlFailures.forEach((failure) => {
      statement.run([
        failure.id,
        failure.taskId || 0,
        failure.sourceId || 0,
        failure.keywordId || 0,
        failure.sourceName || "",
        failure.keyword || "",
        failure.stage || "",
        failure.message || "",
        failure.createdAt || nowText()
      ]);
    });
    statement.free();

    statement = sqliteDatabase.prepare("INSERT INTO ai_settings (setting_key, setting_value) VALUES (?, ?);");
    Object.entries(buildAiSettingsMap(state.aiSettings || createDefaultAiSettings())).forEach(([key, value]) => {
      statement.run([key, String(value ?? "")]);
    });
    statement.free();

    sqliteDatabase.run("COMMIT;");
    exportDatabase();
  }

  async function initialize() {
    ensureDirectory(DATA_DIR);
    sqlModule = await initSqlJs();
    sqliteDatabase = fs.existsSync(DB_FILE)
      ? new sqlModule.Database(fs.readFileSync(DB_FILE))
      : new sqlModule.Database();
    createDatabaseTables();

    if (hasRelationalRows()) {
      state = loadStateFromDatabase();
      writeStateToDatabase();
      return;
    }
    if (hasLegacySnapshotRows()) {
      state = readSnapshotStateFromDatabase();
      writeStateToDatabase();
      return;
    }
    state = loadLegacyState();
    writeStateToDatabase();
  }

  function getState() {
    return state;
  }

  function saveState() {
    if (!sqliteDatabase) {
      return;
    }
    state.logs = sortByTimeDesc(state.logs, "createdAt").slice(0, 120);
    state.crawlFailures = sortByTimeDesc(state.crawlFailures, "createdAt").slice(0, 80);
    writeStateToDatabase();
  }

  function appendLog(type, message) {
    state.logs.unshift({ id: createId(), type, message, createdAt: nowText() });
  }

  function appendCrawlFailure({ taskId, sourceId, keywordId, sourceName, keyword, stage, message }) {
    state.crawlFailures.unshift({
      id: createId(),
      taskId: Number(taskId || 0),
      sourceId: Number(sourceId || 0),
      keywordId: Number(keywordId || 0),
      sourceName: sourceName || "",
      keyword: keyword || "",
      stage: stage || FAILURE_STAGES.CRAWL,
      message: message || "未知失败",
      createdAt: nowText()
    });
  }

  function getCategoryName(categoryId) {
    const category = state.categories.find((item) => item.id === Number(categoryId));
    return category ? category.name : "未分配";
  }

  return {
    appendCrawlFailure,
    appendLog,
    createDefaultAiSettings,
    getCategoryName,
    getState,
    initialize,
    saveState
  };
}

module.exports = {
  createDefaultAiSettings,
  createDefaultState,
  createStateStore
};
