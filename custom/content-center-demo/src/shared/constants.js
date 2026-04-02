/**
 * 文件说明：该文件定义整木网编辑中台服务端的共享常量。
 * 功能说明：集中维护服务地址、数据路径、状态枚举、日志类型与角色常量。
 *
 * 结构概览：
 *   第一部分：基础路径与服务配置
 *   第二部分：状态与角色常量
 *   第三部分：抓取与日志常量
 */

const path = require("path");

// ========== 第一部分：基础路径与服务配置 ==========
const PORT = Number(process.env.PORT || 3210);
const HOST = "0.0.0.0";
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const LEGACY_DATA_FILE = path.join(DATA_DIR, "state.json");
const DB_FILE = path.join(DATA_DIR, "content-center.sqlite");
const SESSION_COOKIE = "content_center_session";

const AI_ENV_CONFIG = {
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
  defaultModel: process.env.DEEPSEEK_DEFAULT_MODEL || "deepseek-chat",
  reasonerModel: process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner",
  temperature: Number(process.env.DEEPSEEK_TEMPERATURE || 0.7),
  maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 1200),
  timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT || 30000)
};

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

// ========== 第二部分：状态与角色常量 ==========
const ARTICLE_STATUS = {
  PENDING_REVIEW: "待审核",
  EDITING: "编辑中",
  PENDING_APPROVAL: "待复审",
  APPROVED: "已通过",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
  REJECTED: "已驳回"
};

const PUBLISH_STATUS = {
  UNPUBLISHED: "未发布",
  PENDING: "待发布",
  PUBLISHED: "已发布"
};

const DUPLICATE_STATUS = {
  PASSED: "通过",
  SUSPECTED: "疑似重复",
  DUPLICATE: "重复"
};

const TASK_STATUS = {
  RUNNING: "执行中",
  COMPLETED: "已完成"
};

const SOURCE_TYPES = {
  SITE: "网站",
  MEDIA_PAGE: "自媒体网页",
  MANUAL_LINK: "手动链接"
};

const KEYWORD_TYPES = {
  INDUSTRY: "行业词",
  PRODUCT: "产品词",
  SCENARIO: "场景词",
  PROBLEM: "问题词",
  BRAND: "品牌词"
};

const ROLES = {
  ADMIN: "admin",
  EDITOR: "editor",
  REVIEWER: "reviewer",
  VIEWER: "viewer"
};

// ========== 第三部分：抓取与日志常量 ==========
const LOG_TYPES = {
  LOGIN: "登录日志",
  CONFIG: "配置日志",
  CRAWL: "抓取日志",
  AI: "AI 日志",
  EDIT: "编辑日志",
  REVIEW: "审核日志",
  PUBLISH: "发布日志",
  ARCHIVE: "归档日志"
};

const FAILURE_STAGES = {
  CRAWL: "白名单抓取",
  MATCH: "关键词命中",
  PREVIEW: "提取预览"
};

module.exports = {
  AI_ENV_CONFIG,
  ARTICLE_STATUS,
  CONTENT_TYPES,
  DATA_DIR,
  DB_FILE,
  DUPLICATE_STATUS,
  FAILURE_STAGES,
  HOST,
  KEYWORD_TYPES,
  LEGACY_DATA_FILE,
  LOG_TYPES,
  PORT,
  PUBLIC_DIR,
  PUBLISH_STATUS,
  ROLES,
  ROOT_DIR,
  SESSION_COOKIE,
  SOURCE_TYPES,
  TASK_STATUS
};
