/**
 * 文件说明：该文件实现服务端可复用的通用工具函数。
 * 功能说明：负责请求解析、JSON 响应、时间与 ID 生成、文本标准化与安全辅助。
 *
 * 结构概览：
 *   第一部分：基础数据工具
 *   第二部分：HTTP 请求与响应工具
 *   第三部分：文本处理与安全辅助
 */

const crypto = require("crypto");
const { SESSION_COOKIE } = require("./constants");

// ========== 第一部分：基础数据工具 ==========
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

function nowText() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function normalizeNumber(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function sortByTimeDesc(items, key) {
  return [...items].sort((left, right) => String(right[key] || "").localeCompare(String(left[key] || "")));
}

// ========== 第二部分：HTTP 请求与响应工具 ==========
function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        const contentType = String(request.headers["content-type"] || "").toLowerCase();
        if (contentType.includes("application/json")) {
          resolve(JSON.parse(body));
          return;
        }

        if (contentType.includes("application/x-www-form-urlencoded")) {
          resolve(Object.fromEntries(new URLSearchParams(body).entries()));
          return;
        }

        try {
          resolve(JSON.parse(body));
          return;
        } catch (error) {
          resolve(Object.fromEntries(new URLSearchParams(body).entries()));
        }
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function parseCookies(request) {
  const rawCookie = request.headers.cookie || "";
  return rawCookie.split(";").reduce((result, item) => {
    const [key, ...rest] = item.trim().split("=");
    if (!key) {
      return result;
    }

    result[key] = decodeURIComponent(rest.join("="));
    return result;
  }, {});
}

function toSetCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ========== 第三部分：文本处理与安全辅助 ==========
function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildCharShingles(text, size = 2) {
  const normalized = normalizeText(text);
  const shingles = new Set();

  if (!normalized) {
    return shingles;
  }

  if (normalized.length <= size) {
    shingles.add(normalized);
    return shingles;
  }

  for (let index = 0; index <= normalized.length - size; index += 1) {
    shingles.add(normalized.slice(index, index + size));
  }

  return shingles;
}

function calcSimilarity(left, right) {
  const leftSet = buildCharShingles(left);
  const rightSet = buildCharShingles(right);

  if (!leftSet.size || !rightSet.size) {
    return 0;
  }

  let intersection = 0;
  leftSet.forEach((item) => {
    if (rightSet.has(item)) {
      intersection += 1;
    }
  });

  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 0;
}

function maskSecret(secret) {
  const text = String(secret || "");
  if (!text) {
    return "未配置";
  }

  if (text.length <= 8) {
    return `${text.slice(0, 2)}****`;
  }

  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

module.exports = {
  buildCharShingles,
  calcSimilarity,
  clearSessionCookie,
  createId,
  escapeRegExp,
  maskSecret,
  normalizeNumber,
  normalizeText,
  nowText,
  parseCookies,
  readRequestBody,
  safeJsonParse,
  sanitizeUser,
  sendJson,
  sha256,
  sortByTimeDesc,
  toSetCookie
};
