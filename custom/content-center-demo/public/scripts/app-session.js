/**
 * 文件说明：该文件实现整木网编辑中台前台脚本的会话与登录态工具。
 * 功能说明：负责登录浮层展示、登录态持久化、查询参数恢复与启动异常提示。
 *
 * 结构概览：
 *   第一部分：登录浮层控制
 *   第二部分：会话令牌读写
 *   第三部分：登录查询状态恢复
 */

// ========== 第一部分：登录浮层控制 ==========
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

// ========== 第二部分：会话令牌读写 ==========
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
    // localStorage 在部分嵌入式环境中可能不可用，这里保留内存兜底。
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

// ========== 第三部分：登录查询状态恢复 ==========
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
