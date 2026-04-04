/**
 * 文件说明：该文件实现整木网编辑中台前台脚本的动作层。
 * 功能说明：负责数据加载、抓取源与关键词维护、采集任务、AI 辅助、内容池流转与发布动作。
 *
 * 结构概览：
 *   第一部分：数据加载与基础保存
 *   第二部分：内容池与编审动作
 *   第三部分：筛选与批量操作
 */

// ========== 第一部分：数据加载与基础保存 ==========
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
  const entryUrl = elements.sourceEntryUrl.value.trim();
  const derivedDomain = deriveDomainFromUrl(entryUrl);
  const payload = await request("/api/sources/save", {
    method: "POST",
    body: JSON.stringify({
      id: appState.editingSourceId,
      name: elements.sourceName.value.trim(),
      domain: derivedDomain || elements.sourceDomain.value.trim(),
      sourceType: elements.sourceType.value,
      entryUrl,
      crawlInterval: elements.sourceInterval.value.trim() || "每天 09:00",
      enabled: elements.sourceEnabled.checked,
      parseRule: elements.sourceParseRule.value.trim() || "article",
      excludeRule: elements.sourceExcludeRule.value.trim()
    })
  });

  refreshData(payload);
  appState.sourcePreview = null;
  resetSourceForm();
}

async function deleteSource(sourceId) {
  const payload = await request("/api/sources/delete", {
    method: "POST",
    body: JSON.stringify({ id: Number(sourceId) })
  });
  refreshData(payload);
  if (appState.editingSourceId === Number(sourceId)) {
    resetSourceForm();
  }
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

async function toggleKeywordEnabled(keywordId, enabled) {
  const keyword = appState.keywords.find((item) => item.id === Number(keywordId));
  if (!keyword) {
    throw new Error("未找到要切换的关键词");
  }

  const payload = await request("/api/keywords/save", {
    method: "POST",
    body: JSON.stringify({
      id: keyword.id,
      keyword: keyword.keyword,
      keywordType: keyword.keywordType,
      priority: Number(keyword.priority || 1),
      categoryId: Number(keyword.categoryId || appState.categories[0]?.id || 1),
      enabled: Boolean(enabled),
      excludeWords: keyword.excludeWords || "",
      remark: keyword.remark || ""
    })
  });

  refreshData(payload);
  if (appState.editingKeywordId === keyword.id) {
    elements.keywordEnabled.checked = Boolean(enabled);
  }
}

async function deleteKeyword(keywordId) {
  const payload = await request("/api/keywords/delete", {
    method: "POST",
    body: JSON.stringify({ id: Number(keywordId) })
  });
  refreshData(payload);
  if (appState.editingKeywordId === Number(keywordId)) {
    resetKeywordForm();
  }
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

async function runDiscovery() {
  const keywordIds = appState.keywords.filter((item) => item.enabled).map((item) => item.id);
  if (!keywordIds.length) {
    throw new Error("请先至少启用一个关键词后再开始采集");
  }

  const payload = await request("/api/tasks/discover", {
    method: "POST",
    body: JSON.stringify({
      keywordIds,
      keepSuspectedDuplicates: true
    })
  });

  refreshData(payload);
  document.querySelector("#content-pool")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function promoteArticleSource(articleId) {
  const payload = await request(`/api/articles/${Number(articleId)}/promote-source`, {
    method: "POST"
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

// ========== 第二部分：内容池与编审动作 ==========
async function forwardArticleById(articleId, options = {}) {
  const article = appState.articles.find((item) => item.id === Number(articleId));
  if (!article) {
    return null;
  }

  const targetCategoryName = getPortalCategoryTargetName(article);
  const forwardComment = options.comment || (
    article.duplicateStatus === getStatusEnums().duplicateStatus.SUSPECTED
      ? `内容池直接发布到${targetCategoryName}，人工确认保留疑似重复并保留来源信息。`
      : `内容池直接发布到${targetCategoryName}。`
  );

  if (options.useCurrentEditorDraft && isEditorRole()) {
    const savedPayload = await request(`/api/articles/${article.id}/save`, {
      method: "POST",
      body: JSON.stringify(buildArticleDraftPayload(article, true))
    });
    refreshData(savedPayload);
  } else if (isEditorRole()) {
    const savedPayload = await request(`/api/articles/${article.id}/save`, {
      method: "POST",
      body: JSON.stringify(buildBatchDraftPayload(article))
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
  return publishedPayload;
}

async function directForwardArticle() {
  const article = getSelectedArticle();
  if (!article) {
    return;
  }

  const targetCategoryName = getCategoryName(Number(elements.category.value) || article.recommendedCategoryId);
  await forwardArticleById(article.id, {
    useCurrentEditorDraft: true,
    comment: elements.reviewComment.value.trim() || (
      article.duplicateStatus === getStatusEnums().duplicateStatus.SUSPECTED
        ? `内容池直接发布到${targetCategoryName}，人工确认保留疑似重复并保留来源信息。`
        : `内容池直接发布到${targetCategoryName}。`
    )
  });
}

async function batchForwardSelectedArticles() {
  const selectedArticles = getSelectedArticles();
  const targetArticles = selectedArticles.length ? selectedArticles : [getSelectedArticle()].filter(Boolean);

  if (!targetArticles.length) {
    throw new Error("请先在内容池中选择至少一篇文章");
  }

  for (const article of targetArticles) {
    await forwardArticleById(article.id);
  }

  appState.selectedArticleIds = targetArticles.map((item) => item.id);
  renderAll();
}

function sendSelectedToWorkbench() {
  const selectedArticles = getSelectedArticles();
  const targetIds = selectedArticles.length
    ? selectedArticles.map((item) => item.id)
    : [appState.selectedArticleId].filter(Boolean);

  if (!targetIds.length) {
    throw new Error("请先在内容池中选择文章");
  }

  setSelectedArticles(targetIds);
  appState.reviewQueueIds = Array.from(new Set([...appState.reviewQueueIds, ...targetIds]));
  appState.selectedArticleId = targetIds[0];
  renderAll();
  document.querySelector("#editor-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

// ========== 第三部分：筛选与批量操作 ==========
function selectAllFilteredArticles() {
  setSelectedArticles(getFilteredArticles().map((item) => item.id));
  renderAll();
}

function clearSelectedArticles() {
  appState.selectedArticleIds = [];
  renderAll();
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
