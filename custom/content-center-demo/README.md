# 整木网编辑中台 MVP

这是一个用于本地做 MVP 测试的独立版本，重点覆盖“白名单抓取、三层去重、AI 辅助、人工审核、发布归档”的演示闭环。

## 当前已覆盖的能力

- 登录与角色切换
- 抓取源管理
- 关键词管理
- 抓取任务执行
- URL / 标题 / 正文相似度三层去重
- 内容池与编辑审核台
- AI 摘要 / 标题 / 改写 / 扩写
- AI 后台配置
- 抓取失败日志
- 抓取源提取预览
- SQLite 本地持久化
- 操作日志追踪

## 当前服务端结构

当前服务端已拆成四层：

- `src/storage/state-store.js`
  负责默认数据、SQLite 关系表、加载与写回
- `src/services/crawl-service.js`
  负责正文提取、提取预览、去重与抓取任务
- `src/services/ai-service.js`
  负责 AI 配置、提示词与 DeepSeek 调用
- `src/routes/api-router.js`
  负责鉴权、角色校验与 API 路由

`server.js` 只负责模块组装、静态资源服务和启动入口。

## 启动方式

```powershell
cd D:\ceshi\aibianji\custom\content-center-demo
npm run dev
```

默认地址：

```text
http://127.0.0.1:3210
```

## 固定回归脚本

在服务已启动的前提下，可以直接执行：

```powershell
cd D:\ceshi\aibianji\custom\content-center-demo
npm run smoke:e2e
```

脚本会自动完成：

- 管理员登录
- 抓取源预览失败兜底验证
- 新建测试抓取源
- 新建测试关键词
- 执行抓取任务
- AI 摘要
- 保存草稿
- 提交复审
- 审核发布

如果需要改成“疑似重复直接跳过”，可以这样执行：

```powershell
$env:SMOKE_KEEP_SUSPECTED_DUPLICATES='0'
npm run smoke:e2e
```

## 测试账号

- `admin / admin123`
- `editor / editor123`
- `reviewer / reviewer123`
- `viewer / viewer123`

## 当前重点说明

### 1. 抓取源提取预览

管理员可以先填写：

- `entryUrl`
- `parseRule`
- `excludeRule`

然后点击“预览提取效果”，先查看：

- 识别标题
- 发布时间
- 提取模式
- 提取后的正文片段

如果预览失败，界面会保留“原始响应摘要”作为兜底展示，方便判断是网页访问问题还是规则问题。

### 2. 三层去重

当前演示版已覆盖：

- URL 去重
- 标题相似度判断
- 正文相似度判断
- 抓取任务中的“保留疑似重复”显式开关

任务重复执行时，可以直接在内容池中观察重复状态与相似度变化；如果关闭“保留疑似重复”，相似度 60%-79% 的内容会被跳过并写入任务日志。

### 3. AI 配置

当前支持两种方式：

- 通过环境变量读取 DeepSeek 配置
- 通过后台页面直接保存 AI 配置

如果没有可用 API Key，系统会自动回退到本地占位结果，方便持续测试工作流。

## 当前边界

- 真实抓取仍是最小链路，不是生产级采集器
- 正文提取规则是轻量实现，复杂站点仍可能失败
- DeepSeek 真实调用需要提供可用配置
- 发布回写仍是演示接口，不是正式主站发布

## 建议测试顺序

1. 管理员登录
2. 新建或编辑抓取源
3. 先点“预览提取效果”
4. 保存 AI 配置
5. 执行抓取任务
6. 查看失败日志与内容池
7. 用编辑账号做 AI 改写和提交审核
8. 用审核账号执行通过、发布、归档
9. 需要回归时直接执行 `npm run smoke:e2e`
