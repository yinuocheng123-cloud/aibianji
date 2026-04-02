/**
 * 文件说明：该文件实现整木网编辑中台 MVP 的服务端启动入口。
 * 功能说明：负责组装存储层、抓取层、AI 层和路由层，并启动 HTTP 服务。
 *
 * 结构概览：
 *   第一部分：依赖与模块组装
 *   第二部分：静态资源服务
 *   第三部分：服务启动
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { CONTENT_TYPES, HOST, PORT, PUBLIC_DIR } = require("./src/shared/constants");
const { sendJson } = require("./src/shared/utils");
const { createStateStore } = require("./src/storage/state-store");
const { createAiService } = require("./src/services/ai-service");
const { createCrawlService } = require("./src/services/crawl-service");
const { createApiRouter } = require("./src/routes/api-router");

// ========== 第一部分：依赖与模块组装 ==========
const sessions = new Map();
const store = createStateStore();
const aiService = createAiService({ store });
const crawlService = createCrawlService({ store });
const apiRouter = createApiRouter({
  sessions,
  store,
  aiService,
  crawlService
});

// ========== 第二部分：静态资源服务 ==========
function serveStaticFile(request, response, urlObject) {
  const pathname = urlObject.pathname === "/" ? "/index.html" : urlObject.pathname;
  const targetPath = path.join(PUBLIC_DIR, pathname);
  const resolvedPath = path.resolve(targetPath);

  // 这里限制访问 public 目录，避免任意路径读取。
  if (!resolvedPath.startsWith(path.resolve(PUBLIC_DIR))) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const urlObject = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (urlObject.pathname.startsWith("/api/")) {
      await apiRouter.handleApi(request, response, urlObject);
      return;
    }

    serveStaticFile(request, response, urlObject);
  } catch (error) {
    sendJson(response, 500, {
      message: "服务内部错误",
      detail: error.message
    });
  }
});

// ========== 第三部分：服务启动 ==========
async function startServer() {
  await store.initialize();
  server.listen(PORT, HOST, () => {
    console.log(`Content center demo is running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
