/**
 * 文件说明：该文件实现整木网编辑中台前台页面的渲染层。
 * 功能说明：负责仪表盘、信息源、内容池、编审台、发布榜等区域的页面渲染与界面状态同步。
 *
 * 结构概览：
 *   第一部分：基础渲染
 *   第二部分：内容池与编审台渲染
 *   第三部分：发布榜与全量刷新
 */

// ========== 第一部分：基础渲染 ==========
function renderSession() {
  elements.sessionSummary.textContent = buildSessionSummaryText(appState.sessionUser);
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
  syncForwardActionLabels(Number(elements.category.value));
}

function renderTaskForm() {
  elements.taskSource.innerHTML = appState.sourceSites
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.enabled ? "" : FRONTSTAGE_COPY.common.optionDisabledSuffix}</option>`)
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
  const taskSection = document.querySelector("#task-center");
  if (taskSection?.hidden || taskSection?.classList.contains("hidden")) {
    elements.taskList.innerHTML = "";
    return;
  }

  elements.taskList.innerHTML = appState.tasks
    .map((task) => `
      <article class="stack-item">
        <div class="list-head">
          <h3>${escapeHtml(task.taskName)}</h3>
          <span class="status-badge ${task.status === FRONTSTAGE_COPY.status.taskCompleted ? "good" : ""}">${escapeHtml(task.status)}</span>
        </div>
        <div class="meta-row">
          <span>${escapeHtml(task.sourceName)}</span>
          <span>${escapeHtml(task.taskType)}</span>
          <span>${buildTaskDuplicateStrategyText(task)}</span>
          <span>${buildTaskMetricText(FRONTSTAGE_COPY.labels.taskAdded, task.successCount)}</span>
          <span>${buildTaskMetricText(FRONTSTAGE_COPY.labels.taskDuplicate, task.duplicateCount)}</span>
          <span>${buildTaskMetricText(FRONTSTAGE_COPY.labels.taskFailed, task.failCount || 0)}</span>
        </div>
        <p class="note-text">${escapeHtml(task.logText || "")}</p>
      </article>
    `)
    .join("");
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
    metaParts.push(FRONTSTAGE_COPY.status.previewFallback);
  }
  if (preview.errorMessage) {
    metaParts.push(preview.errorMessage);
  }

  const bodyText = buildPreviewBodyText(preview, responsePreview);

  elements.sourcePreview.classList.remove("hidden");
  elements.sourcePreviewTitle.textContent = preview.title || FRONTSTAGE_COPY.common.unknownTitle;
  elements.sourcePreviewMeta.textContent = metaParts.join(" / ");
  elements.sourcePreviewBody.textContent = bodyText;
}

function renderKeywords() {
  const canManage = isAdminRole();
  elements.keywordList.innerHTML = appState.keywords.length
    ? appState.keywords
      .map((item) => {
        const stats = getKeywordCaptureStats(item.keyword);
        return `
          <article class="simple-item">
            <div class="list-head">
              <h3>${escapeHtml(item.keyword)}</h3>
              <div class="article-actions keyword-actions">
                <label class="inline-check keyword-toggle">
                  <input type="checkbox" data-keyword-toggle="${item.id}" ${item.enabled ? "checked" : ""} ${canManage ? "" : "disabled"} />
                  <span>${FRONTSTAGE_COPY.common.enableToggle}</span>
                </label>
                ${canManage ? `
                  <button type="button" class="ghost-button" data-keyword-edit="${item.id}">${FRONTSTAGE_COPY.common.edit}</button>
                  <button type="button" class="ghost-button" data-keyword-delete="${item.id}">${FRONTSTAGE_COPY.common.delete}</button>
                ` : ""}
              </div>
            </div>
            <div class="meta-row">
              <span>${buildKeywordMetricText(FRONTSTAGE_COPY.templates.keywordTotal, stats.total)}</span>
              <span>${buildKeywordMetricText(FRONTSTAGE_COPY.templates.keywordMonthly, stats.month)}</span>
            </div>
          </article>
        `;
      })
      .join("")
    : `<div class="empty-state">${FRONTSTAGE_COPY.empty.keywords}</div>`;

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

  elements.keywordList.querySelectorAll("[data-keyword-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteKeyword(Number(button.dataset.keywordDelete)).catch(showActionError);
    });
  });

  elements.keywordList.querySelectorAll("[data-keyword-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      toggleKeywordEnabled(Number(input.dataset.keywordToggle), input.checked).catch((error) => {
        input.checked = !input.checked;
        showActionError(error);
      });
    });
  });
}

function renderAiSettings() {
  if (!appState.aiSettings) {
    elements.aiSettingsStatus.textContent = FRONTSTAGE_COPY.common.aiSettingsHidden;
    elements.aiApiKey.value = "";
    elements.aiBaseUrl.value = "";
    elements.aiDefaultModel.value = "";
    elements.aiReasonerModel.value = "";
    elements.aiTemperature.value = "";
    elements.aiMaxTokens.value = "";
    elements.aiTimeout.value = "";
    return;
  }

  elements.aiSettingsStatus.textContent = buildAiSettingsStatusLabel(appState.aiSettings);
  elements.aiApiKey.value = "";
  elements.aiApiKey.placeholder = appState.aiSettings.hasApiKey ? `${FRONTSTAGE_COPY.common.currentPrefix}${appState.aiSettings.apiKeyMasked}` : "sk-...";
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
            <h3>${escapeHtml(item.sourceName || FRONTSTAGE_COPY.common.unnamedSource)}</h3>
            <span class="status-badge warn">${escapeHtml(item.stage || FRONTSTAGE_COPY.common.crawlFailureStage)}</span>
          </div>
          <p class="note-text">${escapeHtml(item.message || "")}</p>
          <div class="meta-row">
            <span>${escapeHtml(item.keyword || FRONTSTAGE_COPY.common.unmatchedKeyword)}</span>
            <span>${escapeHtml(item.createdAt || "")}</span>
          </div>
        </article>
      `)
      .join("")
    : `
        <article class="stack-item">
          <h3>${FRONTSTAGE_COPY.empty.failureList}</h3>
          <p class="note-text">${FRONTSTAGE_COPY.notes.failureIdle}</p>
        </article>
      `;
}

function renderFilterOptions() {
  elements.filterStatus.innerHTML = getStatusFilterOptions()
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");
  elements.filterSource.innerHTML = [
    `<option value="">${FRONTSTAGE_COPY.templates.filterAllSource}</option>`,
    ...appState.sourceSites.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
  ].join("");
  elements.filterKeyword.innerHTML = [
    `<option value="">${FRONTSTAGE_COPY.templates.filterAllKeyword}</option>`,
    ...appState.keywords.map((item) => `<option value="${escapeHtml(item.keyword)}">${escapeHtml(item.keyword)}</option>`)
  ].join("");

  elements.filterStatus.value = appState.filters.status;
  elements.filterSource.value = appState.filters.sourceId;
  elements.filterKeyword.value = appState.filters.keyword;
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

function renderSources() {
  const canManage = isAdminRole();
  const enabledKeywords = appState.keywords.filter((item) => item.enabled).length;
  const enabledSources = appState.sourceSites.filter((item) => item.enabled).length;

  elements.sourceList.innerHTML = appState.sourceSites.length
    ? appState.sourceSites
      .map((item) => `
        <article class="simple-item source-item">
          <div class="list-head">
            <div class="source-main">
              <h3>${escapeHtml(item.name)}</h3>
              <a class="source-url" href="${escapeHtml(item.entryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.entryUrl)}</a>
            </div>
            ${canManage ? `
              <div class="article-actions">
                <button type="button" class="ghost-button" data-source-edit="${item.id}">${FRONTSTAGE_COPY.common.edit}</button>
                <button type="button" class="ghost-button" data-source-delete="${item.id}">${FRONTSTAGE_COPY.common.delete}</button>
              </div>
            ` : ""}
          </div>
          <div class="tag-row">
            <span class="mini-badge">${escapeHtml(item.sourceType)}</span>
            <span class="mini-badge">${buildSourceEnabledText(item.enabled)}</span>
          </div>
        </article>
      `)
      .join("")
    : `<div class="empty-state">${FRONTSTAGE_COPY.empty.sources}</div>`;

  if (elements.discoverStatus) {
    elements.discoverStatus.textContent = buildCollectionStatusText(enabledKeywords, enabledSources);
  }

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

  elements.sourceList.querySelectorAll("[data-source-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteSource(Number(button.dataset.sourceDelete)).catch(showActionError);
    });
  });
}

function renderSelectionSummary() {
  const selectedCount = appState.selectedArticleIds.length;
  const queueCount = appState.reviewQueueIds.length;
  const filteredArticles = getFilteredArticles();
  const trackedCount = filteredArticles.filter((article) => getTrackedSourceForArticle(article)).length;
  const openCount = filteredArticles.length - trackedCount;

  if (!elements.selectionSummary) {
    return;
  }

  const noteText = selectedCount
    ? FRONTSTAGE_COPY.selection.active
    : FRONTSTAGE_COPY.selection.idle;

  elements.selectionSummary.innerHTML = `
    <div class="summary-metrics">
      <span class="summary-chip ${selectedCount ? "active" : ""}">${buildSelectionChipText(FRONTSTAGE_COPY.labels.selectedCount, selectedCount)}</span>
      <span class="summary-chip">${buildSelectionChipText(FRONTSTAGE_COPY.labels.trackedCount, trackedCount)}</span>
      <span class="summary-chip">${buildSelectionChipText(FRONTSTAGE_COPY.labels.openCount, openCount)}</span>
      <span class="summary-chip">${buildSelectionChipText(FRONTSTAGE_COPY.labels.workbenchCount, queueCount)}</span>
    </div>
    <p class="summary-note">${noteText}</p>
  `;
}

function getFilteredArticles() {
  return appState.articles
    .filter((article) => {
      const matchSearch = !appState.filters.search || article.originalTitle.includes(appState.filters.search);
      const matchStatus = !appState.filters.status || article.status === appState.filters.status;
      const matchSource = !appState.filters.sourceId || Number(article.sourceId) === Number(appState.filters.sourceId);
      const matchKeyword = !appState.filters.keyword || article.hitKeywords.includes(appState.filters.keyword);
      return matchSearch && matchStatus && matchSource && matchKeyword;
    })
    .sort((left, right) => getArticleFreshness(right) - getArticleFreshness(left));
}

// ========== 第二部分：内容池与编审台渲染 ==========
function renderArticles() {
  const articleList = getFilteredArticles();
  const trackedArticles = articleList.filter((article) => getTrackedSourceForArticle(article));
  const openArticles = articleList.filter((article) => !getTrackedSourceForArticle(article));

  const renderArticleGroup = (articles, mode) => {
    if (!articles.length) {
      return `<div class="empty-state">${mode === "tracked" ? FRONTSTAGE_COPY.empty.trackedArticles : FRONTSTAGE_COPY.empty.openArticles}</div>`;
    }

    return articles
      .map((article) => {
        const category = appState.categories.find((item) => item.id === Number(article.recommendedCategoryId));
        const isActive = article.id === appState.selectedArticleId;
        const isSelected = appState.selectedArticleIds.includes(article.id);
        const statusClass = getStatusClass(article);
        const summary = buildArticleSummaryText(article, 56);
        const metaTexts = buildArticleMetaLines(article, category?.name);
        const promoteButton = mode === "open" && canPromoteSource(article)
          ? `<button type="button" class="ghost-button" data-promote-source="${article.id}">${FRONTSTAGE_COPY.actions.promoteSource}</button>`
          : "";

        return `
          <article class="simple-item article-item ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}" data-article-id="${article.id}">
            <div class="article-row list-row">
              <label class="article-check">
                <input type="checkbox" data-article-check="${article.id}" ${isSelected ? "checked" : ""} />
              </label>
              <div class="article-main list-main">
                <a class="article-title" href="${escapeHtml(article.originalUrl)}" target="_blank" rel="noreferrer">${escapeHtml(article.originalTitle)}</a>
                <p class="article-summary list-summary">${escapeHtml(summary)}</p>
                <div class="meta-row article-meta-row">
                  <span>${escapeHtml(metaTexts.primary)}</span>
                  <span>${escapeHtml(metaTexts.secondary)}</span>
                </div>
              </div>
              <div class="article-actions compact-article-actions">
                <span class="status-badge ${statusClass}">${escapeHtml(article.status)}</span>
                ${promoteButton}
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  };

  elements.articleList.innerHTML = `
    <div class="content-split-grid">
      <section class="content-subpanel">
        <div class="subpanel-head">
          <h4>${FRONTSTAGE_COPY.labels.trackedTitle}</h4>
          <span class="pill">${buildGroupCountLabel("tracked", trackedArticles.length)}</span>
        </div>
        <div class="simple-list article-link-list compact-list">${renderArticleGroup(trackedArticles, "tracked")}</div>
      </section>
      <section class="content-subpanel">
        <div class="subpanel-head">
          <h4>${FRONTSTAGE_COPY.labels.openTitle}</h4>
          <span class="pill">${buildGroupCountLabel("open", openArticles.length)}</span>
        </div>
        <div class="simple-list article-link-list compact-list">${renderArticleGroup(openArticles, "open")}</div>
      </section>
    </div>
  `;

  renderSelectionSummary();

  elements.articleList.querySelectorAll("[data-article-id]").forEach((node) => {
    node.addEventListener("click", () => {
      selectArticle(Number(node.dataset.articleId));
    });
  });

  elements.articleList.querySelectorAll("[data-article-check]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    node.addEventListener("change", () => {
      toggleArticleSelection(Number(node.dataset.articleCheck));
      renderArticles();
      renderReviewQueue();
      renderPermissions();
    });
  });

  elements.articleList.querySelectorAll("[data-promote-source]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      promoteArticleSource(Number(node.dataset.promoteSource)).catch(showActionError);
    });
  });
}

function renderReviewQueue() {
  const queueArticles = getWorkbenchArticles();
  elements.reviewQueue.innerHTML = queueArticles.length
    ? queueArticles
      .map((article) => {
        const metaTexts = buildReviewQueueMetaLines(article);
        return `
        <article class="simple-item review-item ${article.id === appState.selectedArticleId ? "active" : ""}" data-queue-article="${article.id}">
          <h4>${escapeHtml(article.newTitle || article.originalTitle)}</h4>
          <div class="meta-row">
            <span>${escapeHtml(metaTexts.primary)}</span>
            <span>${escapeHtml(metaTexts.secondary)}</span>
          </div>
          <p class="note-text">${escapeHtml(buildReviewQueueSummaryText(article))}</p>
        </article>
      `;
      })
      .join("")
    : `<div class="empty-state">${FRONTSTAGE_COPY.empty.reviewQueue}</div>`;

  elements.reviewQueue.querySelectorAll("[data-queue-article]").forEach((node) => {
    node.addEventListener("click", () => {
      selectArticle(Number(node.dataset.queueArticle), { scrollToWorkbench: false });
    });
  });
}

function renderDetail() {
  const article = getSelectedArticle();
  const { duplicateStatus } = getStatusEnums();
  if (!article) {
    elements.detailEmpty.classList.remove("hidden");
    elements.detailPanel.classList.add("hidden");
    elements.detailStatus.textContent = FRONTSTAGE_COPY.status.detailIdle;
    elements.publishResult.textContent = FRONTSTAGE_COPY.placeholders.publishResultIdle;
    elements.publishResult.classList.add("is-empty");
    elements.aiHistory.innerHTML = `<div class="empty-state compact-empty">${FRONTSTAGE_COPY.empty.aiHistory}</div>`;
    elements.keepDuplicateButton.classList.add("hidden");
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.detailPanel.classList.remove("hidden");
  elements.publishResult.classList.remove("is-empty");
  elements.detailStatus.textContent = buildDetailStatusLabel(article);
  elements.detailSource.textContent = buildDetailSourceText(article);
  elements.detailUrl.textContent = article.originalUrl;
  elements.detailUrl.href = article.originalUrl;
  elements.detailTime.textContent = buildDetailTimeText(article);
  elements.detailSimilarity.textContent = buildDetailSimilarityLabel(article);
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
  elements.publishResult.textContent = buildPublishResultText(article, categoryName) || FRONTSTAGE_COPY.placeholders.publishResultIdle;
  elements.publishResult.classList.toggle("is-empty", !article.portalUrl);
  if (elements.aiActionsNote) {
    elements.aiActionsNote.textContent = buildAiActionNote(categoryName);
  }
  if (elements.publishResultNote) {
    elements.publishResultNote.textContent = buildPublishResultNote(categoryName);
  }
  syncForwardActionLabels(Number(elements.category.value) || article.recommendedCategoryId);
  elements.keepDuplicateButton.classList.toggle(
    "hidden",
    !(article.duplicateStatus === duplicateStatus.SUSPECTED && canDecideDuplicate())
  );

  renderCategoryOptions();

  const aiHistoryItems = Array.isArray(article.aiHistory) ? article.aiHistory : [];
  elements.aiHistory.innerHTML = aiHistoryItems.length
    ? aiHistoryItems
      .map((item) => {
        const metaText = buildAiHistoryMetaText(item);
        const excerpt = buildAiHistoryExcerpt(item);
        return `
          <article class="history-item">
            <div class="history-item-head">
              <strong class="history-item-type">${escapeHtml(item.type || FRONTSTAGE_COPY.common.historyFallbackType)}</strong>
                    <span class="history-item-meta">${escapeHtml(metaText || FRONTSTAGE_COPY.placeholders.aiHistoryIdle)}</span>
                  </div>
                  <p class="history-item-body">${escapeHtml(excerpt || FRONTSTAGE_COPY.notes.aiHistoryResultIdle)}</p>
                </article>
        `;
      })
      .join("")
    : `<div class="empty-state compact-empty">${FRONTSTAGE_COPY.empty.aiHistory}</div>`;

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
    elements.discoverButton,
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

  if (elements.selectAllButton) {
    elements.selectAllButton.disabled = !appState.articles.length;
  }
  if (elements.clearSelectedButton) {
    elements.clearSelectedButton.disabled = !appState.selectedArticleIds.length;
  }
  if (elements.sendToWorkbenchButton) {
    elements.sendToWorkbenchButton.disabled = !isEditorRole() || !(appState.selectedArticleIds.length || appState.selectedArticleId);
  }
  if (elements.batchForwardButton) {
    elements.batchForwardButton.disabled = !isReviewerRole() || !(appState.selectedArticleIds.length || appState.selectedArticleId);
  }
}

// ========== 第三部分：发布榜与全量刷新 ==========
function formatPublishBoardDay(value) {
  const dateValue = normalizeDateValue(value);
  if (!dateValue) {
    return FRONTSTAGE_COPY.common.undated;
  }
  return dateValue.toISOString().slice(0, 10);
}

function formatPublishBoardTime(value) {
  const dateValue = normalizeDateValue(value);
  if (!dateValue) {
    return "";
  }
  return `${String(dateValue.getHours()).padStart(2, "0")}:${String(dateValue.getMinutes()).padStart(2, "0")}`;
}

function renderPublishBoard() {
  const publishedArticles = appState.articles
    .filter((article) => article.portalUrl)
    .slice()
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));

  elements.publishBoardSummary.innerHTML = "";

  if (!publishedArticles.length) {
    elements.publishBoardList.innerHTML = `<div class="empty-state">${FRONTSTAGE_COPY.empty.publishBoard}</div>`;
    return;
  }

  const groups = publishedArticles.reduce((map, article) => {
    const groupKey = formatPublishBoardDay(article.updatedAt || article.createdAt || article.publishTime);
    const bucket = map.get(groupKey) || [];
    bucket.push(article);
    map.set(groupKey, bucket);
    return map;
  }, new Map());

  elements.publishBoardList.innerHTML = `
    <div class="publish-date-list">
      ${Array.from(groups.entries()).map(([day, articles]) => `
        <section class="publish-date-group">
          <div class="publish-date-head">
            <h3 class="publish-date-label">${escapeHtml(day)}</h3>
            <span class="pill">${articles.length} ${FRONTSTAGE_COPY.labels.articleUnit}</span>
          </div>
          <div class="publish-date-items">
            ${articles.map((article) => {
              const metaTexts = buildPublishBoardMetaLines(article);
              return `
              <article class="publish-row">
                <div class="publish-row-main">
                  <a class="article-title publish-row-title" href="${escapeHtml(article.portalUrl || "#")}" target="_blank" rel="noreferrer">${escapeHtml(article.newTitle || article.originalTitle)}</a>
                  <div class="meta-row publish-row-meta">
                    <span>${escapeHtml(metaTexts.primary)}</span>
                    <span>${escapeHtml(metaTexts.secondary)}</span>
                  </div>
                </div>
                <a class="publish-row-link" href="${escapeHtml(article.portalUrl || "#")}" target="_blank" rel="noreferrer">${FRONTSTAGE_COPY.links.view}</a>
              </article>
            `;
            }).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderCollectionStatus() {
  if (!elements.discoverStatus) {
    return;
  }

  const enabledKeywordCount = appState.keywords.filter((item) => item.enabled).length;
  const enabledSourceCount = appState.sourceSites.filter((item) => item.enabled).length;
  const latestTask = appState.tasks[0];

  elements.discoverStatus.textContent = buildCollectionStatusText(
    enabledKeywordCount,
    enabledSourceCount,
    latestTask
  );
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
  if (!appState.selectedArticleIds.length && previousSelectedArticleId) {
    appState.selectedArticleIds = [previousSelectedArticleId];
  }
  appState.selectedArticleId = previousSelectedArticleId;
  syncArticleState();
  renderAll();
}

function renderAll() {
  renderSession();
  renderCollectionStatus();
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
  renderReviewQueue();
  renderPublishBoard();
  renderDetail();
  renderPermissions();
}
