# Proposal: sync-and-local-deploy-paperclip

## Why

团队需要一套研发流程协同管理系统，让多个 AI harness（Codex、Claude Code）围绕同一目标分工协作。Paperclip 是开源的 AI agent 编排系统（Node.js server + React UI），原生支持 Claude Code / Codex 等 adapter，正好承载这一场景。当前本地仓库存在少量落后与未提交改动，需要先完成代码同步，再完成本地部署与协同流程落地。

## What Changes

- **代码同步**：从 github（https://github.com/vincent-wuhan/paperclip.git）同步最新代码到本地工作分支。当前 `yueming/v2026.820` 落后上游 master 仅 1 个 commit（66575fe51）；本地 `master` 分支指针严重过期（落后 1214 commits），需一并更新。remote 拓扑调整为：`upstream` = github vincent-wuhan/paperclip（fetch 同步源），`gitcode` = https://gitcode.com/glorius/paperclip.git（个人镜像，push 备份），gitee origin 保留。
- **本地部署（开发模式）**：以源码方式（`pnpm dev`）在本地启动 Paperclip 服务（server + UI + DB），用于研发流程协同管理。
- **协同流程配置**：在 Paperclip 中配置双 harness 协同模式——Codex 负责计划制定与验收，Claude Code 负责实施与执行；通过原生 issue/task/comment 流转实现两个 harness 的相互映证与 check。
- **未提交改动处理**：`logger.ts`、`local-encrypted-provider.ts` 的本地修改与 `.runbook/`、`skills/` 未跟踪目录，在同步前评估去留（stash / commit / 保留原样）。

## Capabilities

### New Capabilities

- `code-sync`: 从 github（vincent-wuhan/paperclip）同步代码到本地工作分支，推送到 gitcode 个人镜像，保持本地 master 指针与工作分支跟进。
- `local-dev-deploy`: 以开发模式（源码运行）在本地部署 Paperclip 服务（依赖安装、DB 初始化、server + UI 启动、健康检查）。
- `dual-harness-collaboration`: 基于 Paperclip 原生 issue/task/comment 流程的双 harness（Codex 计划/验收 + Claude 执行）协同配置与流转约定。

### Modified Capabilities

（无 —— 不修改 Paperclip 源码的需求级行为，全部使用原生能力）

## Impact

- **代码**：仓库分支状态（同步 1 commit 到工作分支、更新本地 master 指针）；不改动 Paperclip 源码。
- **环境**：本地 Node.js/pnpm 运行环境、本地数据库（Paperclip 自带 DB 方案）、端口占用。
- **依赖系统**：Codex CLI、Claude Code CLI 需可在本地调用并接入 Paperclip adapter。
- **数据**：Paperclip 本地实例的初始组织/agent 配置（无生产数据影响）。
