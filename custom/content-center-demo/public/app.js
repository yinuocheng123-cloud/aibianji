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

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: ARTICLE_STATUS.PENDING_REVIEW, label: ARTICLE_STATUS.PENDING_REVIEW },
  { value: ARTICLE_STATUS.EDITING, label: ARTICLE_STATUS.EDITING },
  { value: ARTICLE_STATUS.PENDING_APPROVAL, label: ARTICLE_STATUS.PENDING_APPROVAL },
  { value: ARTICLE_STATUS.APPROVED, label: ARTICLE_STATUS.APPROVED },
  { value: ARTICLE_STATUS.PUBLISHED, label: ARTICLE_STATUS.PUBLISHED },
  { value: ARTICLE_STATUS.ARCHIVED, label: ARTICLE_STATUS.ARCHIVED },
  { value: ARTICLE_STATUS.REJECTED, label: ARTICLE_STATUS.REJECTED }
];

const appState = {
  sessionUser: null,
  dashboard: null,
  sourceSites: [],
  keywords: [],
  categories: [],
  tasks: [],
  articles: [],
  logs: [],
  crawlFailures: [],
  aiSettings: null,
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
  approveButton: document.querySelector("#approve-button"),
  rejectButton: document.querySelector("#reject-button"),
  publishButton: document.querySelector("#publish-button"),
  archiveButton: document.querySelector("#archive-button"),
  statTemplate: document.querySelector("#stat-template")
};

async function request(url, options = {}, allowUnauthorized = false) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });

  if (response.status === 401 && !allowUnauthorized) {
    showLogin();
    throw new Error("请先登录");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "请求失败");
  }

  return result;
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

function isEditorRole() {
  return ["admin", "editor"].includes(appState.sessionUser?.role);
}

function isReviewerRole() {
  return ["admin", "reviewer"].includes(appState.sessionUser?.role);
}

function isAdminRole() {
  return appState.sessionUser?.role === "admin";
}

function getLatestFailureForSource(sourceId) {
  return appState.crawlFailures.find((item) => Number(item.sourceId) === Number(sourceId)) || null;
}

// ========== 第二部分：会话与渲染函数 ==========
function showLogin() {
  elements.loginOverlay.classList.remove("hidden");
  document.body.classList.add("overlay-open");
}

function hideLogin() {
  elements.loginOverlay.classList.add("hidden");
  elements.loginError.textContent = "";
  document.body.classList.remove("overlay-open");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  elements.loginError.textContent = "";

  try {
    const payload = await request(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username: elements.loginUsername.value.trim(),
          password: elements.loginPassword.value
        })
      },
      true
    );
    hideLogin();
    refreshData(payload);
  } catch (error) {
    elements.loginError.textContent = error.message;
  }
}

async function logout() {
  await request("/api/auth/logout", { method: "POST" }, true);
  appState.sessionUser = null;
  appState.dashboard = null;
  appState.sourceSites = [];
  appState.keywords = [];
  appState.categories = [];
  appState.tasks = [];
  appState.articles = [];
  appState.logs = [];
  appState.crawlFailures = [];
  appState.aiSettings = null;
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
  if (preview.publishTime) {
    metaParts.push(preview.publishTime);
  }
  if (preview.extractionMode) {
    metaParts.push(preview.extractionMode);
  }
  if (preview.errorMessage) {
    metaParts.push(preview.errorMessage);
  }

  elements.sourcePreview.classList.remove("hidden");
  elements.sourcePreviewTitle.textContent = preview.title || "未识别标题";
  elements.sourcePreviewMeta.textContent = metaParts.join(" / ");
  elements.sourcePreviewBody.textContent = preview.cleanText || preview.rawText || "暂无可展示内容";
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
  elements.filterStatus.innerHTML = STATUS_FILTER_OPTIONS
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
  if (article.status === ARTICLE_STATUS.REJECTED) {
    return "danger";
  }
  if ([ARTICLE_STATUS.APPROVED, ARTICLE_STATUS.PUBLISHED, ARTICLE_STATUS.ARCHIVED].includes(article.status)) {
    return "good";
  }
  if (article.duplicateStatus !== DUPLICATE_STATUS.PASSED) {
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
  if (!article) {
    elements.detailEmpty.classList.remove("hidden");
    elements.detailPanel.classList.add("hidden");
    elements.detailStatus.textContent = "未选择内容";
    elements.publishResult.textContent = "";
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.detailPanel.classList.remove("hidden");
  elements.detailStatus.textContent = `${article.status} / ${article.publishStatus}`;
  elements.detailSource.textContent = `${article.sourceName} / ${article.authorName}`;
  elements.detailUrl.textContent = article.originalUrl;
  elements.detailUrl.href = article.originalUrl;
  elements.detailTime.textContent = `${article.publishTime} 发布 / ${article.crawlTime} 抓取`;
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
  elements.publishResult.textContent = article.portalUrl
    ? `已发布：${article.portalUrl}（主站 ID：${article.portalArticleId}）`
    : "";

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
  elements.reviewComment.disabled = reviewerDisabled;
  elements.approveButton.disabled = reviewerDisabled;
  elements.rejectButton.disabled = reviewerDisabled;
  elements.publishButton.disabled = reviewerDisabled;
  elements.archiveButton.disabled = reviewerDisabled;
}

function renderPermissions() {
  const adminDisabled = !isAdminRole();
  [
    elements.taskSource,
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
      keywordIds
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
  elements.submitButton.addEventListener("click", () => {
    submitForReview().catch((error) => window.alert(error.message));
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
  bindEvents();
  resetSourceForm();
  resetKeywordForm();

  try {
    await loadBootstrap();
  } catch (error) {
    showLogin();
  }
}

initialize();
