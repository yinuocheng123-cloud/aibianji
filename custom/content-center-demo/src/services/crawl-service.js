/**
 * 文件说明：该文件实现整木网编辑中台的抓取服务层。
 * 功能说明：负责正文提取、规则预览、去重判断，以及真实抓取与模拟抓取任务执行。
 *
 * 结构概览：
 *   第一部分：正文提取与预览
 *   第二部分：去重与文章构建
 *   第三部分：抓取任务执行
 */

const {
  ARTICLE_STATUS,
  DUPLICATE_STATUS,
  FAILURE_STAGES,
  LOG_TYPES,
  PUBLISH_STATUS,
  TASK_STATUS
} = require("../shared/constants");
const { calcSimilarity, createId, escapeRegExp, nowText } = require("../shared/utils");

// ========== 第一部分：正文提取与预览 ==========
function createCrawlService({ store }) {
  function stripHtml(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function summarizeResponseBody(text, limit = 360) {
    const clean = stripHtml(text);
    if (!clean) {
      return "";
    }
    return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
  }

  function extractTitle(html) {
    const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return stripHtml(titleMatch[1]);
    }
    const h1Match = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    return h1Match && h1Match[1] ? stripHtml(h1Match[1]) : "";
  }

  function extractPublishTime(html) {
    const text = String(html || "");
    const match = text.match(/\b(20\d{2}(?:[-/.年])\d{1,2}(?:[-/.月])\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2})?)\b/);
    return match ? match[1] : nowText();
  }

  function buildRuleTokens(ruleText) {
    return String(ruleText || "")
      .split(",")
      .flatMap((group) => group.trim().split(/\s+/).filter(Boolean).reverse())
      .filter(Boolean);
  }

  function extractBlockByToken(html, token, allMatches = false) {
    const sourceHtml = String(html || "");
    if (!token) {
      return allMatches ? [] : "";
    }

    if (token.startsWith(".")) {
      const className = escapeRegExp(token.slice(1));
      const pattern = new RegExp(
        `<([a-z0-9]+)([^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*)>[\\s\\S]*?<\\/\\1>`,
        allMatches ? "gi" : "i"
      );
      return allMatches ? sourceHtml.match(pattern) || [] : (sourceHtml.match(pattern)?.[0] || "");
    }

    if (token.startsWith("#")) {
      const idName = escapeRegExp(token.slice(1));
      const pattern = new RegExp(
        `<([a-z0-9]+)([^>]*id=["']${idName}["'][^>]*)>[\\s\\S]*?<\\/\\1>`,
        allMatches ? "gi" : "i"
      );
      return allMatches ? sourceHtml.match(pattern) || [] : (sourceHtml.match(pattern)?.[0] || "");
    }

    const tagName = escapeRegExp(token);
    const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, allMatches ? "gi" : "i");
    return allMatches ? sourceHtml.match(pattern) || [] : (sourceHtml.match(pattern)?.[0] || "");
  }

  function applyExcludeRule(html, excludeRule) {
    let nextHtml = String(html || "");
    buildRuleTokens(excludeRule).forEach((token) => {
      extractBlockByToken(nextHtml, token, true).forEach((matchText) => {
        nextHtml = nextHtml.replace(matchText, " ");
      });
    });
    return nextHtml;
  }

  function extractContentBlock(html, parseRule) {
    const tokens = buildRuleTokens(parseRule);
    for (const token of tokens) {
      const block = extractBlockByToken(html, token);
      if (block) {
        return block;
      }
    }
    return String(html || "");
  }

  function extractBodyContent(html, source) {
    const selectedHtml = extractContentBlock(html, source.parseRule || "article");
    const excludedHtml = applyExcludeRule(selectedHtml, source.excludeRule || "");
    const cleanText = stripHtml(excludedHtml);

    if (cleanText.length >= 80) {
      return {
        cleanText: cleanText.slice(0, 2600),
        rawText: stripHtml(selectedHtml).slice(0, 1800),
        extractionMode: selectedHtml === String(html || "") ? "整页回退" : "规则命中"
      };
    }

    const fallbackHtml = applyExcludeRule(html, source.excludeRule || "");
    return {
      cleanText: stripHtml(fallbackHtml).slice(0, 2600),
      rawText: stripHtml(html).slice(0, 1800),
      extractionMode: "整页回退"
    };
  }

  async function fetchHtml(url) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": "Zhengmuwang-MVP-Test/1.0"
        }
      });
    } catch (error) {
      throw new Error(`请求失败：${error.message}`);
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const error = new Error(`抓取失败：HTTP ${response.status}`);
      error.statusCode = response.status;
      error.responsePreview = summarizeResponseBody(responseText);
      throw error;
    }

    return response.text();
  }

  async function previewSourceExtraction(sourceDraft) {
    const html = await fetchHtml(sourceDraft.entryUrl);
    const extraction = extractBodyContent(html, sourceDraft);
    return {
      title: extractTitle(html) || "未识别标题",
      publishTime: extractPublishTime(html),
      extractionMode: extraction.extractionMode,
      rawText: extraction.rawText,
      cleanText: extraction.cleanText,
      isFallback: false
    };
  }

  function extractLinks(html, baseUrl, allowedHost) {
    const sourceHtml = String(html || "");
    const links = new Set();
    const pattern = /href=['"]([^'"#]+)['"]/gi;
    let match = pattern.exec(sourceHtml);

    while (match) {
      try {
        const candidate = new URL(match[1], baseUrl).toString();
        const target = new URL(candidate);
        if (target.host === allowedHost) {
          links.add(candidate);
        }
      } catch (error) {
        // 这里忽略无法解析的链接，避免单个坏链接影响整页抓取。
      }
      match = pattern.exec(sourceHtml);
    }

    return Array.from(links).slice(0, 8);
  }

  // ========== 第二部分：去重与文章构建 ==========
  async function tryFetchRealArticle(source, keyword, operatorName) {
    const entryUrl = source.entryUrl;
    const entryHtml = await fetchHtml(entryUrl);
    const entryExtraction = extractBodyContent(entryHtml, source);
    const sourceUrl = new URL(entryUrl);
    const candidateUrls = [entryUrl, ...extractLinks(entryHtml, entryUrl, sourceUrl.host)];

    for (const candidateUrl of candidateUrls) {
      const html = candidateUrl === entryUrl ? entryHtml : await fetchHtml(candidateUrl);
      const extraction = extractBodyContent(html, source);
      if (!extraction.cleanText || !extraction.cleanText.includes(keyword.keyword)) {
        continue;
      }

      const crawlTime = nowText();
      const title = extractTitle(html) || `${keyword.keyword}相关公开线索`;
      return {
        id: createId(),
        sourceId: source.id,
        originalTitle: title,
        originalUrl: candidateUrl,
        sourceName: source.name,
        authorName: source.name,
        publishTime: extractPublishTime(html),
        crawlTime,
        rawText: extraction.rawText,
        cleanText: extraction.cleanText,
        coverImage: "",
        hitKeywords: [keyword.keyword],
        recommendedCategoryId: keyword.categoryId,
        status: ARTICLE_STATUS.PENDING_REVIEW,
        assignedEditor: operatorName,
        reviewer: "",
        newTitle: title,
        summary: `${keyword.keyword}命中了重点抓取源中的公开网页，可直接进入内容池继续处理。`,
        rewrittenContent: "该线索来自重点抓取源优先采集，当前已完成基础提取与清洗，建议编辑继续改写为整木网稿件。",
        tags: [keyword.keyword, store.getCategoryName(keyword.categoryId)],
        seoTitle: `${keyword.keyword}重点抓取源线索更新`,
        seoDescription: `整木网从重点抓取源采集到与${keyword.keyword}相关的公开线索。`,
        sourceNote: `来源 ${source.name}，原始链接 ${candidateUrl}，抓取时间 ${crawlTime}，采集方式为重点源优先，提取方式 ${extraction.extractionMode}。`,
        reviewComment: "",
        aiHistory: [],
        publishStatus: PUBLISH_STATUS.UNPUBLISHED,
        portalArticleId: "",
        portalUrl: "",
        createdAt: crawlTime,
        updatedAt: crawlTime
      };
    }

    if (entryExtraction.cleanText.includes(keyword.keyword)) {
      const crawlTime = nowText();
      const title = extractTitle(entryHtml) || `${keyword.keyword}相关公开线索`;
      return {
        id: createId(),
        sourceId: source.id,
        originalTitle: title,
        originalUrl: entryUrl,
        sourceName: source.name,
        authorName: source.name,
        publishTime: extractPublishTime(entryHtml),
        crawlTime,
        rawText: entryExtraction.rawText,
        cleanText: entryExtraction.cleanText,
        coverImage: "",
        hitKeywords: [keyword.keyword],
        recommendedCategoryId: keyword.categoryId,
        status: ARTICLE_STATUS.PENDING_REVIEW,
        assignedEditor: operatorName,
        reviewer: "",
        newTitle: title,
        summary: `${keyword.keyword}命中了重点抓取源入口页，可进入内容池继续编辑。`,
        rewrittenContent: "该线索来自重点抓取源入口页，已完成基础文本提取，建议编辑进一步清洗与改写。",
        tags: [keyword.keyword, store.getCategoryName(keyword.categoryId)],
        seoTitle: `${keyword.keyword}重点抓取源入口线索更新`,
        seoDescription: `整木网从重点抓取源入口页采集到与${keyword.keyword}相关的公开线索。`,
        sourceNote: `来源 ${source.name}，原始链接 ${entryUrl}，抓取时间 ${crawlTime}，采集方式为重点源优先，提取方式 ${entryExtraction.extractionMode}。`,
        reviewComment: "",
        aiHistory: [],
        publishStatus: PUBLISH_STATUS.UNPUBLISHED,
        portalArticleId: "",
        portalUrl: "",
        createdAt: crawlTime,
        updatedAt: crawlTime
      };
    }

    return null;
  }

  function detectDuplicate(candidate) {
    const state = store.getState();
    const exactUrl = state.articles.find((item) => item.originalUrl === candidate.originalUrl);
    if (exactUrl) {
      return {
        shouldInsert: false,
        duplicateStatus: DUPLICATE_STATUS.DUPLICATE,
        similarityScore: 100,
        reason: `URL 与文章 ${exactUrl.id} 完全一致`
      };
    }

    let maxScore = 0;
    let maxArticle = null;
    state.articles.forEach((item) => {
      const score = Math.max(calcSimilarity(item.originalTitle, candidate.originalTitle), calcSimilarity(item.cleanText, candidate.cleanText));
      if (score > maxScore) {
        maxScore = score;
        maxArticle = item;
      }
    });

    const normalizedScore = Math.round(maxScore * 100);
    if (normalizedScore >= 80) {
      return {
        shouldInsert: false,
        duplicateStatus: DUPLICATE_STATUS.DUPLICATE,
        similarityScore: normalizedScore,
        reason: `与文章 ${maxArticle.id} 相似度 ${normalizedScore}%`
      };
    }
    if (normalizedScore >= 60) {
      return {
        shouldInsert: true,
        duplicateStatus: DUPLICATE_STATUS.SUSPECTED,
        similarityScore: normalizedScore,
        reason: `与文章 ${maxArticle.id} 相似度 ${normalizedScore}%`
      };
    }
    return {
      shouldInsert: true,
      duplicateStatus: DUPLICATE_STATUS.PASSED,
      similarityScore: normalizedScore
    };
  }

  function createSimulatedArticle(source, keyword, operatorName, mode = "priority") {
    const crawlTime = nowText();
    const categoryName = store.getCategoryName(keyword.categoryId);
    const traceCode = `${source.id}-${keyword.id}`;
    const isOpenMode = mode === "open";
    const simulationFingerprint = `${keyword.keyword}-${traceCode}-${crawlTime}`;
    const uniquenessTrail = [
      simulationFingerprint,
      `${traceCode}-${keyword.keyword}`,
      `${source.name}-${categoryName}-${crawlTime}`
    ].join(" / ");
    const title = isOpenMode
      ? `${keyword.keyword}在开放发现中补充到整木网${categoryName}线索池`
      : `${keyword.keyword}线索进入整木网${categoryName}观察池`;
    const cleanText = [
      isOpenMode
        ? `系统在重点抓取源之外，又根据“${keyword.keyword}”补充发现了一条公开线索，来源为 ${source.name}，当前先以模拟采集方式进入整木网编辑中台。`
        : `重点抓取源 ${source.name} 本轮围绕“${keyword.keyword}”出现了一条新的公开线索，当前先以模拟抓取方式进入整木网编辑中台。`,
      `这条线索的追踪编号为 ${traceCode}，讨论重点集中在 ${keyword.keyword} 对设计前置、工厂排产、交付节拍和门店协同效率的影响。`,
      `与常规行业快讯相比，“${keyword.keyword}”更适合落到 ${categoryName} 栏目，因为它同时具备业务动作、读者价值和后续改写空间。`,
      `后续编辑可以继续围绕 ${keyword.keyword} 的应用场景、品牌动作、实施难点和落地收益做二次改写，并保留来源 ${source.name} 与原始链接追溯信息。`,
      `本轮回归的模拟唯一指纹为 ${simulationFingerprint}，用于在本地 smoke 验证时避免历史测试数据被去重误判。`,
      `可以继承的关键信息包括：关键词 ${keyword.keyword}、来源 ${source.name}、线索编号 ${traceCode}、模拟指纹 ${simulationFingerprint}。`,
      `本条模拟稿的回归校验片段为 ${uniquenessTrail}。`,
      `回归校验片段再次确认：${uniquenessTrail}。`
    ].join(" ");

    return {
      id: createId(),
      sourceId: source.id,
      originalTitle: title,
      originalUrl: `https://${source.domain}/simulated/${source.id}-${keyword.id}`,
      sourceName: source.name,
      authorName: source.name,
      publishTime: crawlTime,
      crawlTime,
      rawText: cleanText,
      cleanText,
      coverImage: "",
      hitKeywords: [keyword.keyword],
      recommendedCategoryId: keyword.categoryId,
      status: ARTICLE_STATUS.PENDING_REVIEW,
      assignedEditor: operatorName,
      reviewer: "",
      newTitle: title,
      summary: isOpenMode
        ? `开放发现已围绕 ${keyword.keyword} 补充到一条公开线索，模拟指纹 ${simulationFingerprint}，可进入内容池继续编辑与审核。`
        : `重点抓取源已围绕 ${keyword.keyword} 生成一条公开线索，模拟指纹 ${simulationFingerprint}，可进入内容池继续编辑与审核。`,
      rewrittenContent: `围绕 ${keyword.keyword} 的公开讨论正在形成更明确的业务动作，这条线索已被整理为 ${categoryName} 方向的待处理稿件，建议继续补充品牌案例、实施细节和读者价值。当前补充的模拟指纹为 ${simulationFingerprint}，用于回归验证时区分不同轮次。`,
      tags: [keyword.keyword, categoryName, isOpenMode ? "开放发现" : "重点抓取源", `线索${traceCode}`],
      seoTitle: isOpenMode
        ? `${keyword.keyword}开放发现补充进入整木网${categoryName}`
        : `${keyword.keyword}进入整木网${categoryName}观察池`,
      seoDescription: isOpenMode
        ? `整木网围绕 ${keyword.keyword} 在重点抓取源之外补充发现新的公开线索，供编辑继续改写为 ${categoryName} 栏目稿件。`
        : `整木网围绕 ${keyword.keyword} 在重点抓取源中生成新的模拟公开线索，供编辑继续改写为 ${categoryName} 栏目稿件。`,
      sourceNote: `来源 ${source.name}，原始链接已保留，抓取时间 ${crawlTime}，采集方式为${isOpenMode ? "开放发现补充" : "重点源优先"}，线索编号 ${traceCode}，模拟指纹 ${simulationFingerprint}。`,
      reviewComment: "",
      aiHistory: [],
      publishStatus: PUBLISH_STATUS.UNPUBLISHED,
      portalArticleId: "",
      portalUrl: "",
      createdAt: crawlTime,
      updatedAt: crawlTime
    };
  }

  function createOpenDiscoveryArticle(keyword, operatorName) {
    const fixtures = [
      { name: "图森官网", domain: "www.tucsonwood.example.com", sourceType: "网站" },
      { name: "木作品牌号", domain: "mp.weixin.qq.com", sourceType: "公众号" },
      { name: "家居产业观察", domain: "www.woodmedia.example.com", sourceType: "自媒体" }
    ];
    const fixture = fixtures[(Number(keyword.id) || 0) % fixtures.length];
    const source = {
      id: 0,
      name: fixture.name,
      domain: fixture.domain,
      sourceType: fixture.sourceType
    };
    return createSimulatedArticle(source, keyword, operatorName, "open");
  }

  function processCandidateArticle(task, keyword, article, taskLogs, keepSuspectedDuplicates, channelLabel) {
    const state = store.getState();
    const duplicateResult = detectDuplicate(article);

    if (!duplicateResult.shouldInsert) {
      task.duplicateCount += 1;
      keyword.hitCount += 1;
      taskLogs.push(`${channelLabel} / 关键词“${keyword.keyword}”命中重复：${duplicateResult.reason}`);
      return null;
    }

    if (duplicateResult.duplicateStatus === DUPLICATE_STATUS.SUSPECTED && !keepSuspectedDuplicates) {
      task.duplicateCount += 1;
      keyword.hitCount += 1;
      taskLogs.push(`${channelLabel} / 关键词“${keyword.keyword}”命中疑似重复且已按配置跳过：${duplicateResult.reason}`);
      return null;
    }

    article.duplicateStatus = duplicateResult.duplicateStatus;
    article.similarityScore = duplicateResult.similarityScore;
    state.articles.unshift(article);
    keyword.hitCount += 1;
    task.successCount += 1;
    taskLogs.push(`${channelLabel} / 关键词“${keyword.keyword}”已入库，状态为${article.duplicateStatus}。`);
    return article;
  }

  // ========== 第三部分：抓取任务执行 ==========
  async function runTask(sourceId, keywordIds, operatorName, options = {}) {
    const state = store.getState();
    const source = state.sourceSites.find((item) => item.id === Number(sourceId));
    const keywordList = state.keywords.filter((item) => keywordIds.includes(Number(item.id)) && item.enabled);
    const keepSuspectedDuplicates = options.keepSuspectedDuplicates !== false;

    if (!source) {
      throw new Error("抓取源不存在");
    }
    if (!keywordList.length) {
      throw new Error("请至少选择一个启用中的关键词");
    }

    const task = {
      id: createId(),
      taskName: `手动抓取-${source.name}-${nowText().slice(11, 19)}`,
      sourceId: source.id,
      sourceName: source.name,
      keywordIds: keywordList.map((item) => item.id),
      taskType: "手动抓取",
      keepSuspectedDuplicates,
      status: TASK_STATUS.RUNNING,
      startTime: nowText(),
      endTime: "",
      successCount: 0,
      failCount: 0,
      duplicateCount: 0,
      logText: ""
    };

    const taskLogs = [`疑似重复保留：${keepSuspectedDuplicates ? "开启" : "关闭"}`];
    for (const keyword of keywordList) {
      let article = null;
      let usedFallback = false;

      try {
        article = await tryFetchRealArticle(source, keyword, operatorName);
      } catch (error) {
        usedFallback = true;
        task.failCount += 1;
        store.appendCrawlFailure({
          taskId: task.id,
          sourceId: source.id,
          keywordId: keyword.id,
          sourceName: source.name,
          keyword: keyword.keyword,
          stage: FAILURE_STAGES.CRAWL,
          message: error.message
        });
        taskLogs.push(`关键词“${keyword.keyword}”真实抓取失败，已回退模拟抓取：${error.message}`);
      }

      if (!article) {
        if (!usedFallback) {
          task.failCount += 1;
          store.appendCrawlFailure({
            taskId: task.id,
            sourceId: source.id,
            keywordId: keyword.id,
            sourceName: source.name,
            keyword: keyword.keyword,
            stage: FAILURE_STAGES.MATCH,
            message: "入口页与候选页均未命中关键词，已回退模拟抓取。"
          });
        }
        article = createSimulatedArticle(source, keyword, operatorName);
        usedFallback = true;
      }

      processCandidateArticle(
        task,
        keyword,
        article,
        taskLogs,
        keepSuspectedDuplicates,
        usedFallback ? `重点抓取源 ${source.name}（回退模拟）` : `重点抓取源 ${source.name}`
      );
    }

    task.status = TASK_STATUS.COMPLETED;
    task.endTime = nowText();
    task.logText = taskLogs.join("；") || "未新增可入库内容。";
    state.tasks.unshift(task);
    source.lastResult = `最近一次抓取 ${keywordList.length} 条，新增 ${task.successCount} 条，重复 ${task.duplicateCount} 条，失败 ${task.failCount} 条。`;
    source.updatedAt = nowText();
    store.appendLog(LOG_TYPES.CRAWL, `任务“${task.taskName}”执行完成，新增 ${task.successCount} 条，重复 ${task.duplicateCount} 条，失败 ${task.failCount} 条。`);
    store.saveState();
    return task;
  }

  async function runDiscoveryTask(keywordIds, operatorName, options = {}) {
    const state = store.getState();
    const keywordList = state.keywords.filter((item) => keywordIds.includes(Number(item.id)) && item.enabled);
    const prioritySources = state.sourceSites.filter((item) => item.enabled);
    const keepSuspectedDuplicates = options.keepSuspectedDuplicates !== false;

    if (!keywordList.length) {
      throw new Error("请至少启用一个关键词后再开始采集");
    }

    const task = {
      id: createId(),
      taskName: `关键词驱动采集-${nowText().slice(11, 19)}`,
      sourceId: 0,
      sourceName: prioritySources.length ? `重点抓取源 ${prioritySources.length} 个` : "开放发现补充",
      keywordIds: keywordList.map((item) => item.id),
      taskType: "关键词驱动采集",
      keepSuspectedDuplicates,
      status: TASK_STATUS.RUNNING,
      startTime: nowText(),
      endTime: "",
      successCount: 0,
      failCount: 0,
      duplicateCount: 0,
      logText: ""
    };

    const taskLogs = [
      "采集模式：关键词驱动 + 重点源优先 + 开放发现补充",
      `重点抓取源：${prioritySources.length ? prioritySources.map((item) => item.name).join(" / ") : "当前未配置，已回退为仅开放发现补充"}`,
      `疑似重复保留：${keepSuspectedDuplicates ? "开启" : "关闭"}`
    ];

    for (const keyword of keywordList) {
      if (prioritySources.length) {
        const source = prioritySources[(Number(keyword.id) || 0) % prioritySources.length];
        let article = null;
        let usedFallback = false;

        try {
          article = await tryFetchRealArticle(source, keyword, operatorName);
        } catch (error) {
          usedFallback = true;
          task.failCount += 1;
          store.appendCrawlFailure({
            taskId: task.id,
            sourceId: source.id,
            keywordId: keyword.id,
            sourceName: source.name,
            keyword: keyword.keyword,
            stage: FAILURE_STAGES.CRAWL,
            message: error.message
          });
          taskLogs.push(`重点抓取源 ${source.name} 围绕“${keyword.keyword}”真实抓取失败，已回退模拟补足：${error.message}`);
        }

        if (!article) {
          if (!usedFallback) {
            task.failCount += 1;
            store.appendCrawlFailure({
              taskId: task.id,
              sourceId: source.id,
              keywordId: keyword.id,
              sourceName: source.name,
              keyword: keyword.keyword,
              stage: FAILURE_STAGES.MATCH,
              message: "重点抓取源入口页与候选页均未命中关键词，已回退模拟补足。"
            });
          }
          article = createSimulatedArticle(source, keyword, operatorName);
          usedFallback = true;
        }

        processCandidateArticle(
          task,
          keyword,
          article,
          taskLogs,
          keepSuspectedDuplicates,
          usedFallback ? `重点抓取源 ${source.name}（回退模拟）` : `重点抓取源 ${source.name}`
        );
        source.lastResult = `最近一次关键词驱动采集已完成，围绕“${keyword.keyword}”更新结果请查看内容池。`;
        source.updatedAt = nowText();
      }

      const openArticle = createOpenDiscoveryArticle(keyword, operatorName);
      processCandidateArticle(
        task,
        keyword,
        openArticle,
        taskLogs,
        keepSuspectedDuplicates,
        `开放发现 ${openArticle.sourceName}`
      );
    }

    task.status = TASK_STATUS.COMPLETED;
    task.endTime = nowText();
    task.logText = taskLogs.join("；") || "本轮未新增可入库内容。";
    state.tasks.unshift(task);
    store.appendLog(
      LOG_TYPES.CRAWL,
      `任务“${task.taskName}”执行完成，重点源优先并补充开放发现，新增 ${task.successCount} 条，重复 ${task.duplicateCount} 条，失败 ${task.failCount} 条。`
    );
    store.saveState();
    return task;
  }

  return {
    createSimulatedArticle,
    createOpenDiscoveryArticle,
    detectDuplicate,
    extractBodyContent,
    previewSourceExtraction,
    summarizeResponseBody,
    runDiscoveryTask,
    runTask
  };
}

module.exports = {
  createCrawlService
};
