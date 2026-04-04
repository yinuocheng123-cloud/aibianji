## 实验目标

确认为什么 `3210` 端口的本地中台服务会反复出现“刚能访问，过一会儿又打不开”，并找到更稳定的本地启动方式。

## 实验设定

- 仓库路径：`D:\ceshi\aibianji`
- 服务目录：`D:\ceshi\aibianji\custom\content-center-demo`
- 目标端口：`3210`
- 对比对象：
  - 通过工具后台启动 `node server.js`
  - 通过独立 `cmd /k` 控制台执行 `npm run dev`

## 关键变量

- `3210` 是否持续监听
- 首页 `http://127.0.0.1:3210` 是否能连续两次返回 `200`
- `node` 进程是否在独立控制台下存活

## 观察结果

前一类启动方式的问题：

- 通过工具命令后台拉起的 `node server.js` 有时会短暂可访问
- 但后续会失去监听，浏览器报 `ERR_CONNECTION_REFUSED`
- 日志里看得到启动成功，但进程不能稳定常驻

本轮改用独立控制台方式：

- 先清理失效的 `node server.js` 残留进程
- 使用独立窗口执行：
  - `cmd /k cd /d D:\ceshi\aibianji\custom\content-center-demo && npm run dev`
- 启动后两次访问 `http://127.0.0.1:3210` 均返回 `200`
- `netstat -ano` 显示：
  - `0.0.0.0:3210 LISTENING`
- 进程树显示：
  - `cmd.exe` 持续存活
  - `node.exe` 作为其子进程持续运行

## 初步结论

当前环境里，直接由工具命令后台孵化的服务进程存在被回收的风险；改为独立控制台窗口持有 `npm run dev`，服务更稳定。

## 是否值得继续

值得。后续如果用户只需要本地继续访问 demo，优先复用“独立控制台窗口运行 `npm run dev`”这套方式，而不是再直接依赖一次性后台进程。
