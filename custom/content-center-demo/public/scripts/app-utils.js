/**
 * 文件说明：该文件实现整木网编辑中台前台脚本的通用工具层。
 * 功能说明：负责请求封装、文章与来源辅助函数、前台布局收口、表单重置与草稿构造。
 *
 * 结构概览：
 *   第一部分：请求与基础工具
 *   第二部分：文章与来源辅助
 *   第三部分：前台布局与表单工具
 */

// ========== 第一部分：请求与基础工具 ==========
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

  if (response.status === 401) {
    clearSessionToken();
    if (!allowUnauthorized) {
      showLogin();
    }
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

function getSelectedArticles() {
  const selectedIds = new Set(appState.selectedArticleIds);
  return appState.articles.filter((item) => selectedIds.has(item.id));
}

function getReviewQueueArticles() {
  const queueIds = new Set(appState.reviewQueueIds);
  return appState.articles.filter((item) => queueIds.has(item.id));
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

function syncArticleState() {
  const validIds = new Set(appState.articles.map((item) => item.id));
  appState.selectedArticleIds = appState.selectedArticleIds.filter((id) => validIds.has(id));
  appState.reviewQueueIds = appState.reviewQueueIds.filter((id) => validIds.has(id));

  if (!validIds.has(appState.selectedArticleId)) {
    appState.selectedArticleId = appState.reviewQueueIds[0] || appState.selectedArticleIds[0] || appState.articles[0]?.id || null;
  }
}

function toggleArticleSelection(articleId) {
  const nextSelection = new Set(appState.selectedArticleIds);
  if (nextSelection.has(articleId)) {
    nextSelection.delete(articleId);
  } else {
    nextSelection.add(articleId);
  }
  appState.selectedArticleIds = Array.from(nextSelection);
}

function setSelectedArticles(articleIds) {
  appState.selectedArticleIds = Array.from(new Set(articleIds.map((item) => Number(item))));
}

function getPortalCategoryTargetName(article) {
  return getCategoryName(article?.recommendedCategoryId);
}

function deriveDomainFromUrl(url) {
  try {
    return new URL(String(url || "")).host;
  } catch (error) {
    return "";
  }
}

function getTrackedSourceForArticle(article) {
  const sourceHost = deriveDomainFromUrl(article?.originalUrl || "");
  return appState.sourceSites.find((source) => (
    Number(source.id) === Number(article?.sourceId)
    || (sourceHost && (source.domain === sourceHost || deriveDomainFromUrl(source.entryUrl) === sourceHost))
  )) || null;
}

function getArticleCollectionMode(article) {
  return getTrackedSourceForArticle(article) ? "重点源" : "开放发现";
}

function canPromoteSource(article) {
  return Boolean(article) && !getTrackedSourceForArticle(article) && ["admin", "editor"].includes(appState.sessionUser?.role);
}

function getArticleFreshness(article) {
  return new Date(
    article?.updatedAt
    || article?.crawlTime
    || article?.createdAt
    || article?.publishTime
    || 0
  ).getTime() || 0;
}

function getWorkbenchArticles() {
  const { articleStatus } = getStatusEnums();
  const queueIds = new Set(appState.reviewQueueIds);
  const revisedStatuses = new Set([articleStatus.EDITING, articleStatus.PENDING_APPROVAL, articleStatus.APPROVED]);
  return appState.articles
    .filter((article) => queueIds.has(article.id) || revisedStatuses.has(article.status))
    .sort((left, right) => getArticleFreshness(right) - getArticleFreshness(left));
}

function syncForwardActionLabels(categoryId) {
  const categoryName = getCategoryName(categoryId);
  if (elements.directForwardButton) {
    elements.directForwardButton.textContent = `直接发布到${categoryName}`;
  }
  if (elements.publishButton) {
    elements.publishButton.textContent = `发布到${categoryName}`;
  }
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

function normalizeDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const normalized = raw
    .replaceAll("年", "-")
    .replaceAll("月", "-")
    .replaceAll("日", "")
    .replaceAll("/", "-")
    .replaceAll(".", "-")
    .replace(/\s+/, "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCurrentMonthValue(value) {
  const dateValue = normalizeDateValue(value);
  if (!dateValue) {
    return false;
  }

  const now = new Date();
  return dateValue.getFullYear() === now.getFullYear() && dateValue.getMonth() === now.getMonth();
}

function getKeywordCaptureStats(keywordText) {
  const keyword = String(keywordText || "").trim();
  return appState.articles.reduce((stats, article) => {
    const hitKeywords = Array.isArray(article.hitKeywords) ? article.hitKeywords : [];
    if (!hitKeywords.includes(keyword)) {
      return stats;
    }

    stats.total += 1;
    if (isCurrentMonthValue(article.crawlTime || article.updatedAt || article.createdAt || article.publishTime)) {
      stats.month += 1;
    }
    return stats;
  }, { total: 0, month: 0 });
}

// ========== 第二部分：文章与来源辅助 ==========
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

function buildBatchDraftPayload(article) {
  const nextTitle = article.newTitle || article.originalTitle || "";
  const nextSummary = article.summary || createExcerpt(article.cleanText, 110);
  const nextContent = article.rewrittenContent || article.cleanText || "";
  const nextTags = Array.isArray(article.tags) && article.tags.length
    ? article.tags
    : [...(article.hitKeywords || [])].filter(Boolean);

  return {
    newTitle: nextTitle,
    summary: nextSummary,
    rewrittenContent: nextContent,
    tags: nextTags,
    seoTitle: article.seoTitle || nextTitle,
    seoDescription: article.seoDescription || createExcerpt(nextSummary || nextContent, 90),
    sourceNote: article.sourceNote || `来源：${article.sourceName}，原文链接与原发布时间已保留。`,
    recommendedCategoryId: Number(article.recommendedCategoryId) || Number(appState.categories[0]?.id || 1)
  };
}

function selectArticle(articleId, options = {}) {
  appState.selectedArticleId = Number(articleId);
  if (options.addToQueue && !appState.reviewQueueIds.includes(Number(articleId))) {
    appState.reviewQueueIds = [...appState.reviewQueueIds, Number(articleId)];
  }
  renderArticles();
  renderReviewQueue();
  renderDetail();
  renderPermissions();

  if (options.scrollToWorkbench) {
    document.querySelector("#editor-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ========== 第三部分：前台布局与表单工具 ==========
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
  button.textContent = "直接发布到整木网资讯栏目";
  toolbar.prepend(button);
  elements.directForwardButton = button;
  return button;
}

function configureFrontstageLayout() {
  document.querySelectorAll('a[href="#ai-settings"], a[href="#failure-center"], a[href="#task-center"]').forEach((node) => node.remove());
  ["ai-settings", "failure-center", "task-center"].forEach((id) => {
    const section = document.querySelector(`#${id}`);
    if (!section) {
      return;
    }
    section.classList.add("hidden");
    section.hidden = true;
    section.style.display = "none";
  });

  ensureSourceTypeOption(elements.sourceType, "公众号", "公众号");
  ensureSourceTypeOption(elements.sourceType, "自媒体", "自媒体");

  const sourcePill = document.querySelector("#source-management .pill");
  if (sourcePill) {
    sourcePill.textContent = "抓取对象";
  }

  const keywordPill = document.querySelector("#keyword-management .pill");
  if (keywordPill) {
    keywordPill.textContent = "关键词可增减";
  }

  const poolPill = document.querySelector("#content-pool .pill");
  if (poolPill) {
    poolPill.textContent = "重点源 / 开放发现";
  }

  const sourceHubNote = document.querySelector("#source-hub .section-note");
  if (sourceHubNote) {
    sourceHubNote.textContent = "先配置关键词，再维护抓取对象。系统会先抓重点源，再补开放发现。";
  }

  const poolNote = document.querySelector("#content-pool .section-note");
  if (poolNote) {
    poolNote.textContent = "内容池分为重点源和开放发现，可多选直接发布，也可送入编审台继续修订。";
  }

  const workbenchNote = document.querySelector("#editor-workbench .section-note");
  if (workbenchNote) {
    workbenchNote.textContent = "编审台显示修订文章列表，选中文章后可在线编辑并直接发布到对应栏目。";
  }

  if (elements.detailEmpty) {
    elements.detailEmpty.textContent = "从内容池选择文章并送入编审台后，这里会展示修订内容、AI 辅助和发布动作。";
  }

  if (elements.saveButton) {
    elements.saveButton.textContent = "保存修订稿";
  }
  if (elements.submitButton) {
    elements.submitButton.textContent = "提交复审";
  }
  if (elements.publishButton) {
    elements.publishButton.textContent = "发布到对应栏目";
  }

  const reviewTitle = document.querySelector("#editor-workbench .review-box h3");
  if (reviewTitle) {
    reviewTitle.textContent = "编审动作";
  }

  ensureDirectForwardButton();
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
