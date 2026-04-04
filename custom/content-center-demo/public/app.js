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
  appState.selectedArticleIds = [];
  appState.reviewQueueIds = [];
  renderAll();
  showLogin();
}

// ========== 第二部分：事件绑定 ==========
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

  elements.discoverButton.addEventListener("click", () => {
    runDiscovery().catch((error) => window.alert(error.message));
  });

  elements.runTaskButton.addEventListener("click", () => {
    runTask().catch((error) => window.alert(error.message));
  });

  elements.selectAllButton.addEventListener("click", selectAllFilteredArticles);
  elements.clearSelectedButton.addEventListener("click", clearSelectedArticles);
  elements.sendToWorkbenchButton.addEventListener("click", () => {
    try {
      sendSelectedToWorkbench();
    } catch (error) {
      window.alert(error.message);
    }
  });
  elements.batchForwardButton.addEventListener("click", () => {
    batchForwardSelectedArticles().catch((error) => window.alert(error.message));
  });

  [elements.filterSearch, elements.filterStatus, elements.filterSource, elements.filterKeyword].forEach(bindFilterEvents);

  elements.category.addEventListener("change", () => {
    syncForwardActionLabels(Number(elements.category.value));
  });

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
    if (message === "请先登录") {
      elements.loginError.textContent = "";
      showLogin();
      return;
    }
    showBootError(`初始化失败：${message}`);
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
