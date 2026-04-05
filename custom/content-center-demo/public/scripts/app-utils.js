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
    throw new Error(FRONTSTAGE_COPY.errors.loginRequired);
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || FRONTSTAGE_COPY.errors.requestFailed);
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
  return getCategoryById(categoryId)?.name || FRONTSTAGE_COPY.common.defaultCategory;
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
  return getTrackedSourceForArticle(article)
    ? FRONTSTAGE_COPY.common.collectionModeTracked
    : FRONTSTAGE_COPY.common.collectionModeOpen;
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
  const queueIds = new Set(appState.reviewQueueIds);
  const { articleStatus } = getStatusEnums();
  const revisedStatuses = new Set([articleStatus.EDITING, articleStatus.PENDING_APPROVAL, articleStatus.APPROVED]);
  return appState.articles
    .filter((article) => queueIds.has(article.id) || revisedStatuses.has(article.status))
    .sort((left, right) => getArticleFreshness(right) - getArticleFreshness(left));
}

function buildCategoryActionLabel(prefix, categoryName) {
  return `${prefix}${categoryName}`;
}

function buildDirectForwardComment(categoryName, isSuspected) {
  const { templates } = FRONTSTAGE_COPY;
  return `${templates.directForwardCommentPrefix}${categoryName}${isSuspected
    ? templates.directForwardCommentSuspectedSuffix
    : templates.directForwardCommentDefaultSuffix}`;
}

function buildPublishResultText(article, categoryName) {
  if (!article.portalUrl) {
    return "";
  }

  const { templates } = FRONTSTAGE_COPY;
  return `${templates.publishResultPrefix}${categoryName} · ${templates.publishResultIdLabel} ${article.portalArticleId} · ${templates.publishResultLinkLabel}`;
}

function buildAiActionNote(categoryName) {
  if (!categoryName) {
    return FRONTSTAGE_COPY.notes.aiActions;
  }
  return `${FRONTSTAGE_COPY.notes.aiActions} ${FRONTSTAGE_COPY.templates.currentCategory.replace("{categoryName}", categoryName)}`;
}

function buildPublishResultNote(categoryName) {
  if (!categoryName) {
    return FRONTSTAGE_COPY.notes.publishResult;
  }
  return `${FRONTSTAGE_COPY.notes.publishResult} ${FRONTSTAGE_COPY.templates.currentCategory.replace("{categoryName}", categoryName)}`;
}

function buildAiHistoryMetaText(item) {
  const metaParts = [item.model, item.createdAt].filter(Boolean);
  return metaParts.join(" / ");
}

function buildAiHistoryExcerpt(item) {
  const candidate = item.outputText || item.output || item.summary || "";
  return createExcerpt(candidate, 56);
}

function buildPreviewBodyText(preview, responsePreview) {
  let bodyText = preview.cleanText || preview.rawText || responsePreview || FRONTSTAGE_COPY.empty.previewBody;
  if (preview.isFallback && responsePreview && !bodyText.includes(responsePreview)) {
    bodyText = `${bodyText}\n\n${FRONTSTAGE_COPY.notes.previewResponsePrefix}\n${responsePreview}`;
  }
  return bodyText;
}

function getErrorMessage(error) {
  return error?.message || FRONTSTAGE_COPY.errors.requestFailed;
}

function showActionError(error) {
  window.alert(getErrorMessage(error));
}

function buildSelectionChipText(label, count) {
  return `${label} ${count}`;
}

function buildKeywordMetricText(label, count) {
  return `${label} ${count}`;
}

function buildArticleSummaryText(article, limit = 56) {
  return article.summary || createExcerpt(article.cleanText, limit) || FRONTSTAGE_COPY.common.articleSummaryFallback;
}

function buildArticleMetaTexts(article, categoryName) {
  const sourceName = article.sourceName || FRONTSTAGE_COPY.common.unnamedSource;
  const publishTime = article.publishTime || article.crawlTime || FRONTSTAGE_COPY.common.unknownTime;
  return {
    primary: FRONTSTAGE_COPY.templates.articleMetaPrimary
      .replace("{sourceName}", sourceName)
      .replace("{publishTime}", publishTime),
    secondary: categoryName || FRONTSTAGE_COPY.common.unassignedCategory
  };
}

function buildGroupCountLabel(mode, count) {
  const prefix = mode === "tracked"
    ? FRONTSTAGE_COPY.labels.trackedGroupCount
    : FRONTSTAGE_COPY.labels.openGroupCount;
  return `${prefix} ${count}`;
}

function buildReviewQueueSummaryText(article) {
  return article.summary || createExcerpt(article.cleanText, 60) || FRONTSTAGE_COPY.common.reviewSummaryFallback;
}

function buildSourceEnabledText(enabled) {
  return enabled ? FRONTSTAGE_COPY.common.sourceEnabled : FRONTSTAGE_COPY.common.sourceDisabled;
}

function buildTaskDuplicateStrategyText(task) {
  return task.keepSuspectedDuplicates === false
    ? FRONTSTAGE_COPY.common.taskSkipSuspected
    : FRONTSTAGE_COPY.common.taskKeepSuspected;
}

function buildTaskMetricText(label, value) {
  return `${label} ${value}`;
}

function buildSessionSummaryText(user) {
  if (!user) {
    return FRONTSTAGE_COPY.status.loggedOut;
  }

  return FRONTSTAGE_COPY.templates.sessionSummary
    .replace("{displayName}", user.displayName || user.username || "")
    .replace("{role}", user.role || "");
}

function buildDetailSourceText(article) {
  return FRONTSTAGE_COPY.templates.detailSource
    .replace("{sourceName}", article.sourceName || FRONTSTAGE_COPY.common.unnamedSource)
    .replace("{collectionMode}", getArticleCollectionMode(article));
}

function buildArticleMetaLines(article, categoryName) {
  const sourceName = article.sourceName || FRONTSTAGE_COPY.common.unnamedSource;
  const publishTime = article.publishTime || article.crawlTime || FRONTSTAGE_COPY.common.unknownTime;
  return {
    primary: FRONTSTAGE_COPY.templates.articleMetaPrimary
      .replace("{sourceName}", sourceName)
      .replace("{publishTime}", publishTime),
    secondary: categoryName || FRONTSTAGE_COPY.common.unassignedCategory
  };
}

function buildDetailStatusLabel(article) {
  return FRONTSTAGE_COPY.templates.detailStatus
    .replace("{articleStatus}", article.status || FRONTSTAGE_COPY.common.unknownError)
    .replace("{publishStatus}", article.publishStatus || FRONTSTAGE_COPY.common.unknownError);
}

function buildAiSettingsStatusLabel(settings) {
  if (!settings) {
    return FRONTSTAGE_COPY.common.aiSettingsHidden;
  }

  const keyState = settings.hasApiKey
    ? FRONTSTAGE_COPY.status.aiSettingsReady
    : FRONTSTAGE_COPY.status.aiSettingsMissing;
  return FRONTSTAGE_COPY.templates.aiSettingsStatus
    .replace("{source}", settings.source || FRONTSTAGE_COPY.common.unknownTitle)
    .replace("{apiKeyLabel}", FRONTSTAGE_COPY.labels.apiKey)
    .replace("{keyState}", keyState);
}

function buildDetailSimilarityLabel(article) {
  const similarityScore = Number.isFinite(Number(article.similarityScore))
    ? `${article.similarityScore}%`
    : "--";
  return FRONTSTAGE_COPY.templates.detailSimilarity
    .replace("{duplicateStatus}", article.duplicateStatus || FRONTSTAGE_COPY.common.unknownError)
    .replace("{similarityScore}", similarityScore);
}

function buildPublishBoardMetaLines(article) {
  return {
    primary: FRONTSTAGE_COPY.templates.publishBoardMetaPrimary
      .replace("{categoryName}", getPortalCategoryTargetName(article))
      .replace("{sourceName}", article.sourceName || FRONTSTAGE_COPY.common.unnamedSource),
    secondary: formatPublishBoardTime(article.updatedAt || article.createdAt || article.publishTime) || FRONTSTAGE_COPY.common.unknownTime
  };
}

function buildReviewQueueMetaLines(article) {
  return {
    primary: getPortalCategoryTargetName(article),
    secondary: FRONTSTAGE_COPY.templates.reviewQueueMetaSecondary
      .replace("{status}", article.status || FRONTSTAGE_COPY.common.unknownError)
      .replace("{time}", article.updatedAt || article.createdAt || article.publishTime || FRONTSTAGE_COPY.common.unknownTime)
  };
}

function buildDetailStatusText(article) {
  return `${article.status} · ${article.publishStatus}`;
}

function buildAiSettingsStatusText(settings) {
  if (!settings) {
    return FRONTSTAGE_COPY.common.aiSettingsHidden;
  }

  const keyState = settings.hasApiKey
    ? FRONTSTAGE_COPY.status.aiSettingsReady
    : FRONTSTAGE_COPY.status.aiSettingsMissing;
  return `${settings.source} / ${FRONTSTAGE_COPY.labels.apiKey}：${keyState}`;
}

function buildDetailTimeText(article) {
  const publishTime = article.publishTime || FRONTSTAGE_COPY.common.unknownTime;
  const crawlTime = article.crawlTime || FRONTSTAGE_COPY.common.unknownTime;
  return FRONTSTAGE_COPY.templates.detailTime
    .replace("{publishTime}", publishTime)
    .replace("{crawlTime}", crawlTime);
}

function buildDetailSimilarityText(article) {
  const similarityScore = Number.isFinite(Number(article.similarityScore))
    ? `${article.similarityScore}%`
    : "--";
  return `${article.duplicateStatus} · ${similarityScore}`;
}

function buildPublishBoardMetaTexts(article) {
  return {
    primary: `${getPortalCategoryTargetName(article)} · ${article.sourceName || FRONTSTAGE_COPY.common.unnamedSource}`,
    secondary: formatPublishBoardTime(article.updatedAt || article.createdAt || article.publishTime) || FRONTSTAGE_COPY.common.unknownTime
  };
}

function buildReviewQueueMetaTexts(article) {
  return {
    primary: getPortalCategoryTargetName(article),
    secondary: `${article.status} · ${article.updatedAt || article.createdAt || article.publishTime || FRONTSTAGE_COPY.common.unknownTime}`
  };
}

function buildCollectionStatusText(enabledKeywordCount, enabledSourceCount, latestTask = null) {
  const { templates } = FRONTSTAGE_COPY;
  let text = `${templates.collectionStatusPrefix} ${enabledKeywordCount} ${templates.collectionStatusKeywordUnit}，${enabledSourceCount} ${templates.collectionStatusSourceUnit}。${templates.collectionStatusConnector}`;

  if (latestTask) {
    text += ` ${templates.collectionStatusRecentPrefix} ${latestTask.successCount} 条，${templates.collectionStatusRecentDuplicate} ${latestTask.duplicateCount} ${templates.collectionStatusRecentUnit}`;
  }

  return text;
}

function buildSourceNoteText(sourceName) {
  return FRONTSTAGE_COPY.templates.sourceNote.replace("{sourceName}", sourceName || FRONTSTAGE_COPY.common.unnamedSource);
}

function syncForwardActionLabels(categoryId) {
  const categoryName = getCategoryName(categoryId);
  if (elements.directForwardButton) {
    elements.directForwardButton.textContent = buildCategoryActionLabel(
      FRONTSTAGE_COPY.actions.directForwardPrefix,
      categoryName
    );
  }
  if (elements.publishButton) {
    elements.publishButton.textContent = buildCategoryActionLabel(
      FRONTSTAGE_COPY.actions.publishPrefix,
      categoryName
    );
  }
}

function getStatusEnums() {
  return appState.statusEnums || DEFAULT_STATUS_ENUMS;
}

function getStatusFilterOptions() {
  const { articleStatus } = getStatusEnums();
  return [
    { value: "", label: FRONTSTAGE_COPY.templates.filterAllStatus },
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
    autofill ? (article.sourceNote || buildSourceNoteText(article.sourceName)) : ""
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
    sourceNote: article.sourceNote || buildSourceNoteText(article.sourceName),
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
  button.textContent = FRONTSTAGE_COPY.actions.directForwardDefault;
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
    sourcePill.textContent = FRONTSTAGE_COPY.labels.sourcePill;
  }

  const keywordPill = document.querySelector("#keyword-management .pill");
  if (keywordPill) {
    keywordPill.textContent = FRONTSTAGE_COPY.labels.keywordPill;
  }

  const poolPill = document.querySelector("#content-pool .pill");
  if (poolPill) {
    poolPill.textContent = FRONTSTAGE_COPY.labels.poolPill;
  }

  const sourceHubNote = document.querySelector("#source-hub .section-note");
  if (sourceHubNote) {
    sourceHubNote.textContent = FRONTSTAGE_COPY.notes.sourceHub;
  }

  const poolNote = document.querySelector("#content-pool .section-note");
  if (poolNote) {
    poolNote.textContent = FRONTSTAGE_COPY.notes.contentPool;
  }

  const workbenchNote = document.querySelector("#editor-workbench .section-note");
  if (workbenchNote) {
    workbenchNote.textContent = FRONTSTAGE_COPY.notes.workbench;
  }

  if (elements.detailEmpty) {
    elements.detailEmpty.textContent = FRONTSTAGE_COPY.empty.detailPanel;
  }

  if (elements.saveButton) {
    elements.saveButton.textContent = FRONTSTAGE_COPY.actions.saveDraft;
  }
  if (elements.submitButton) {
    elements.submitButton.textContent = FRONTSTAGE_COPY.actions.submitReview;
  }
  if (elements.keepDuplicateButton) {
    elements.keepDuplicateButton.textContent = FRONTSTAGE_COPY.actions.keepSuspected;
  }
  if (elements.approveButton) {
    elements.approveButton.textContent = FRONTSTAGE_COPY.actions.approve;
  }
  if (elements.rejectButton) {
    elements.rejectButton.textContent = FRONTSTAGE_COPY.actions.reject;
  }
  if (elements.publishButton) {
    elements.publishButton.textContent = FRONTSTAGE_COPY.actions.publishGeneric;
  }
  if (elements.archiveButton) {
    elements.archiveButton.textContent = FRONTSTAGE_COPY.actions.archive;
  }

  if (elements.batchForwardButton) {
    elements.batchForwardButton.textContent = FRONTSTAGE_COPY.actions.batchForward;
  }
  if (elements.selectAllButton) {
    elements.selectAllButton.textContent = FRONTSTAGE_COPY.actions.selectAll;
  }
  if (elements.clearSelectedButton) {
    elements.clearSelectedButton.textContent = FRONTSTAGE_COPY.actions.clearSelected;
  }

  if (elements.sendToWorkbenchButton) {
    elements.sendToWorkbenchButton.textContent = FRONTSTAGE_COPY.actions.sendToWorkbench;
  }
  if (elements.discoverButton) {
    elements.discoverButton.textContent = FRONTSTAGE_COPY.actions.discover;
  }
  if (elements.saveKeywordButton) {
    elements.saveKeywordButton.textContent = FRONTSTAGE_COPY.actions.saveKeyword;
  }
  if (elements.resetKeywordButton) {
    elements.resetKeywordButton.textContent = FRONTSTAGE_COPY.actions.resetKeyword;
  }
  if (elements.saveSourceButton) {
    elements.saveSourceButton.textContent = FRONTSTAGE_COPY.actions.saveSource;
  }
  if (elements.resetSourceButton) {
    elements.resetSourceButton.textContent = FRONTSTAGE_COPY.actions.resetSource;
  }
  if (elements.previewSourceButton) {
    elements.previewSourceButton.textContent = FRONTSTAGE_COPY.actions.previewSource;
  }
  if (elements.aiActionsNote) {
    elements.aiActionsNote.textContent = buildAiActionNote(getCategoryName(Number(elements.category?.value)));
  }
  if (elements.publishResultNote) {
    elements.publishResultNote.textContent = buildPublishResultNote(getCategoryName(Number(elements.category?.value)));
  }

  const reviewTitle = document.querySelector("#editor-workbench .review-box h3");
  if (reviewTitle) {
    reviewTitle.textContent = FRONTSTAGE_COPY.actions.reviewPanelTitle;
  }
  if (elements.reviewComment) {
    elements.reviewComment.placeholder = FRONTSTAGE_COPY.placeholders.reviewComment;
  }
  if (elements.publishResult && !elements.publishResult.textContent.trim()) {
    elements.publishResult.textContent = FRONTSTAGE_COPY.placeholders.publishResultIdle;
    elements.publishResult.classList.add("is-empty");
  }

  document.querySelectorAll("[data-ai-action]").forEach((button) => {
    const action = button.dataset.aiAction;
    if (action === "summary") {
      button.textContent = FRONTSTAGE_COPY.actions.aiSummary;
    }
    if (action === "title") {
      button.textContent = FRONTSTAGE_COPY.actions.aiTitle;
    }
    if (action === "rewrite") {
      button.textContent = FRONTSTAGE_COPY.actions.aiRewrite;
    }
    if (action === "expand") {
      button.textContent = FRONTSTAGE_COPY.actions.aiExpand;
    }
  });

  const publishBoardNote = document.querySelector("#publish-board .section-note");
  if (publishBoardNote) {
    publishBoardNote.textContent = FRONTSTAGE_COPY.notes.publishBoard;
  }
  if (elements.aiHistoryNote) {
    elements.aiHistoryNote.textContent = FRONTSTAGE_COPY.notes.aiHistory;
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
  elements.sourceInterval.value = FRONTSTAGE_COPY.common.defaultSourceInterval;
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
