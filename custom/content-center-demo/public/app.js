/**
 * 文件说明：该文件实现整木网编辑中台 MVP 的前端交互逻辑。
 * 功能说明：负责登录、加载数据、渲染仪表盘、维护抓取源与关键词、筛选内容、编辑审核与预览提取结果。
 *
 * 结构概览：
 *   第一部分：状态与基础工具
 *   第二部分：会话与渲染函数
 *   第三部分：业务动作与事件绑定
 */

// ========== 第一部分：状态与基础工具 ==========
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
  editingSourceId: null,
  editingKeywordId: null,
  filters: {
    search: "",
    status: "",
    sourceId: "",
    keyword: ""
  }
};

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
  articleList: document.querySelector("#article-list"),
  logList: document.querySelector("#log-list"),
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

async function request(url, options = {}, allowUnauthorized = false) {
  const sessionToken = getSessionToken();
  const mergedHeaders = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (sessionToken) {
    mergedHeaders["X-Session-Token"] = sessionToken;
  }

  const response = await fetch(url, {
    headers: mergedHeaders,
    credentials: "same-origin",
    ...options
  });

  if (response.status === 401 && !allowUnauthorized) {
    clearSessionToken();
    showLogin();
    throw new Error("请先登录");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "请求失败");
  }

  return result;
}

function reportClientEvent(type, message, extra = {}) {
  const payload = {
    type,
    message: String(message || ""),
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...extra
  };

  fetch("/api/client-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getSelectedArticle() {
  return appState.articles.find((item) => item.id === appState.selectedArticleId) || null;
}

function getCategoryById(categoryId) {
  return appState.categories.find((item) => Number(item.id) === Number(categoryId)) || null;
}

function getCategoryName(categoryId) {
  return getCategoryById(categoryId)?.name || "行业资讯";
}

function isEditorRole() {
  return ["admin", "editor"].includes(appState.sessionUser?.role);
}

function isReviewerRole() {
  return ["admin", "reviewer"].includes(appState.sessionUser?.role);
}

function canDecideDuplicate() {
  return ["admin", "editor", "reviewer"].includes(appState.sessionUser?.role);
}

function isAdminRole() {
  return appState.sessionUser?.role === "admin";
}

function getLatestFailureForSource(sourceId) {
  return appState.crawlFailures.find((item) => Number(item.sourceId) === Number(sourceId)) || null;
}

function getStatusEnums() {
  return appState.statusEnums || DEFAULT_STATUS_ENUMS;
}

function getStatusFilterOptions() {
  const { articleStatus } = getStatusEnums();
  return [
    { value: "", label: "全部状态" },
    ...STATUS_FILTER_ORDER
      .filter((key) => articleStatus[key])
      .map((key) => ({
        value: articleStatus[key],
        label: articleStatus[key]
      }))
  ];
}

function upsertHint(container, className, text, position = "afterbegin") {
  if (!container) {
    return null;
  }

  let node = container.querySelector(`.${className}`);
  if (!node) {
    node = document.createElement("p");
    node.className = `field-hint ${className}`;
    if (position === "beforeend") {
      container.append(node);
    } else {
      container.prepend(node);
    }
  }

  node.textContent = text;
  return node;
}

function ensureSourceTypeOption(select, value, label) {
  if (!select || Array.from(select.options).some((option) => option.value === value)) {
    return;
  }

  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function ensureDirectForwardButton() {
  if (elements.directForwardButton) {
    return elements.directForwardButton;
  }

  const toolbar = elements.saveButton?.parentElement;
  if (!toolbar) {
    return null;
  }

  const button = document.createElement("button");
  button.id = "direct-forward-button";
  button.type = "button";
  button.textContent = "直接转发到整木网资讯栏目";
  toolbar.prepend(button);
  elements.directForwardButton = button;
  return button;
}

function configureFrontstageLayout() {
  document.querySelectorAll('a[href="#ai-settings"], a[href="#failure-center"]').forEach((node) => node.remove());
  ["ai-settings", "failure-center"].forEach((id) => {
    const section = document.querySelector(`#${id}`);
    if (!section) {
      return;
    }
    section.classList.add("hidden");
    section.hidden = true;
    section.style.display = "none";
  });

  ensureSourceTypeOption(elements.sourceType, "公众号主页", "公众号主页");
  ensureSourceTypeOption(elements.sourceType, "公众号文章", "公众号文章");

  upsertHint(
    document.querySelector("#task-center .form-stack"),
    "task-structure-hint",
    "抓取任务由“抓取对象 + 关键词”组成，抓取对象可以是网站、公众号页面、公众号文章或手动录入链接。"
  );
  upsertHint(
    document.querySelector("#source-management .form-stack"),
    "source-structure-hint",
    "抓取源就是抓取对象，可按白名单持续新增、编辑和停用；当前演示重点是网站与公众号公开内容线索。"
  );
  upsertHint(
    document.querySelector("#keyword-management .form-stack"),
    "keyword-structure-hint",
    "关键词管理支持按行业词、产品词、场景词等维度增减维护，并与整木网资讯栏目建立推荐映射。"
  );
  upsertHint(
    document.querySelector("#content-pool"),
    "content-pool-hint",
    "内容池展示已抓取入库的文章线索。当前整木网先模拟 3 个资讯栏目：行业资讯、企业资讯、市场动态。选中后可直接转发，也可以先用 AI 编辑后再转发。",
    "beforeend"
  );

  const taskPill = document.querySelector("#task-center .pill");
  if (taskPill) {
    taskPill.textContent = "关键词 + 抓取对象";
  }

  const sourcePill = document.querySelector("#source-management .pill");
  if (sourcePill) {
    sourcePill.textContent = "抓取对象可增减";
  }

  const keywordPill = document.querySelector("#keyword-management .pill");
  if (keywordPill) {
    keywordPill.textContent = "关键词可增减";
  }

  const poolPill = document.querySelector("#content-pool .pill");
  if (poolPill) {
    poolPill.textContent = "直接转发 / AI 编辑后转发";
  }

  const categoryLabel = document.querySelector('label[for="category"]');
  if (categoryLabel) {
    categoryLabel.textContent = "整木网资讯栏目";
  }

  if (elements.detailEmpty) {
    elements.detailEmpty.textContent = "从内容池选择一篇文章后，这里会展示原文、AI 辅助结果、整木网资讯栏目选择和转发动作为主的工作流。";
  }

  if (elements.saveButton) {
    elements.saveButton.textContent = "保存 AI 编辑稿";
  }
  if (elements.submitButton) {
    elements.submitButton.textContent = "提交复审";
  }
  if (elements.publishButton) {
    elements.publishButton.textContent = "审核后转发到整木网资讯栏目";
  }

  const reviewTitle = document.querySelector("#editor-workbench .review-box h3");
  if (reviewTitle) {
    reviewTitle.textContent = "转发与审核";
  }

  ensureDirectForwardButton();
}

function selectArticle(articleId, options = {}) {
  appState.selectedArticleId = Number(articleId);
  renderArticles();
  renderDetail();

  if (options.scrollToWorkbench) {
    document.querySelector("#editor-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function createExcerpt(text, limit = 120) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trim()}...`;
}

function buildArticleDraftPayload(article, autofill = false) {
  const nextTitle = elements.newTitle.value.trim() || (autofill ? (article.newTitle || article.originalTitle || "") : "");
  const nextSummary = elements.summary.value.trim() || (autofill ? (article.summary || createExcerpt(article.cleanText, 110)) : "");
  const nextContent = elements.rewrittenContent.value.trim() || (autofill ? (article.rewrittenContent || article.cleanText || "") : "");
  const nextSourceNote = elements.sourceNote.value.trim() || (
    autofill ? (article.sourceNote || `来源：${article.sourceName}，原文链接与原发布时间已保留。`) : ""
  );
  const nextTags = elements.tags.value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    newTitle: nextTitle,
    summary: nextSummary,
    rewrittenContent: nextContent,
    tags: nextTags.length ? nextTags : (autofill ? [...(article.tags || []), ...(article.hitKeywords || [])].filter(Boolean) : []),
    seoTitle: elements.seoTitle.value.trim() || (autofill ? (article.seoTitle || nextTitle) : ""),
    seoDescription: elements.seoDescription.value.trim() || (autofill ? (article.seoDescription || createExcerpt(nextSummary || nextContent, 90)) : ""),
    sourceNote: nextSourceNote,
    recommendedCategoryId: Number(elements.category.value) || Number(article.recommendedCategoryId) || Number(appState.categories[0]?.id || 1)
  };
}

// ========== 第二部分：会话与渲染函数 ==========
function showLogin() {
  elements.loginOverlay.classList.remove("hidden");
  elements.loginOverlay.hidden = false;
  elements.loginOverlay.style.removeProperty("display");
  document.body.classList.add("overlay-open");
}

function showBootError(message) {
  elements.loginError.textContent = String(message || "页面初始化失败，请重试");
  reportClientEvent("boot_error", elements.loginError.textContent);
  showLogin();
}

function hideLogin() {
  elements.loginOverlay.classList.add("hidden");
  elements.loginOverlay.hidden = true;
  elements.loginOverlay.style.display = "none";
  elements.loginError.textContent = "";
  document.body.classList.remove("overlay-open");
}

function readStoredSessionToken() {
  try {
    return window.localStorage.getItem("content_center_session_token") || "";
  } catch (error) {
    return "";
  }
}

function syncSessionCookie(token) {
  const nextToken = String(token || "").trim();
  const cookieValue = nextToken
    ? `content_center_session=${encodeURIComponent(nextToken)}; path=/; SameSite=Lax`
    : "content_center_session=; Max-Age=0; path=/; SameSite=Lax";
  document.cookie = cookieValue;
}

function setSessionToken(token) {
  const nextToken = String(token || "").trim();
  appState.sessionToken = nextToken;
  syncSessionCookie(nextToken);
  try {
    if (nextToken) {
      window.localStorage.setItem("content_center_session_token", nextToken);
    } else {
      window.localStorage.removeItem("content_center_session_token");
    }
  } catch (error) {
    // localStorage 在部分嵌入式环境下可能不可用，这里保留内存兜底
  }
}

function clearSessionToken() {
  setSessionToken("");
}

function getSessionToken() {
  if (appState.sessionToken) {
    return appState.sessionToken;
  }

  const storedToken = readStoredSessionToken();
  if (storedToken) {
    appState.sessionToken = storedToken;
  }
  return appState.sessionToken;
}

function applyLoginQueryState() {
  const query = new URLSearchParams(window.location.search);
  const sessionToken = query.get("session_token");
  const loginError = query.get("login_error");

  if (sessionToken) {
    setSessionToken(sessionToken);
    query.delete("session_token");
  }

  if (!loginError && !sessionToken) {
    return;
  }

  if (loginError) {
    elements.loginError.textContent = loginError === "invalid_credentials" ? "用户名或密码错误" : "登录失败，请重试";
    showLogin();
    query.delete("login_error");
  }

  const nextQuery = query.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState(null, "", nextUrl);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  elements.loginError.textContent = "";

  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  const submitButton = elements.loginForm.querySelector('button[type="submit"]');

  if (!username || !password) {
    elements.loginError.textContent = "请输入用户名和密码";
    showLogin();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "登录中...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "登录失败，请重试");
    }

    if (result.sessionToken) {
      setSessionToken(result.sessionToken);
    }

    reportClientEvent("login_success", "login bootstrap received", {
      sessionUser: result.sessionUser?.username || username
    });

    if (result.sessionToken) {
      await loadBootstrap();
      return;
    }

    hideLogin();
    refreshData(result);
  } catch (error) {
    reportClientEvent("login_error", error.message, { username });
    elements.loginError.textContent = error.message || "登录失败，请重试";
    showLogin();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "登录进入中台";
  }
}

async function logout() {
  await request("/api/auth/logout", { method: "POST" }, true);
  clearSessionToken();
  appState.sessionUser = null;
  appState.sessionToken = "";
  appState.dashboard = null;
  appState.sourceSites = [];
  appState.keywords = [];
  appState.categories = [];
  appState.tasks = [];
  appState.articles = [];
  appState.logs = [];
  appState.crawlFailures = [];
  appState.aiSettings = null;
  appState.statusEnums = DEFAULT_STATUS_ENUMS;
  appState.sourcePreview = null;
  appState.selectedArticleId = null;
  renderAll();
  showLogin();
}

function renderSession() {
  if (!appState.sessionUser) {
    elements.sessionSummary.textContent = "未登录";
    return;
  }
  elements.sessionSummary.textContent = `${appState.sessionUser.displayName} / ${appState.sessionUser.role}`;
}

function renderStats() {
  elements.statsGrid.innerHTML = "";
  if (!appState.dashboard?.stats?.length) {
    return;
  }

  appState.dashboard.stats.forEach((item) => {
    const fragment = elements.statTemplate.content.cloneNode(true);
    fragment.querySelector(".stat-label").textContent = item.label;
    fragment.querySelector(".stat-value").textContent = item.value;
    fragment.querySelector(".stat-hint").textContent = item.hint;
    elements.statsGrid.appendChild(fragment);
  });
}

function renderCategoryOptions() {
  const currentKeywordCategory = elements.keywordCategory.value;
  const currentCategory = elements.category.value;
  const categoryOptions = appState.categories
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join("");

  elements.keywordCategory.innerHTML = categoryOptions;
  if (appState.categories.some((item) => String(item.id) === currentKeywordCategory)) {
    elements.keywordCategory.value = currentKeywordCategory;
  } else if (appState.categories[0]) {
    elements.keywordCategory.value = String(appState.categories[0].id);
  }

  elements.category.innerHTML = categoryOptions;
  const article = getSelectedArticle();
  const preferredCategory = article ? String(article.recommendedCategoryId || "") : currentCategory;
  if (appState.categories.some((item) => String(item.id) === preferredCategory)) {
    elements.category.value = preferredCategory;
  } else if (appState.categories[0]) {
    elements.category.value = String(appState.categories[0].id);
  }
}

function renderTaskForm() {
  elements.taskSource.innerHTML = appState.sourceSites
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.enabled ? "" : "（未启用）"}</option>`)
    .join("");

  elements.taskKeywordList.innerHTML = appState.keywords
    .map((item) => `
      <label class="check-item">
        <input type="checkbox" value="${item.id}" data-enabled="${item.enabled ? "1" : "0"}" ${item.enabled ? "" : "disabled"} />
        <span>${escapeHtml(item.keyword)}</span>
      </label>
    `)
    .join("");
}

function renderTasks() {
  elements.taskList.innerHTML = appState.tasks
    .map((task) => `
      <article class="stack-item">
        <div class="list-head">
          <h3>${escapeHtml(task.taskName)}</h3>
          <span class="status-badge ${task.status === "已完成" ? "good" : ""}">${escapeHtml(task.status)}</span>
        </div>
        <div class="meta-row">
          <span>${escapeHtml(task.sourceName)}</span>
          <span>${escapeHtml(task.taskType)}</span>
          <span>${task.keepSuspectedDuplicates === false ? "疑似重复跳过" : "疑似重复保留"}</span>
          <span>新增 ${task.successCount}</span>
          <span>重复 ${task.duplicateCount}</span>
          <span>失败 ${task.failCount || 0}</span>
        </div>
        <p class="note-text">${escapeHtml(task.logText || "")}</p>
      </article>
    `)
    .join("");
}

function renderSources() {
  elements.sourceList.innerHTML = appState.sourceSites
    .map((item) => {
      const latestFailure = getLatestFailureForSource(item.id);
      return `
        <article class="stack-item">
          <div class="list-head">
            <h3>${escapeHtml(item.name)}</h3>
            <button type="button" class="ghost-button" data-source-edit="${item.id}">编辑</button>
          </div>
          <div class="meta-row">
            <span>${escapeHtml(item.sourceType)}</span>
            <span>${escapeHtml(item.domain)}</span>
            <span>${item.enabled ? "已启用" : "未启用"}</span>
          </div>
          <p class="note-text">${escapeHtml(item.lastResult || "")}</p>
          <p class="note-text">${latestFailure ? `最近异常：${escapeHtml(latestFailure.stage)} / ${escapeHtml(latestFailure.message)}` : "最近无抓取失败"}</p>
        </article>
      `;
    })
    .join("");

  elements.sourceList.querySelectorAll("[data-source-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = appState.sourceSites.find((item) => item.id === Number(button.dataset.sourceEdit));
      if (!source) {
        return;
      }
      appState.editingSourceId = source.id;
      elements.sourceId.value = source.id;
      elements.sourceName.value = source.name;
      elements.sourceDomain.value = source.domain;
      elements.sourceType.value = source.sourceType;
      elements.sourceEntryUrl.value = source.entryUrl;
      elements.sourceInterval.value = source.crawlInterval;
      elements.sourceEnabled.checked = Boolean(source.enabled);
      elements.sourceParseRule.value = source.parseRule || "article";
      elements.sourceExcludeRule.value = source.excludeRule || "";
    });
  });
}

function renderSourcePreview() {
  if (!appState.sourcePreview) {
    elements.sourcePreview.classList.add("hidden");
    elements.sourcePreviewTitle.textContent = "";
    elements.sourcePreviewMeta.textContent = "";
    elements.sourcePreviewBody.textContent = "";
    return;
  }

  const preview = appState.sourcePreview;
  const metaParts = [];
  const responsePreview = String(preview.responsePreview || "").trim();
  if (preview.publishTime) {
    metaParts.push(preview.publishTime);
  }
  if (preview.extractionMode) {
    metaParts.push(preview.extractionMode);
  }
  if (preview.isFallback) {
    metaParts.push("失败兜底展示");
  }
  if (preview.errorMessage) {
    metaParts.push(preview.errorMessage);
  }

  let bodyText = preview.cleanText || preview.rawText || responsePreview || "暂无可展示内容";
  if (preview.isFallback && responsePreview && !bodyText.includes(responsePreview)) {
    bodyText = `${bodyText}\n\n原始响应摘要：\n${responsePreview}`;
  }

  elements.sourcePreview.classList.remove("hidden");
  elements.sourcePreviewTitle.textContent = preview.title || "未识别标题";
  elements.sourcePreviewMeta.textContent = metaParts.join(" / ");
  elements.sourcePreviewBody.textContent = bodyText;
}

function renderKeywords() {
  elements.keywordList.innerHTML = appState.keywords
    .map((item) => {
      const category = appState.categories.find((categoryItem) => categoryItem.id === Number(item.categoryId));
      return `
        <article class="stack-item">
          <div class="list-head">
            <h3>${escapeHtml(item.keyword)}</h3>
            <button type="button" class="ghost-button" data-keyword-edit="${item.id}">编辑</button>
          </div>
          <div class="meta-row">
            <span>${escapeHtml(item.keywordType)}</span>
            <span>优先级 ${item.priority}</span>
            <span>${category ? escapeHtml(category.name) : "未分配"}</span>
            <span>命中 ${item.hitCount}</span>
          </div>
          <p class="note-text">${escapeHtml(item.remark || "未填写备注")}</p>
        </article>
      `;
    })
    .join("");

  elements.keywordList.querySelectorAll("[data-keyword-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const keyword = appState.keywords.find((item) => item.id === Number(button.dataset.keywordEdit));
      if (!keyword) {
        return;
      }

      appState.editingKeywordId = keyword.id;
      elements.keywordId.value = keyword.id;
      elements.keywordName.value = keyword.keyword;
      elements.keywordType.value = keyword.keywordType;
      elements.keywordPriority.value = keyword.priority;
      elements.keywordCategory.value = keyword.categoryId;
      elements.keywordEnabled.checked = Boolean(keyword.enabled);
      elements.keywordExclude.value = keyword.excludeWords || "";
      elements.keywordRemark.value = keyword.remark || "";
    });
  });
}

function renderAiSettings() {
  if (!appState.aiSettings) {
    elements.aiSettingsStatus.textContent = "仅管理员可查看 AI 配置";
    elements.aiApiKey.value = "";
    elements.aiBaseUrl.value = "";
    elements.aiDefaultModel.value = "";
    elements.aiReasonerModel.value = "";
    elements.aiTemperature.value = "";
    elements.aiMaxTokens.value = "";
    elements.aiTimeout.value = "";
    return;
  }

  elements.aiSettingsStatus.textContent = `${appState.aiSettings.source} / API Key：${appState.aiSettings.apiKeyMasked}`;
  elements.aiApiKey.value = "";
  elements.aiApiKey.placeholder = appState.aiSettings.hasApiKey ? `当前：${appState.aiSettings.apiKeyMasked}` : "sk-...";
  elements.aiBaseUrl.value = appState.aiSettings.baseUrl || "";
  elements.aiDefaultModel.value = appState.aiSettings.defaultModel || "";
  elements.aiReasonerModel.value = appState.aiSettings.reasonerModel || "";
  elements.aiTemperature.value = appState.aiSettings.temperature ?? "";
  elements.aiMaxTokens.value = appState.aiSettings.maxTokens ?? "";
  elements.aiTimeout.value = appState.aiSettings.timeoutMs ?? "";
}

function renderFailures() {
  elements.failureList.innerHTML = appState.crawlFailures.length
    ? appState.crawlFailures
        .map((item) => `
          <article class="stack-item">
            <div class="list-head">
              <h3>${escapeHtml(item.sourceName || "未命名来源")}</h3>
              <span class="status-badge warn">${escapeHtml(item.stage || "抓取异常")}</span>
            </div>
            <p class="note-text">${escapeHtml(item.message || "")}</p>
            <div class="meta-row">
              <span>${escapeHtml(item.keyword || "未命中关键词")}</span>
              <span>${escapeHtml(item.createdAt || "")}</span>
            </div>
          </article>
        `)
        .join("")
    : `
        <article class="stack-item">
          <h3>暂无失败日志</h3>
          <p class="note-text">当前白名单抓取、正文提取与关键词命中链路暂未记录异常。</p>
        </article>
      `;
}

function renderFilterOptions() {
  elements.filterStatus.innerHTML = getStatusFilterOptions()
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");
  elements.filterSource.innerHTML = [
    '<option value="">全部来源</option>',
    ...appState.sourceSites.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
  ].join("");
  elements.filterKeyword.innerHTML = [
    '<option value="">全部关键词</option>',
    ...appState.keywords.map((item) => `<option value="${escapeHtml(item.keyword)}">${escapeHtml(item.keyword)}</option>`)
  ].join("");

  elements.filterStatus.value = appState.filters.status;
  elements.filterSource.value = appState.filters.sourceId;
  elements.filterKeyword.value = appState.filters.keyword;
}

function getFilteredArticles() {
  return appState.articles.filter((article) => {
    const matchSearch = !appState.filters.search || article.originalTitle.includes(appState.filters.search);
    const matchStatus = !appState.filters.status || article.status === appState.filters.status;
    const matchSource = !appState.filters.sourceId || Number(article.sourceId) === Number(appState.filters.sourceId);
    const matchKeyword = !appState.filters.keyword || article.hitKeywords.includes(appState.filters.keyword);
    return matchSearch && matchStatus && matchSource && matchKeyword;
  });
}

function getStatusClass(article) {
  const { articleStatus, duplicateStatus } = getStatusEnums();
  if (article.status === articleStatus.REJECTED) {
    return "danger";
  }
  if ([articleStatus.APPROVED, articleStatus.PUBLISHED, articleStatus.ARCHIVED].includes(article.status)) {
    return "good";
  }
  if (article.duplicateStatus !== duplicateStatus.PASSED) {
    return "warn";
  }
  return "";
}

function renderArticles() {
  const articleList = getFilteredArticles();
  elements.articleList.innerHTML = articleList
    .map((article) => {
      const category = appState.categories.find((item) => item.id === Number(article.recommendedCategoryId));
      const isActive = article.id === appState.selectedArticleId;
      const statusClass = getStatusClass(article);

      return `
        <article class="article-item ${isActive ? "active" : ""}" data-article-id="${article.id}">
          <h3>${escapeHtml(article.originalTitle)}</h3>
          <div class="meta-row">
            <span>${escapeHtml(article.sourceName)}</span>
            <span>${escapeHtml(article.publishTime)}</span>
            <span>命中：${escapeHtml(article.hitKeywords.join(" / "))}</span>
          </div>
          <div class="status-row">
            <span class="status-badge ${statusClass}">${escapeHtml(article.status)}</span>
            <span class="meta-row">
              <span>${escapeHtml(article.duplicateStatus)}</span>
              <span>相似度 ${article.similarityScore}%</span>
              <span>${category ? escapeHtml(category.name) : "未分配"}</span>
            </span>
          </div>
        </article>
      `;
    })
    .join("");

  elements.articleList.querySelectorAll("[data-article-id]").forEach((node) => {
    node.addEventListener("click", () => {
      appState.selectedArticleId = Number(node.dataset.articleId);
      renderArticles();
      renderDetail();
    });
  });
}

function renderLogs() {
  elements.logList.innerHTML = appState.logs
    .map((log) => `
      <article class="stack-item">
        <h3>${escapeHtml(log.type)}</h3>
        <p class="note-text">${escapeHtml(log.message)}</p>
        <div class="meta-row">
          <span>${escapeHtml(log.createdAt)}</span>
        </div>
      </article>
    `)
    .join("");
}

function renderDetail() {
  const article = getSelectedArticle();
  const { duplicateStatus } = getStatusEnums();
  if (!article) {
    elements.detailEmpty.classList.remove("hidden");
    elements.detailPanel.classList.add("hidden");
    elements.detailStatus.textContent = "未选择内容";
    elements.publishResult.textContent = "";
    elements.keepDuplicateButton.classList.add("hidden");
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.detailPanel.classList.remove("hidden");
  elements.detailStatus.textContent = `${article.status} / ${article.publishStatus}`;
  elements.detailSource.textContent = `${article.sourceName} / ${article.authorName}`;
  elements.detailUrl.textContent = article.originalUrl;
  elements.detailUrl.href = article.originalUrl;
  elements.detailTime.textContent = `${article.publishTime} 原文发布时间 / ${article.crawlTime} 抓取时间`;
  elements.detailSimilarity.textContent = `${article.duplicateStatus} / ${article.similarityScore}%`;
  elements.originalTitle.textContent = article.originalTitle;
  elements.cleanText.textContent = article.cleanText;
  elements.newTitle.value = article.newTitle || "";
  elements.summary.value = article.summary || "";
  elements.rewrittenContent.value = article.rewrittenContent || "";
  elements.tags.value = Array.isArray(article.tags) ? article.tags.join("，") : article.tags || "";
  elements.seoTitle.value = article.seoTitle || "";
  elements.seoDescription.value = article.seoDescription || "";
  elements.sourceNote.value = article.sourceNote || "";
  elements.reviewComment.value = article.reviewComment || "";
  const categoryName = getCategoryName(article.recommendedCategoryId);
  elements.publishResult.textContent = article.portalUrl
    ? `已转发到整木网${categoryName}：${article.portalUrl}（主站 ID：${article.portalArticleId}）`
    : "";
  if (elements.directForwardButton) {
    elements.directForwardButton.textContent = `直接转发到${categoryName}`;
  }
  if (elements.publishButton) {
    elements.publishButton.textContent = `审核后转发到${categoryName}`;
  }
  elements.keepDuplicateButton.classList.toggle(
    "hidden",
    !(article.duplicateStatus === duplicateStatus.SUSPECTED && canDecideDuplicate())
  );

  renderCategoryOptions();

  elements.aiHistory.innerHTML = article.aiHistory
    .map((item) => `
      <article class="mini-item">
        <strong>${escapeHtml(item.type)}</strong>
        <p>${escapeHtml(item.model)} / ${escapeHtml(item.createdAt)}</p>
      </article>
    `)
    .join("");

  const editorDisabled = !isEditorRole();
  const reviewerDisabled = !isReviewerRole();
  document.querySelectorAll("[data-ai-action]").forEach((button) => {
    button.disabled = editorDisabled;
  });
  [elements.newTitle, elements.summary, elements.rewrittenContent, elements.category, elements.tags, elements.seoTitle, elements.seoDescription, elements.sourceNote].forEach((field) => {
    field.disabled = editorDisabled;
  });
  elements.saveButton.disabled = editorDisabled;
  elements.submitButton.disabled = editorDisabled;
  elements.keepDuplicateButton.disabled = !canDecideDuplicate();
  elements.reviewComment.disabled = reviewerDisabled;
  elements.approveButton.disabled = reviewerDisabled;
  elements.rejectButton.disabled = reviewerDisabled;
  elements.publishButton.disabled = reviewerDisabled;
  if (elements.directForwardButton) {
    elements.directForwardButton.disabled = reviewerDisabled;
  }
  elements.archiveButton.disabled = reviewerDisabled;
}

function renderPermissions() {
  const adminDisabled = !isAdminRole();
  [
    elements.taskSource,
    elements.taskKeepSuspected,
    elements.runTaskButton,
    elements.sourceName,
    elements.sourceDomain,
    elements.sourceType,
    elements.sourceEntryUrl,
    elements.sourceInterval,
    elements.sourceEnabled,
    elements.sourceParseRule,
    elements.sourceExcludeRule,
    elements.previewSourceButton,
    elements.saveSourceButton,
    elements.resetSourceButton,
    elements.keywordName,
    elements.keywordType,
    elements.keywordPriority,
    elements.keywordCategory,
    elements.keywordEnabled,
    elements.keywordExclude,
    elements.keywordRemark,
    elements.saveKeywordButton,
    elements.resetKeywordButton,
    elements.aiApiKey,
    elements.aiBaseUrl,
    elements.aiDefaultModel,
    elements.aiReasonerModel,
    elements.aiTemperature,
    elements.aiMaxTokens,
    elements.aiTimeout,
    elements.saveAiSettingsButton
  ].forEach((field) => {
    field.disabled = adminDisabled;
  });

  elements.taskKeywordList.querySelectorAll("input").forEach((input) => {
    input.disabled = adminDisabled || input.dataset.enabled !== "1";
  });
}

function resetSourceForm() {
  appState.editingSourceId = null;
  appState.sourcePreview = null;
  elements.sourceId.value = "";
  elements.sourceName.value = "";
  elements.sourceDomain.value = "";
  elements.sourceType.value = "网站";
  elements.sourceEntryUrl.value = "";
  elements.sourceInterval.value = "每天 09:00";
  elements.sourceEnabled.checked = true;
  elements.sourceParseRule.value = "article";
  elements.sourceExcludeRule.value = "";
  renderSourcePreview();
}

function resetKeywordForm() {
  appState.editingKeywordId = null;
  elements.keywordId.value = "";
  elements.keywordName.value = "";
  elements.keywordType.value = "行业词";
  elements.keywordPriority.value = 8;
  elements.keywordEnabled.checked = true;
  elements.keywordExclude.value = "";
  elements.keywordRemark.value = "";
  if (appState.categories[0]) {
    elements.keywordCategory.value = String(appState.categories[0].id);
  }
}

function refreshData(payload) {
  const previousSelectedArticleId = appState.selectedArticleId;
  const payloadStatusEnums = payload.statusEnums || {};
  appState.sessionUser = payload.sessionUser || null;
  appState.dashboard = payload.dashboard || null;
  appState.sourceSites = payload.sourceSites || [];
  appState.keywords = payload.keywords || [];
  appState.categories = payload.categories || [];
  appState.tasks = payload.tasks || [];
  appState.articles = payload.articles || [];
  appState.logs = payload.logs || [];
  appState.crawlFailures = payload.crawlFailures || [];
  appState.aiSettings = payload.aiSettings || null;
  appState.statusEnums = {
    articleStatus: { ...DEFAULT_STATUS_ENUMS.articleStatus, ...(payloadStatusEnums.articleStatus || {}) },
    publishStatus: { ...DEFAULT_STATUS_ENUMS.publishStatus, ...(payloadStatusEnums.publishStatus || {}) },
    duplicateStatus: { ...DEFAULT_STATUS_ENUMS.duplicateStatus, ...(payloadStatusEnums.duplicateStatus || {}) }
  };
  appState.selectedArticleId = appState.articles.some((item) => item.id === previousSelectedArticleId)
    ? previousSelectedArticleId
    : appState.articles[0]?.id || null;
  renderAll();
}

function renderAll() {
  renderSession();
  renderStats();
  renderCategoryOptions();
  renderTaskForm();
  renderTasks();
  renderSources();
  renderSourcePreview();
  renderKeywords();
  renderAiSettings();
  renderFailures();
  renderFilterOptions();
  renderArticles();
  renderLogs();
  renderDetail();
  renderPermissions();
}

// ========== 第三部分：业务动作与事件绑定 ==========
async function loadBootstrap() {
  const payload = await request("/api/bootstrap", {}, true);
  if (payload.sessionToken) {
    setSessionToken(payload.sessionToken);
  }
  reportClientEvent("boot_success", "bootstrap loaded", {
    sessionUser: payload.sessionUser?.username || "",
    articleCount: Array.isArray(payload.articles) ? payload.articles.length : 0
  });
  hideLogin();
  refreshData(payload);
}

async function saveSource() {
  const payload = await request("/api/sources/save", {
    method: "POST",
    body: JSON.stringify({
      id: appState.editingSourceId,
      name: elements.sourceName.value.trim(),
      domain: elements.sourceDomain.value.trim(),
      sourceType: elements.sourceType.value,
      entryUrl: elements.sourceEntryUrl.value.trim(),
      crawlInterval: elements.sourceInterval.value.trim(),
      enabled: elements.sourceEnabled.checked,
      parseRule: elements.sourceParseRule.value.trim(),
      excludeRule: elements.sourceExcludeRule.value.trim()
    })
  });

  refreshData(payload);
  appState.sourcePreview = null;
  resetSourceForm();
}

async function previewSource() {
  const response = await fetch("/api/sources/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      name: elements.sourceName.value.trim(),
      domain: elements.sourceDomain.value.trim(),
      sourceType: elements.sourceType.value,
      entryUrl: elements.sourceEntryUrl.value.trim(),
      parseRule: elements.sourceParseRule.value.trim(),
      excludeRule: elements.sourceExcludeRule.value.trim()
    })
  });

  if (response.status === 401) {
    showLogin();
    throw new Error("请先登录");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (result.preview) {
      appState.sourcePreview = result.preview;
      renderSourcePreview();
      return;
    }
    throw new Error(result.message || "预览失败");
  }

  appState.sourcePreview = result;
  renderSourcePreview();
}

async function saveKeyword() {
  const payload = await request("/api/keywords/save", {
    method: "POST",
    body: JSON.stringify({
      id: appState.editingKeywordId,
      keyword: elements.keywordName.value.trim(),
      keywordType: elements.keywordType.value,
      priority: Number(elements.keywordPriority.value),
      categoryId: Number(elements.keywordCategory.value),
      enabled: elements.keywordEnabled.checked,
      excludeWords: elements.keywordExclude.value.trim(),
      remark: elements.keywordRemark.value.trim()
    })
  });

  refreshData(payload);
  resetKeywordForm();
}

async function saveAiSettings() {
  const payload = await request("/api/ai/settings/save", {
    method: "POST",
    body: JSON.stringify({
      apiKey: elements.aiApiKey.value.trim(),
      baseUrl: elements.aiBaseUrl.value.trim(),
      defaultModel: elements.aiDefaultModel.value.trim(),
      reasonerModel: elements.aiReasonerModel.value.trim(),
      temperature: Number(elements.aiTemperature.value),
      maxTokens: Number(elements.aiMaxTokens.value),
      timeoutMs: Number(elements.aiTimeout.value)
    })
  });

  refreshData(payload);
}

async function runTask() {
  const keywordIds = Array.from(elements.taskKeywordList.querySelectorAll("input:checked")).map((item) => Number(item.value));
  const payload = await request("/api/tasks/run", {
    method: "POST",
    body: JSON.stringify({
      sourceId: Number(elements.taskSource.value),
      keywordIds,
      keepSuspectedDuplicates: elements.taskKeepSuspected.checked
    })
  });

  refreshData(payload);
}

async function runAiAction(action) {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const payload = await request(`/api/articles/${article.id}/ai/${action}`, {
    method: "POST"
  });
  refreshData(payload);
}

async function saveDraft() {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const payload = await request(`/api/articles/${article.id}/save`, {
    method: "POST",
    body: JSON.stringify({
      newTitle: elements.newTitle.value.trim(),
      summary: elements.summary.value.trim(),
      rewrittenContent: elements.rewrittenContent.value.trim(),
      tags: elements.tags.value
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      seoTitle: elements.seoTitle.value.trim(),
      seoDescription: elements.seoDescription.value.trim(),
      sourceNote: elements.sourceNote.value.trim(),
      recommendedCategoryId: Number(elements.category.value)
    })
  });

  refreshData(payload);
}

async function directForwardArticle() {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const targetCategoryName = getCategoryName(Number(elements.category.value) || article.recommendedCategoryId);

  const forwardComment = elements.reviewComment.value.trim() || (
    article.duplicateStatus === getStatusEnums().duplicateStatus.SUSPECTED
      ? `内容池直接转发到整木网${targetCategoryName}，人工确认保留疑似重复并保留来源信息。`
      : `内容池直接转发到整木网${targetCategoryName}。`
  );

  if (isEditorRole()) {
    const savedPayload = await request(`/api/articles/${article.id}/save`, {
      method: "POST",
      body: JSON.stringify(buildArticleDraftPayload(article, true))
    });
    refreshData(savedPayload);
  }

  const publishedPayload = await request(`/api/articles/${article.id}/review`, {
    method: "POST",
    body: JSON.stringify({
      action: "publish",
      comment: forwardComment
    })
  });
  refreshData(publishedPayload);
}

async function submitForReview() {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const payload = await request(`/api/articles/${article.id}/submit`, {
    method: "POST"
  });
  refreshData(payload);
}

async function keepSuspectedDuplicate() {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const reason = elements.reviewComment.value.trim();
  if (!reason) {
    throw new Error("请先填写保留疑似稿理由");
  }

  const payload = await request(`/api/articles/${article.id}/keep-suspected`, {
    method: "POST",
    body: JSON.stringify({
      comment: reason
    })
  });
  refreshData(payload);
}

async function reviewArticle(action) {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const payload = await request(`/api/articles/${article.id}/review`, {
    method: "POST",
    body: JSON.stringify({
      action,
      comment: elements.reviewComment.value.trim()
    })
  });
  refreshData(payload);
}

function bindFilterEvents(field) {
  const syncFilter = () => {
    appState.filters.search = elements.filterSearch.value.trim();
    appState.filters.status = elements.filterStatus.value;
    appState.filters.sourceId = elements.filterSource.value;
    appState.filters.keyword = elements.filterKeyword.value;
    renderArticles();
    renderDetail();
  };

  field.addEventListener("input", syncFilter);
  field.addEventListener("change", syncFilter);
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.logoutButton.addEventListener("click", () => {
    logout().catch((error) => window.alert(error.message));
  });

  elements.saveSourceButton.addEventListener("click", () => {
    saveSource().catch((error) => window.alert(error.message));
  });
  elements.previewSourceButton.addEventListener("click", () => {
    previewSource().catch((error) => window.alert(error.message));
  });
  elements.resetSourceButton.addEventListener("click", resetSourceForm);

  elements.saveKeywordButton.addEventListener("click", () => {
    saveKeyword().catch((error) => window.alert(error.message));
  });
  elements.resetKeywordButton.addEventListener("click", resetKeywordForm);

  elements.saveAiSettingsButton.addEventListener("click", () => {
    saveAiSettings().catch((error) => window.alert(error.message));
  });

  elements.runTaskButton.addEventListener("click", () => {
    runTask().catch((error) => window.alert(error.message));
  });

  [elements.filterSearch, elements.filterStatus, elements.filterSource, elements.filterKeyword].forEach(bindFilterEvents);

  document.querySelectorAll("[data-ai-action]").forEach((button) => {
    button.addEventListener("click", () => {
      runAiAction(button.dataset.aiAction).catch((error) => window.alert(error.message));
    });
  });

  elements.saveButton.addEventListener("click", () => {
    saveDraft().catch((error) => window.alert(error.message));
  });
  if (elements.directForwardButton) {
    elements.directForwardButton.addEventListener("click", () => {
      directForwardArticle().catch((error) => window.alert(error.message));
    });
  }
  elements.submitButton.addEventListener("click", () => {
    submitForReview().catch((error) => window.alert(error.message));
  });
  elements.keepDuplicateButton.addEventListener("click", () => {
    keepSuspectedDuplicate().catch((error) => window.alert(error.message));
  });
  elements.approveButton.addEventListener("click", () => {
    reviewArticle("approve").catch((error) => window.alert(error.message));
  });
  elements.rejectButton.addEventListener("click", () => {
    reviewArticle("reject").catch((error) => window.alert(error.message));
  });
  elements.publishButton.addEventListener("click", () => {
    reviewArticle("publish").catch((error) => window.alert(error.message));
  });
  elements.archiveButton.addEventListener("click", () => {
    reviewArticle("archive").catch((error) => window.alert(error.message));
  });
}

async function initialize() {
  configureFrontstageLayout();
  bindEvents();
  applyLoginQueryState();
  resetSourceForm();
  resetKeywordForm();

  try {
    await loadBootstrap();
  } catch (error) {
    showBootError(`初始化失败：${error.message}`);
  }
}

window.addEventListener("error", (event) => {
  if (!event?.message) {
    return;
  }
  showBootError(`页面脚本异常：${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const message = typeof reason === "string"
    ? reason
    : (reason?.message || "未知错误");
  showBootError(`页面请求异常：${message}`);
});

initialize();
