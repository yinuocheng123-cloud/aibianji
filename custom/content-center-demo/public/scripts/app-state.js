/**
 * 文件说明：该文件实现整木网编辑中台前台脚本的全局状态定义。
 * 功能说明：负责维护状态枚举、运行时状态对象与页面节点引用。
 *
 * 结构概览：
 *   第一部分：状态枚举
 *   第二部分：运行时状态
 *   第三部分：页面节点引用
 */

// ========== 第一部分：状态枚举 ==========
const DEFAULT_STATUS_ENUMS = {
  articleStatus: {
    PENDING_REVIEW: "待审核",
    EDITING: "编辑中",
    PENDING_APPROVAL: "待复审",
    APPROVED: "已通过",
    PUBLISHED: "已发布",
    ARCHIVED: "已归档",
    REJECTED: "已驳回"
  },
  publishStatus: {
    UNPUBLISHED: "未发布",
    PENDING: "待发布",
    PUBLISHED: "已发布"
  },
  duplicateStatus: {
    PASSED: "通过",
    SUSPECTED: "疑似重复",
    DUPLICATE: "重复"
  }
};

const STATUS_FILTER_ORDER = [
  "PENDING_REVIEW",
  "EDITING",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
  "REJECTED"
];

// ========== 第二部分：运行时状态 ==========
const appState = {
  sessionUser: null,
  sessionToken: "",
  dashboard: null,
  sourceSites: [],
  keywords: [],
  categories: [],
  tasks: [],
  articles: [],
  logs: [],
  crawlFailures: [],
  aiSettings: null,
  statusEnums: DEFAULT_STATUS_ENUMS,
  sourcePreview: null,
  selectedArticleId: null,
  selectedArticleIds: [],
  reviewQueueIds: [],
  editingSourceId: null,
  editingKeywordId: null,
  filters: {
    search: "",
    status: "",
    sourceId: "",
    keyword: ""
  }
};

// ========== 第三部分：页面节点引用 ==========
const elements = {
  loginOverlay: document.querySelector("#login-overlay"),
  loginForm: document.querySelector("#login-form"),
  loginUsername: document.querySelector("#login-username"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  logoutButton: document.querySelector("#logout-button"),
  sessionSummary: document.querySelector("#session-summary"),
  statsGrid: document.querySelector("#stats-grid"),
  taskSource: document.querySelector("#task-source"),
  taskKeywordList: document.querySelector("#task-keyword-list"),
  taskKeepSuspected: document.querySelector("#task-keep-suspected"),
  runTaskButton: document.querySelector("#run-task-button"),
  taskList: document.querySelector("#task-list"),
  sourceId: document.querySelector("#source-id"),
  sourceName: document.querySelector("#source-name"),
  sourceDomain: document.querySelector("#source-domain"),
  sourceType: document.querySelector("#source-type"),
  sourceEntryUrl: document.querySelector("#source-entry-url"),
  sourceInterval: document.querySelector("#source-interval"),
  sourceEnabled: document.querySelector("#source-enabled"),
  sourceParseRule: document.querySelector("#source-parse-rule"),
  sourceExcludeRule: document.querySelector("#source-exclude-rule"),
  discoverButton: document.querySelector("#discover-button"),
  discoverStatus: document.querySelector("#discover-status"),
  previewSourceButton: document.querySelector("#preview-source-button"),
  saveSourceButton: document.querySelector("#save-source-button"),
  resetSourceButton: document.querySelector("#reset-source-button"),
  sourceList: document.querySelector("#source-list"),
  sourcePreview: document.querySelector("#source-preview"),
  sourcePreviewTitle: document.querySelector("#source-preview-title"),
  sourcePreviewMeta: document.querySelector("#source-preview-meta"),
  sourcePreviewBody: document.querySelector("#source-preview-body"),
  keywordId: document.querySelector("#keyword-id"),
  keywordName: document.querySelector("#keyword-name"),
  keywordType: document.querySelector("#keyword-type"),
  keywordPriority: document.querySelector("#keyword-priority"),
  keywordCategory: document.querySelector("#keyword-category"),
  keywordEnabled: document.querySelector("#keyword-enabled"),
  keywordExclude: document.querySelector("#keyword-exclude"),
  keywordRemark: document.querySelector("#keyword-remark"),
  saveKeywordButton: document.querySelector("#save-keyword-button"),
  resetKeywordButton: document.querySelector("#reset-keyword-button"),
  keywordList: document.querySelector("#keyword-list"),
  aiSettingsStatus: document.querySelector("#ai-settings-status"),
  aiApiKey: document.querySelector("#ai-api-key"),
  aiBaseUrl: document.querySelector("#ai-base-url"),
  aiDefaultModel: document.querySelector("#ai-default-model"),
  aiReasonerModel: document.querySelector("#ai-reasoner-model"),
  aiTemperature: document.querySelector("#ai-temperature"),
  aiMaxTokens: document.querySelector("#ai-max-tokens"),
  aiTimeout: document.querySelector("#ai-timeout"),
  saveAiSettingsButton: document.querySelector("#save-ai-settings-button"),
  failureList: document.querySelector("#failure-list"),
  filterSearch: document.querySelector("#filter-search"),
  filterStatus: document.querySelector("#filter-status"),
  filterSource: document.querySelector("#filter-source"),
  filterKeyword: document.querySelector("#filter-keyword"),
  selectionSummary: document.querySelector("#selection-summary"),
  selectAllButton: document.querySelector("#select-all-button"),
  clearSelectedButton: document.querySelector("#clear-selected-button"),
  batchForwardButton: document.querySelector("#batch-forward-button"),
  sendToWorkbenchButton: document.querySelector("#send-to-workbench-button"),
  articleList: document.querySelector("#article-list"),
  reviewQueue: document.querySelector("#review-queue"),
  publishBoardSummary: document.querySelector("#publish-board-summary"),
  publishBoardList: document.querySelector("#publish-board-list"),
  detailEmpty: document.querySelector("#detail-empty"),
  detailPanel: document.querySelector("#detail-panel"),
  detailStatus: document.querySelector("#detail-status"),
  detailSource: document.querySelector("#detail-source"),
  detailUrl: document.querySelector("#detail-url"),
  detailTime: document.querySelector("#detail-time"),
  detailSimilarity: document.querySelector("#detail-similarity"),
  originalTitle: document.querySelector("#original-title"),
  cleanText: document.querySelector("#clean-text"),
  newTitle: document.querySelector("#new-title"),
  summary: document.querySelector("#summary"),
  rewrittenContent: document.querySelector("#rewritten-content"),
  category: document.querySelector("#category"),
  tags: document.querySelector("#tags"),
  seoTitle: document.querySelector("#seo-title"),
  seoDescription: document.querySelector("#seo-description"),
  sourceNote: document.querySelector("#source-note"),
  reviewComment: document.querySelector("#review-comment"),
  publishResult: document.querySelector("#publish-result"),
  aiHistory: document.querySelector("#ai-history"),
  saveButton: document.querySelector("#save-button"),
  submitButton: document.querySelector("#submit-button"),
  keepDuplicateButton: document.querySelector("#keep-duplicate-button"),
  approveButton: document.querySelector("#approve-button"),
  rejectButton: document.querySelector("#reject-button"),
  publishButton: document.querySelector("#publish-button"),
  directForwardButton: null,
  archiveButton: document.querySelector("#archive-button"),
  statTemplate: document.querySelector("#stat-template")
};
