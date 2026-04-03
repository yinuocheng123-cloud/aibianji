/**
 * 文件说明：该文件实现整木网编辑中台的 API 路由层。
 * 功能说明：负责鉴权、角色校验、Bootstrap 输出，以及抓取源、关键词、AI、任务和文章工作流接口。
 *
 * 结构概览：
 *   第一部分：会话与通用响应
 *   第二部分：Bootstrap 与配置接口
 *   第三部分：任务与文章工作流接口
 */

const crypto = require("crypto");
const {
  ARTICLE_STATUS,
  DUPLICATE_STATUS,
  FAILURE_STAGES,
  LOG_TYPES,
  PUBLISH_STATUS,
  ROLES,
  SESSION_COOKIE
} = require("../shared/constants");
const {
  clearSessionCookie,
  createId,
  nowText,
  parseCookies,
  readRequestBody,
  sanitizeUser,
  sendJson,
  sha256,
  toSetCookie
} = require("../shared/utils");

// ========== 第一部分：会话与通用响应 ==========
function createApiRouter({ sessions, store, aiService, crawlService }) {
  function getCurrentUser(request) {
    const cookies = parseCookies(request);
    const token = cookies[SESSION_COOKIE];
    if (!token || !sessions.has(token)) {
      return null;
    }
    const session = sessions.get(token);
    return store.getState().users.find((user) => user.id === session.userId) || null;
  }

  function requireAuth(request, response) {
    const user = getCurrentUser(request);
    if (!user) {
      sendJson(response, 401, { message: "请先登录" });
      return null;
    }
    return user;
  }

  function requireRole(user, response, roles) {
    if (!roles.includes(user.role)) {
      sendJson(response, 403, { message: "当前角色无权执行该操作" });
      return false;
    }
    return true;
  }

  function buildDashboard() {
    const state = store.getState();
    const totalArticles = state.articles.length;
    const pendingReview = state.articles.filter((item) => [
      ARTICLE_STATUS.PENDING_REVIEW,
      ARTICLE_STATUS.EDITING,
      ARTICLE_STATUS.PENDING_APPROVAL
    ].includes(item.status)).length;
    const published = state.articles.filter((item) => item.publishStatus === PUBLISH_STATUS.PUBLISHED).length;
    const aiCalls = state.articles.reduce((count, item) => count + ((item.aiHistory || []).length), 0);
    const duplicateCount = state.articles.filter((item) => item.duplicateStatus !== DUPLICATE_STATUS.PASSED).length;

    return {
      stats: [
        { label: "今日抓取线索", value: totalArticles, hint: "已入内容池并可追溯来源" },
        { label: "待处理内容", value: pendingReview, hint: "待审核 / 编辑中 / 待复审" },
        { label: "AI 调用次数", value: aiCalls, hint: "摘要、标题、改写、扩写总计" },
        { label: "疑似重复", value: duplicateCount, hint: "需人工判断是否保留" },
        { label: "已发布", value: published, hint: "演示接口回写主站信息" }
      ]
    };
  }

  function buildBootstrapPayload(user) {
    const state = store.getState();
    return {
      sessionUser: sanitizeUser(user),
      dashboard: buildDashboard(),
      sourceSites: [...state.sourceSites].sort((left, right) => Number(right.id) - Number(left.id)),
      keywords: [...state.keywords].sort((left, right) => Number(right.priority) - Number(left.priority)),
      categories: state.categories,
      tasks: [...state.tasks].sort((left, right) => String(right.startTime || "").localeCompare(String(left.startTime || ""))),
      articles: [...state.articles].sort((left, right) => String(right.crawlTime || "").localeCompare(String(left.crawlTime || ""))),
      logs: state.logs.slice(0, 30),
      crawlFailures: state.crawlFailures.slice(0, 20),
      aiSettings: user.role === ROLES.ADMIN ? aiService.getAiSettingsForClient() : null,
      statusEnums: {
        articleStatus: ARTICLE_STATUS,
        publishStatus: PUBLISH_STATUS,
        duplicateStatus: DUPLICATE_STATUS
      }
    };
  }

  function getArticleOrFail(articleId, response) {
    const article = store.getState().articles.find((item) => item.id === Number(articleId));
    if (!article) {
      sendJson(response, 404, { message: "未找到文章" });
      return null;
    }
    return article;
  }

  function normalizeDraftText(value) {
    return String(value ?? "").trim();
  }

  function normalizeTagList(value) {
    const rawList = Array.isArray(value) ? value : String(value || "").split(/[，,]/);
    return Array.from(new Set(rawList.map((item) => normalizeDraftText(item)).filter(Boolean)));
  }

  function applyArticleDraft(article, draftBody) {
    const fieldNames = ["newTitle", "summary", "rewrittenContent", "seoTitle", "seoDescription", "sourceNote"];
    fieldNames.forEach((field) => {
      if (draftBody[field] !== undefined) {
        article[field] = normalizeDraftText(draftBody[field]);
      }
    });

    if (draftBody.tags !== undefined) {
      article.tags = normalizeTagList(draftBody.tags);
    }

    if (draftBody.recommendedCategoryId !== undefined) {
      const nextCategoryId = Number(draftBody.recommendedCategoryId);
      article.recommendedCategoryId = Number.isFinite(nextCategoryId) && nextCategoryId > 0
        ? nextCategoryId
        : (article.recommendedCategoryId || 1);
    }
  }

  // ========== 第二部分：Bootstrap 与配置接口 ==========
  async function handleApi(request, response, urlObject) {
    const pathname = urlObject.pathname;

    if (request.method === "POST" && pathname === "/api/auth/login") {
      const body = await readRequestBody(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const user = store.getState().users.find((item) => item.username === username && item.status === "enabled");

      if (!user || user.passwordHash !== sha256(password)) {
        sendJson(response, 401, { message: "用户名或密码错误" });
        return;
      }

      const token = crypto.randomUUID();
      sessions.set(token, { userId: user.id, createdAt: Date.now() });
      store.appendLog(LOG_TYPES.LOGIN, `${user.displayName} 登录系统。`);
      sendJson(response, 200, buildBootstrapPayload(user), { "Set-Cookie": toSetCookie(token) });
      return;
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      const cookies = parseCookies(request);
      const token = cookies[SESSION_COOKIE];
      if (token) {
        sessions.delete(token);
      }
      sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
      return;
    }

    const user = requireAuth(request, response);
    if (!user) {
      return;
    }

    if (request.method === "GET" && pathname === "/api/bootstrap") {
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    if (request.method === "POST" && pathname === "/api/sources/preview") {
      if (!requireRole(user, response, [ROLES.ADMIN])) {
        return;
      }

      const body = await readRequestBody(request);
      const sourceDraft = {
        name: String(body.name || "").trim() || "预览抓取源",
        domain: String(body.domain || "").trim(),
        sourceType: String(body.sourceType || "网站").trim(),
        entryUrl: String(body.entryUrl || "").trim(),
        parseRule: String(body.parseRule || "article").trim(),
        excludeRule: String(body.excludeRule || "").trim()
      };

      if (!sourceDraft.entryUrl) {
        sendJson(response, 400, { message: "请先填写抓取入口 URL" });
        return;
      }

      try {
        const preview = await crawlService.previewSourceExtraction(sourceDraft);
        sendJson(response, 200, preview);
      } catch (error) {
        const responsePreview = String(error.responsePreview || "").trim();
        store.appendCrawlFailure({
          taskId: 0,
          sourceId: 0,
          keywordId: 0,
          sourceName: sourceDraft.name,
          keyword: "",
          stage: FAILURE_STAGES.PREVIEW,
          message: error.message
        });
        store.saveState();
        sendJson(response, 400, {
          message: error.message,
          responsePreview,
          preview: {
            title: "提取预览失败",
            publishTime: "",
            extractionMode: "失败兜底 / 原始响应摘要",
            rawText: responsePreview,
            responsePreview,
            cleanText: responsePreview || "未能获取可用正文，请检查入口 URL、网络连通性或正文提取规则。",
            isFallback: true,
            errorMessage: error.message
          }
        });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/sources/save") {
      if (!requireRole(user, response, [ROLES.ADMIN])) {
        return;
      }

      const body = await readRequestBody(request);
      const sourceId = Number(body.id || 0);
      const payload = {
        name: String(body.name || "").trim(),
        domain: String(body.domain || "").trim(),
        sourceType: String(body.sourceType || "网站").trim(),
        entryUrl: String(body.entryUrl || "").trim(),
        crawlInterval: String(body.crawlInterval || "每天 09:00").trim(),
        enabled: Boolean(body.enabled),
        parseRule: String(body.parseRule || "article").trim(),
        excludeRule: String(body.excludeRule || "").trim()
      };

      if (!payload.name || !payload.domain || !payload.entryUrl) {
        sendJson(response, 400, { message: "请完整填写抓取源名称、域名和入口 URL" });
        return;
      }

      const state = store.getState();
      if (sourceId) {
        const source = state.sourceSites.find((item) => item.id === sourceId);
        if (!source) {
          sendJson(response, 404, { message: "抓取源不存在" });
          return;
        }
        Object.assign(source, payload, { updatedAt: nowText() });
        store.appendLog(LOG_TYPES.CONFIG, `抓取源“${source.name}”已更新。`);
      } else {
        state.sourceSites.unshift({
          id: createId(),
          ...payload,
          lastResult: "尚未执行抓取任务",
          createdAt: nowText(),
          updatedAt: nowText()
        });
        store.appendLog(LOG_TYPES.CONFIG, `新增抓取源“${payload.name}”。`);
      }

      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    if (request.method === "POST" && pathname === "/api/keywords/save") {
      if (!requireRole(user, response, [ROLES.ADMIN])) {
        return;
      }

      const body = await readRequestBody(request);
      const keywordId = Number(body.id || 0);
      const payload = {
        keyword: String(body.keyword || "").trim(),
        keywordType: String(body.keywordType || "行业词").trim(),
        priority: Number(body.priority || 1),
        categoryId: Number(body.categoryId || 1),
        enabled: Boolean(body.enabled),
        excludeWords: String(body.excludeWords || "").trim(),
        remark: String(body.remark || "").trim()
      };

      if (!payload.keyword) {
        sendJson(response, 400, { message: "关键词不能为空" });
        return;
      }

      const state = store.getState();
      if (keywordId) {
        const keyword = state.keywords.find((item) => item.id === keywordId);
        if (!keyword) {
          sendJson(response, 404, { message: "关键词不存在" });
          return;
        }
        Object.assign(keyword, payload, { updatedAt: nowText() });
        store.appendLog(LOG_TYPES.CONFIG, `关键词“${keyword.keyword}”已更新。`);
      } else {
        state.keywords.unshift({ id: createId(), ...payload, hitCount: 0, createdAt: nowText(), updatedAt: nowText() });
        store.appendLog(LOG_TYPES.CONFIG, `新增关键词“${payload.keyword}”。`);
      }

      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    if (request.method === "POST" && pathname === "/api/ai/settings/save") {
      if (!requireRole(user, response, [ROLES.ADMIN])) {
        return;
      }

      aiService.updateAiSettings(await readRequestBody(request), user.displayName);
      store.appendLog(LOG_TYPES.AI, `${user.displayName} 更新了 AI 后台配置。`);
      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    // ========== 第三部分：任务与文章工作流接口 ==========
    if (request.method === "POST" && pathname === "/api/tasks/run") {
      if (!requireRole(user, response, [ROLES.ADMIN])) {
        return;
      }

      const body = await readRequestBody(request);
      try {
        await crawlService.runTask(
          Number(body.sourceId),
          Array.isArray(body.keywordIds) ? body.keywordIds.map(Number) : [],
          user.displayName,
          {
            keepSuspectedDuplicates: body.keepSuspectedDuplicates !== false
          }
        );
        sendJson(response, 200, buildBootstrapPayload(user));
      } catch (error) {
        sendJson(response, 400, { message: error.message });
      }
      return;
    }

    if (request.method === "POST" && /^\/api\/articles\/\d+\/ai\/(summary|title|rewrite|expand)$/.test(pathname)) {
      if (!requireRole(user, response, [ROLES.ADMIN, ROLES.EDITOR])) {
        return;
      }

      const [, articleId, action] = pathname.match(/^\/api\/articles\/(\d+)\/ai\/(summary|title|rewrite|expand)$/);
      const article = getArticleOrFail(articleId, response);
      if (!article) {
        return;
      }

      const fallbackResult = aiService.createAiResult(article, action);
      let result = fallbackResult;
      try {
        const deepSeekResult = await aiService.callDeepSeek(article, action);
        if (deepSeekResult) {
          result = { ...fallbackResult, value: deepSeekResult.content, model: deepSeekResult.model };
        }
      } catch (error) {
        store.appendLog(LOG_TYPES.AI, `文章 ${article.id} 调用真实 DeepSeek 失败，已回退占位结果：${error.message}`);
      }

      article[result.field] = result.value;
      article.aiHistory.unshift({ type: result.historyType, model: result.model, createdAt: nowText() });
      article.updatedAt = nowText();
      store.appendLog(LOG_TYPES.AI, `文章 ${article.id} 调用 ${result.model} 执行${result.historyType}。`);
      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    if (request.method === "POST" && /^\/api\/articles\/\d+\/save$/.test(pathname)) {
      if (!requireRole(user, response, [ROLES.ADMIN, ROLES.EDITOR])) {
        return;
      }

      const [, articleId] = pathname.match(/^\/api\/articles\/(\d+)\/save$/);
      const article = getArticleOrFail(articleId, response);
      if (!article) {
        return;
      }

      const body = await readRequestBody(request);
      applyArticleDraft(article, body);
      article.status = ARTICLE_STATUS.EDITING;
      article.assignedEditor = user.displayName;
      article.updatedAt = nowText();
      store.appendLog(LOG_TYPES.EDIT, `文章 ${article.id} 已由 ${user.displayName} 保存草稿。`);
      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    if (request.method === "POST" && /^\/api\/articles\/\d+\/submit$/.test(pathname)) {
      if (!requireRole(user, response, [ROLES.ADMIN, ROLES.EDITOR])) {
        return;
      }

      const [, articleId] = pathname.match(/^\/api\/articles\/(\d+)\/submit$/);
      const article = getArticleOrFail(articleId, response);
      if (!article) {
        return;
      }

      article.status = ARTICLE_STATUS.PENDING_APPROVAL;
      article.assignedEditor = user.displayName;
      article.updatedAt = nowText();
      store.appendLog(LOG_TYPES.EDIT, `文章 ${article.id} 已由 ${user.displayName} 提交审核。`);
      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    if (request.method === "POST" && /^\/api\/articles\/\d+\/review$/.test(pathname)) {
      if (!requireRole(user, response, [ROLES.ADMIN, ROLES.REVIEWER])) {
        return;
      }

      const [, articleId] = pathname.match(/^\/api\/articles\/(\d+)\/review$/);
      const article = getArticleOrFail(articleId, response);
      if (!article) {
        return;
      }

      const body = await readRequestBody(request);
      const action = String(body.action || "").trim();
      article.reviewer = user.displayName;
      article.reviewComment = String(body.comment || "").trim();
      article.updatedAt = nowText();

      if (action === "reject") {
        article.status = ARTICLE_STATUS.REJECTED;
        article.publishStatus = PUBLISH_STATUS.UNPUBLISHED;
        store.appendLog(LOG_TYPES.REVIEW, `文章 ${article.id} 被 ${user.displayName} 驳回。`);
      } else if (action === "approve") {
        article.status = ARTICLE_STATUS.APPROVED;
        article.publishStatus = PUBLISH_STATUS.PENDING;
        store.appendLog(LOG_TYPES.REVIEW, `文章 ${article.id} 已由 ${user.displayName} 审核通过。`);
      } else if (action === "publish") {
        article.status = ARTICLE_STATUS.PUBLISHED;
        article.publishStatus = PUBLISH_STATUS.PUBLISHED;
        article.portalArticleId = `portal-${article.id}`;
        article.portalUrl = `https://portal.example.com/articles/${article.id}`;
        store.appendLog(LOG_TYPES.PUBLISH, `文章 ${article.id} 已发布并回写主站信息。`);
      } else if (action === "archive") {
        article.status = ARTICLE_STATUS.ARCHIVED;
        article.publishStatus = article.publishStatus === PUBLISH_STATUS.PUBLISHED ? PUBLISH_STATUS.PUBLISHED : PUBLISH_STATUS.UNPUBLISHED;
        store.appendLog(LOG_TYPES.ARCHIVE, `文章 ${article.id} 已归档。`);
      } else {
        sendJson(response, 400, { message: "不支持的审核动作" });
        return;
      }

      store.saveState();
      sendJson(response, 200, buildBootstrapPayload(user));
      return;
    }

    sendJson(response, 404, { message: "接口不存在" });
  }

  return {
    handleApi
  };
}

module.exports = {
  createApiRouter
};
