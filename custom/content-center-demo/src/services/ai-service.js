/**
 * 文件说明：该文件实现整木网编辑中台的 AI 服务层。
 * 功能说明：负责合并 AI 配置、生成占位改写结果、调用 DeepSeek，并向前端返回可展示的配置摘要。
 *
 * 结构概览：
 *   第一部分：配置读取与占位结果
 *   第二部分：提示词与真实调用
 *   第三部分：对外服务接口
 */

const { AI_ENV_CONFIG } = require("../shared/constants");
const { maskSecret, normalizeNumber } = require("../shared/utils");

// ========== 第一部分：配置读取与占位结果 ==========
function createAiService({ store }) {
  function getEffectiveAiSettings() {
    const state = store.getState();
    const stored = state.aiSettings || store.createDefaultAiSettings();
    return {
      apiKey: stored.apiKey || AI_ENV_CONFIG.apiKey,
      baseUrl: (stored.baseUrl || AI_ENV_CONFIG.baseUrl).replace(/\/$/, ""),
      defaultModel: stored.defaultModel || AI_ENV_CONFIG.defaultModel,
      reasonerModel: stored.reasonerModel || AI_ENV_CONFIG.reasonerModel,
      temperature: normalizeNumber(stored.temperature, AI_ENV_CONFIG.temperature),
      maxTokens: normalizeNumber(stored.maxTokens, AI_ENV_CONFIG.maxTokens),
      timeoutMs: normalizeNumber(stored.timeoutMs, AI_ENV_CONFIG.timeoutMs),
      lastUpdatedAt: stored.lastUpdatedAt || "",
      lastUpdatedBy: stored.lastUpdatedBy || ""
    };
  }

  function getAiSettingsForClient() {
    const state = store.getState();
    const effective = getEffectiveAiSettings();
    return {
      hasApiKey: Boolean(effective.apiKey),
      apiKeyMasked: maskSecret(effective.apiKey),
      baseUrl: effective.baseUrl,
      defaultModel: effective.defaultModel,
      reasonerModel: effective.reasonerModel,
      temperature: effective.temperature,
      maxTokens: effective.maxTokens,
      timeoutMs: effective.timeoutMs,
      lastUpdatedAt: effective.lastUpdatedAt,
      lastUpdatedBy: effective.lastUpdatedBy,
      source: state.aiSettings?.apiKey || state.aiSettings?.baseUrl ? "后台配置" : "环境变量回退"
    };
  }

  function createAiResult(article, action) {
    const categoryName = store.getCategoryName(article.recommendedCategoryId);
    const keywordText = Array.isArray(article.hitKeywords) && article.hitKeywords.length
      ? article.hitKeywords.join("、")
      : "行业线索";

    if (action === "summary") {
      return {
        field: "summary",
        value: `围绕“${keywordText}”主题，原文线索显示该内容适合归入${categoryName}栏目，重点可概括为行业动态、落地价值和编辑切入点。`,
        historyType: "摘要",
        model: "deepseek-chat"
      };
    }

    if (action === "title") {
      return {
        field: "newTitle",
        value: `${article.hitKeywords[0] || "行业线索"}进入落地深化阶段，整木网可重点关注${categoryName}栏目`,
        historyType: "标题",
        model: "deepseek-chat"
      };
    }

    if (action === "rewrite") {
      return {
        field: "rewrittenContent",
        value: "从整木网编辑视角看，这条线索更适合改写成“行业变化 + 企业动作 + 读者价值”的门户稿结构。当前改写保留原始事实主线，并把表达调整为更适合行业读者快速阅读的资讯风格。",
        historyType: "改写",
        model: "deepseek-chat"
      };
    }

    return {
      field: "rewrittenContent",
      value: `这是扩写后的门户稿示例。正文围绕${keywordText}补充了背景、落地环节、潜在收益和行业观察，用于测试结构化整理和长文辅助能力。`,
      historyType: "扩写",
      model: "deepseek-reasoner"
    };
  }

  // ========== 第二部分：提示词与真实调用 ==========
  function buildAiPrompt(article, action) {
    const categoryName = store.getCategoryName(article.recommendedCategoryId);
    const effectiveAiSettings = getEffectiveAiSettings();
    const commonContext = `你是整木网编辑中台的内容助手。请基于以下公开线索进行处理。\n来源：${article.sourceName}\n栏目：${categoryName}\n原标题：${article.originalTitle}\n正文：${article.cleanText}`;

    if (action === "summary") {
      return {
        model: effectiveAiSettings.defaultModel,
        instruction: `${commonContext}\n请生成一段 70-110 字的中文摘要，只输出摘要正文。`
      };
    }

    if (action === "title") {
      return {
        model: effectiveAiSettings.defaultModel,
        instruction: `${commonContext}\n请生成一个适合整木网资讯栏目发布的中文标题，只输出标题。`
      };
    }

    if (action === "rewrite") {
      return {
        model: effectiveAiSettings.defaultModel,
        instruction: `${commonContext}\n请把正文改写成更适合行业门户发布的资讯风格，要求保留事实，不编造数据，只输出改写后的正文。`
      };
    }

    return {
      model: effectiveAiSettings.reasonerModel,
      instruction: `${commonContext}\n请扩写成适合整木网发布的长文正文，增加行业背景和编辑视角，但不得编造来源和事实，只输出正文。`
    };
  }

  async function callDeepSeek(article, action) {
    const effectiveAiSettings = getEffectiveAiSettings();
    if (!effectiveAiSettings.apiKey) {
      return null;
    }

    const { model, instruction } = buildAiPrompt(article, action);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveAiSettings.timeoutMs);

    try {
      const response = await fetch(`${effectiveAiSettings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveAiSettings.apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: effectiveAiSettings.temperature,
          max_tokens: effectiveAiSettings.maxTokens,
          messages: [{ role: "user", content: instruction }]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`DeepSeek 请求失败：HTTP ${response.status}`);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return null;
      }

      return { content, model };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ========== 第三部分：对外服务接口 ==========
  function updateAiSettings(payload, displayName) {
    const state = store.getState();
    const currentSettings = state.aiSettings || store.createDefaultAiSettings();
    const nextApiKey = String(payload.apiKey || "").trim();
    state.aiSettings = {
      apiKey: nextApiKey ? nextApiKey : currentSettings.apiKey,
      baseUrl: String(payload.baseUrl || currentSettings.baseUrl || AI_ENV_CONFIG.baseUrl).trim(),
      defaultModel: String(payload.defaultModel || currentSettings.defaultModel || AI_ENV_CONFIG.defaultModel).trim(),
      reasonerModel: String(payload.reasonerModel || currentSettings.reasonerModel || AI_ENV_CONFIG.reasonerModel).trim(),
      temperature: normalizeNumber(payload.temperature, currentSettings.temperature || AI_ENV_CONFIG.temperature),
      maxTokens: normalizeNumber(payload.maxTokens, currentSettings.maxTokens || AI_ENV_CONFIG.maxTokens),
      timeoutMs: normalizeNumber(payload.timeoutMs, currentSettings.timeoutMs || AI_ENV_CONFIG.timeoutMs),
      lastUpdatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      lastUpdatedBy: displayName
    };
  }

  return {
    callDeepSeek,
    createAiResult,
    getAiSettingsForClient,
    getEffectiveAiSettings,
    updateAiSettings
  };
}

module.exports = {
  createAiService
};
