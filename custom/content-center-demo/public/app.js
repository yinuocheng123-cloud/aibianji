/**
 * 文件说明：该文件实现整木网编辑中台前台脚本的入口层。
 * 功能说明：负责登录提交、事件绑定、初始化启动与全局错误兜底。
 *
 * 结构概览：
 *   第一部分：登录动作
 *   第二部分：事件绑定
 *   第三部分：启动与异常处理
 */

// ========== 第一部分：登录动作 ==========
async function handleLoginSubmit(event) {
  event.preventDefault();
  elements.loginError.textContent = "";

  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  const submitButton = elements.loginForm.querySelector('button[type="submit"]');

  if (!username || !password) {
    elements.loginError.textContent = FRONTSTAGE_COPY.errors.loginEmptyCredentials;
    showLogin();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = FRONTSTAGE_COPY.actions.loginSubmitting;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || FRONTSTAGE_COPY.errors.loginFailed);
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
    elements.loginError.textContent = error.message || FRONTSTAGE_COPY.errors.loginFailed;
    showLogin();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = FRONTSTAGE_COPY.actions.loginSubmit;
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
  appState.selectedArticleIds = [];
  appState.reviewQueueIds = [];
  renderAll();
  showLogin();
}

// ========== 第二部分：事件绑定 ==========
function bindEvents() {
  const bindAsyncClick = (element, handler) => {
    if (!element) {
      return;
    }
    element.addEventListener("click", () => {
      Promise.resolve()
        .then(handler)
        .catch(showActionError);
    });
  };

  const loginSubmitButton = elements.loginForm.querySelector('button[type="submit"]');
  if (loginSubmitButton) {
    loginSubmitButton.textContent = FRONTSTAGE_COPY.actions.loginSubmit;
  }

  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  bindAsyncClick(elements.logoutButton, logout);
  bindAsyncClick(elements.saveSourceButton, saveSource);
  bindAsyncClick(elements.previewSourceButton, previewSource);
  elements.resetSourceButton.addEventListener("click", resetSourceForm);

  bindAsyncClick(elements.saveKeywordButton, saveKeyword);
  elements.resetKeywordButton.addEventListener("click", resetKeywordForm);

  bindAsyncClick(elements.saveAiSettingsButton, saveAiSettings);

  bindAsyncClick(elements.discoverButton, runDiscovery);

  bindAsyncClick(elements.runTaskButton, runTask);

  elements.selectAllButton.addEventListener("click", selectAllFilteredArticles);
  elements.clearSelectedButton.addEventListener("click", clearSelectedArticles);
  elements.sendToWorkbenchButton.addEventListener("click", () => {
    try {
      sendSelectedToWorkbench();
    } catch (error) {
      showActionError(error);
    }
  });
  bindAsyncClick(elements.batchForwardButton, batchForwardSelectedArticles);

  [elements.filterSearch, elements.filterStatus, elements.filterSource, elements.filterKeyword].forEach(bindFilterEvents);

  elements.category.addEventListener("change", () => {
    syncForwardActionLabels(Number(elements.category.value));
  });

  document.querySelectorAll("[data-ai-action]").forEach((button) => {
    bindAsyncClick(button, () => runAiAction(button.dataset.aiAction));
  });

  bindAsyncClick(elements.saveButton, saveDraft);
  if (elements.directForwardButton) {
    bindAsyncClick(elements.directForwardButton, directForwardArticle);
  }
  bindAsyncClick(elements.submitButton, submitForReview);
  bindAsyncClick(elements.keepDuplicateButton, keepSuspectedDuplicate);
  bindAsyncClick(elements.approveButton, () => reviewArticle("approve"));
  bindAsyncClick(elements.rejectButton, () => reviewArticle("reject"));
  bindAsyncClick(elements.publishButton, () => reviewArticle("publish"));
  bindAsyncClick(elements.archiveButton, () => reviewArticle("archive"));
}

// ========== 第三部分：启动与异常处理 ==========
async function initialize() {
  configureFrontstageLayout();
  bindEvents();
  applyLoginQueryState();
  resetSourceForm();
  resetKeywordForm();

  try {
    await loadBootstrap();
  } catch (error) {
    const message = String(error?.message || "");
    if (message === FRONTSTAGE_COPY.errors.loginRequired) {
      elements.loginError.textContent = "";
      showLogin();
      return;
    }
    showBootError(`${FRONTSTAGE_COPY.errors.bootInitPrefix}${message}`);
  }
}

window.addEventListener("error", (event) => {
  if (!event?.message) {
    return;
  }
  showBootError(`${FRONTSTAGE_COPY.errors.bootScriptPrefix}${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const message = typeof reason === "string"
    ? reason
    : (reason?.message || FRONTSTAGE_COPY.common.unknownError);
  showBootError(`${FRONTSTAGE_COPY.errors.bootRequestPrefix}${message}`);
});

initialize();
