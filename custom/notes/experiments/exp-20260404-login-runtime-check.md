## 实验目标

确认本地 `3210` 端口服务是否正常运行，并核查当前登录链路在本机上的实际行为。

## 实验设定

- 仓库路径：`D:\ceshi\aibianji`
- 服务地址：`http://127.0.0.1:3210`
- 检查对象：
  - `3210` 端口监听情况
  - 首页 HTTP 响应
  - 登录接口原始响应头
  - `session_token -> X-Session-Token -> /api/bootstrap` 链路

## 关键变量

- `netstat` 是否显示 `0.0.0.0:3210 LISTENING`
- 首页是否返回 `200`
- 登录成功是否返回 `302` 与 `session_token`
- `/api/bootstrap` 是否在 header token 模式下返回 `200`

## 观察结果

服务运行态：

- `3210` 端口正常监听
- 首页返回 `200`
- 启动日志显示 `Content center demo is running at http://0.0.0.0:3210`

登录链路：

- `POST /api/auth/login`
  - 返回 `302`
  - `Location` 为 `/?session_token=...`
  - 同时写入 `Set-Cookie`
- 取出 `session_token` 后，使用 `X-Session-Token` 请求 `/api/bootstrap`
  - 返回 `200`

## 初步结论

这次检查结果表明：

- 本地 `3210` 服务当前是正常运行的
- 登录接口与登录态恢复链路当前在本机可复现通过
- “页面能打开但点登录不进去”更像是浏览器侧的页面状态、缓存或交互链路问题，而不是当前后端接口失效

## 是否值得继续

值得。后续如果用户继续反馈无法登录，应优先检查浏览器端实际页面行为，再决定是否继续修改代码。
