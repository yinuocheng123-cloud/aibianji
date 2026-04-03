/**
 * 文件说明：该文件实现整木网编辑中台 MVP 的本地端到端回归脚本。
 * 功能说明：负责串联登录、预览、抓取、AI、保存、提审与发布，快速验证主流程是否可用。
 *
 * 结构概览：
 *   第一部分：环境参数与基础工具
 *   第二部分：接口请求与断言
 *   第三部分：主流程回归执行
 */

const assert = require("assert");

// ========== 第一部分：环境参数与基础工具 ==========
const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3210";
const ADMIN_USERNAME = process.env.SMOKE_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "admin123";
const REVIEWER_USERNAME = process.env.SMOKE_REVIEWER_USERNAME || "reviewer";
const REVIEWER_PASSWORD = process.env.SMOKE_REVIEWER_PASSWORD || "reviewer123";
const KEEP_SUSPECTED_DUPLICATES = process.env.SMOKE_KEEP_SUSPECTED_DUPLICATES !== "0";
const RETAIN_SUSPECTED_AFTER_CREATE = process.env.SMOKE_RETAIN_SUSPECTED_AFTER_CREATE !== "0";

function createStamp() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ========== 第二部分：接口请求与断言 ==========
function createSessionClient() {
  let cookie = "";

  return {
    async request(pathname, { method = "GET", body, allowError = false } = {}) {
      const headers = { "Content-Type": "application/json" };
      if (cookie) {
        headers.Cookie = cookie;
      }

      const response = await fetch(`${BASE_URL}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        cookie = setCookie.split(";")[0];
      }

      const payload = await response.json().catch(() => ({}));
      if (!allowError && !response.ok) {
        throw new Error(`${pathname} -> ${response.status} ${payload.message || ""}`.trim());
      }

      return {
        status: response.status,
        payload
      };
    }
  };
}

function getArticleByKeyword(articleList, keyword) {
  return (articleList || []).find((item) => Array.isArray(item.hitKeywords) && item.hitKeywords.includes(keyword));
}

// ========== 第三部分：主流程回归执行 ==========
async function runSmoke() {
  const adminClient = createSessionClient();
  const reviewerClient = createSessionClient();
  const stamp = createStamp();
  const sourceName = `联调源-${stamp}`;
  const keywordText = `case-${stamp}`;

  const adminLogin = await adminClient.request("/api/auth/login", {
    method: "POST",
    body: {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    }
  });
  assert.strictEqual(adminLogin.status, 200, "管理员登录失败");

  const preview = await adminClient.request("/api/sources/preview", {
    method: "POST",
    body: {
      name: "预览测试源",
      domain: "preview.invalid",
      sourceType: "网站",
      entryUrl: "https://preview.invalid/article",
      parseRule: "article .content-body",
      excludeRule: ".ad,.recommend"
    },
    allowError: true
  });
  assert.strictEqual(preview.status, 400, "预览失败兜底应返回 400");
  assert.strictEqual(preview.payload.preview?.isFallback, true, "预览失败时应返回兜底预览");
  assert.ok(
    preview.payload.preview?.cleanText || preview.payload.preview?.rawText || preview.payload.preview?.responsePreview,
    "预览失败兜底应保留可展示摘要"
  );

  const sourceSave = await adminClient.request("/api/sources/save", {
    method: "POST",
    body: {
      name: sourceName,
      domain: `source-${stamp}.example.com`,
      sourceType: "网站",
      entryUrl: `https://source-${stamp}.example.com/news`,
      crawlInterval: "每天 09:00",
      enabled: true,
      parseRule: "article .content-body",
      excludeRule: ".ad,.recommend"
    }
  });
  const source = (sourceSave.payload.sourceSites || []).find((item) => item.name === sourceName);
  assert.ok(source, "测试抓取源创建失败");

  const keywordSave = await adminClient.request("/api/keywords/save", {
    method: "POST",
    body: {
      keyword: keywordText,
      keywordType: "产品词",
      priority: 6,
      categoryId: 2,
      enabled: true,
      excludeWords: "",
      remark: "本地回归脚本自动创建"
    }
  });
  const keyword = (keywordSave.payload.keywords || []).find((item) => item.keyword === keywordText);
  assert.ok(keyword, "测试关键词创建失败");

  const runTask = await adminClient.request("/api/tasks/run", {
    method: "POST",
    body: {
      sourceId: source.id,
      keywordIds: [keyword.id],
      keepSuspectedDuplicates: KEEP_SUSPECTED_DUPLICATES
    }
  });
  const article = getArticleByKeyword(runTask.payload.articles, keywordText);
  assert.ok(article, `抓取任务未生成可处理文章，请检查任务日志：${runTask.payload.tasks?.[0]?.logText || "无日志"}`);

  const aiSummary = await adminClient.request(`/api/articles/${article.id}/ai/summary`, {
    method: "POST"
  });
  const aiArticle = getArticleByKeyword(aiSummary.payload.articles, keywordText);
  assert.ok(aiArticle, "AI 摘要后未找到测试文章");
  assert.ok(Array.isArray(aiArticle.aiHistory) && aiArticle.aiHistory.length >= 1, "AI 历史未记录");

  let retainedArticle = aiArticle;
  let retainedSuspected = false;
  if (
    RETAIN_SUSPECTED_AFTER_CREATE &&
    aiArticle.duplicateStatus === aiSummary.payload.statusEnums.duplicateStatus.SUSPECTED
  ) {
    const keepResult = await adminClient.request(`/api/articles/${article.id}/keep-suspected`, {
      method: "POST"
    });
    retainedArticle = getArticleByKeyword(keepResult.payload.articles, keywordText);
    assert.ok(retainedArticle, "人工保留疑似重复后未找到测试文章");
    assert.strictEqual(
      retainedArticle.duplicateStatus,
      keepResult.payload.statusEnums.duplicateStatus.PASSED,
      "人工保留后疑似重复状态未改为通过"
    );
    retainedSuspected = true;
  }

  const saveDraft = await adminClient.request(`/api/articles/${article.id}/save`, {
    method: "POST",
    body: {
      newTitle: `${keywordText} 联调发布标题`,
      summary: "联调摘要",
      rewrittenContent: "联调正文内容，用于验证保存、提审和发布链路。",
      tags: [keywordText, "联调标签"],
      seoTitle: `${keywordText} SEO 标题`,
      seoDescription: `${keywordText} SEO 描述`,
      sourceNote: "联调来源说明",
      recommendedCategoryId: 2
    }
  });
  const savedArticle = getArticleByKeyword(saveDraft.payload.articles, keywordText);
  assert.ok(savedArticle, "保存草稿后未找到测试文章");
  assert.strictEqual(savedArticle.status, saveDraft.payload.statusEnums.articleStatus.EDITING, "保存草稿后状态不正确");
  assert.ok(Array.isArray(savedArticle.tags), "保存草稿后的标签应为数组");

  const submitReview = await adminClient.request(`/api/articles/${article.id}/submit`, {
    method: "POST"
  });
  const submittedArticle = getArticleByKeyword(submitReview.payload.articles, keywordText);
  assert.ok(submittedArticle, "提交复审后未找到测试文章");
  assert.strictEqual(
    submittedArticle.status,
    submitReview.payload.statusEnums.articleStatus.PENDING_APPROVAL,
    "提交复审后状态不正确"
  );

  await adminClient.request("/api/auth/logout", {
    method: "POST"
  });

  const reviewerLogin = await reviewerClient.request("/api/auth/login", {
    method: "POST",
    body: {
      username: REVIEWER_USERNAME,
      password: REVIEWER_PASSWORD
    }
  });
  assert.strictEqual(reviewerLogin.status, 200, "审核员登录失败");

  const publishReview = await reviewerClient.request(`/api/articles/${article.id}/review`, {
    method: "POST",
    body: {
      action: "publish",
      comment: "回归脚本自动发布"
    }
  });
  const publishedArticle = getArticleByKeyword(publishReview.payload.articles, keywordText);
  assert.ok(publishedArticle, "发布后未找到测试文章");
  assert.strictEqual(
    publishedArticle.status,
    publishReview.payload.statusEnums.articleStatus.PUBLISHED,
    "发布后文章状态不正确"
  );
  assert.strictEqual(
    publishedArticle.publishStatus,
    publishReview.payload.statusEnums.publishStatus.PUBLISHED,
    "发布后发布状态不正确"
  );
  assert.ok(publishedArticle.portalArticleId, "发布后未回写主站文章 ID");
  assert.ok(publishedArticle.portalUrl, "发布后未回写主站 URL");

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    keepSuspectedDuplicates: KEEP_SUSPECTED_DUPLICATES,
    retainedSuspected,
    previewStatus: preview.status,
    previewFallback: preview.payload.preview?.isFallback,
    sourceId: source.id,
    keywordId: keyword.id,
    articleId: article.id,
    duplicateStatus: retainedArticle.duplicateStatus,
    aiHistoryCount: aiArticle.aiHistory.length,
    savedStatus: savedArticle.status,
    submittedStatus: submittedArticle.status,
    publishedStatus: publishedArticle.status,
    publishStatus: publishedArticle.publishStatus,
    portalArticleId: publishedArticle.portalArticleId,
    portalUrl: publishedArticle.portalUrl,
    latestLog: publishReview.payload.logs?.[0]?.message || ""
  }, null, 2));
}

runSmoke().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
