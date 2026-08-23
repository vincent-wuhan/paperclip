# Comet Design Handoff

- Change: sync-and-local-deploy-paperclip
- Phase: design
- Mode: compact
- Context hash: 9e30ba36757649ecbf34718ad19ae7fc0ae1910ff9c323f0b84b0f39310cc85f

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/sync-and-local-deploy-paperclip/proposal.md

- Source: openspec/changes/sync-and-local-deploy-paperclip/proposal.md
- Lines: 1-31
- SHA256: c57a67ea9e63e544330fef1feb38caa118b18c2510c223839baee86384a729a5

```md
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
```

## openspec/changes/sync-and-local-deploy-paperclip/design.md

- Source: openspec/changes/sync-and-local-deploy-paperclip/design.md
- Lines: 1-89
- SHA256: f1e01d290f977b4392ba4e7fe1a50dbadaeb9bc31bfccb2c75df651a371473be

[TRUNCATED]

```md
# Design: sync-and-local-deploy-paperclip

## 高层架构决策

### 决策 1：同步源 = github（vincent-wuhan/paperclip），origin 保持 gitee 不变

- 同步源：https://github.com/vincent-wuhan/paperclip.git，添加为 `upstream` remote，fetch 后合并到工作分支。
- `gitcode` = https://gitcode.com/glorius/paperclip.git 作为个人镜像，push 备份。
- gitee origin 保留用于日常 push 备份，不做改动。

```
github.com/vincent-wuhan/paperclip   (upstream, fetch 同步源)
        │
        │ fetch + merge
        ▼
  yueming/v2026.820 (工作分支)
        │
        ├──push──▶ gitcode.com/glorius/paperclip (个人镜像备份)
        └──push──▶ gitee origin (保留)
```

### 决策 2：部署形态 = 开发模式（源码运行）

- 用仓库自带 `pnpm dev`（dev-runner watch 模式）启动 server + UI。
- 数据库用 Paperclip 自带的 DB 方案（`db:generate` / `db:migrate`）。
- 不用 Docker quickstart：后续要针对协同流程做配置迭代与可能的二次开发，源码运行改起来最直接；仓库 node_modules 已就绪。

### 决策 3：验收机制 = 原生 comment 流程（零代码定制）

- 不改 Paperclip 源码，使用原生 issue/task/comment 能力承载协同。
- 角色-职责约定（通过 Paperclip 组织/agent 配置实现，而非代码）：

```
┌────────────────────────────────────────────────────┐
│  Paperclip 本地实例 (dev 模式)                       │
│                                                    │
│  ┌─────────┐  1.创建计划   ┌─────────┐             │
│  │  Codex  │ ───────────▶ │ Issue/  │             │
│  │ (计划者) │  task 分解    │ Task    │             │
│  └─────────┘              └────┬────┘             │
│       ▲                        │ 2.认领执行         │
│       │ 4.验收 comment          ▼                  │
│       │  (通过/打回)       ┌─────────┐             │
│  └─────────────────────── │ Claude  │             │
│                            │ (执行者) │             │
│                            └────┬────┘             │
│                                 │ 3.完成报告 comment │
│                                 ▼                  │
│                            Issue/Task 状态流转      │
└────────────────────────────────────────────────────┘
```

流转约定（写入 Paperclip agent 的系统提示/工作约定，属于配置而非代码）：
1. **Codex（计划者）**：创建 issue + 分解 task，每 task 写明验收标准。
2. **Claude（执行者）**：认领 task，实施后提交完成 comment（改动摘要 + 自测证据）。
3. **Codex（验收者）**：审阅 comment 与实际 diff，回复通过 comment 或打回（附缺陷清单）。
4. 相互映证：验收 comment 中必须引用执行者 comment 的关键声明并逐条核对（check 闭环）。

### 数据流

```
upstream(github vincent-wuhan) fetch ─▶ merge 到工作分支 ─▶ fast-forward 本地 master
                                        │
                                        ▼
                        pnpm install (如锁文件变化)
                                        │
                          db:generate / db:migrate
                                        │
                            pnpm dev (server+UI watch)
                                        │
                        浏览器访问 ─▶ 初始化组织 ─▶ 配置
                        Codex/Claude 两个 agent ─▶ 建立
                        issue/task/comment 流转约定
```

## 方案选型对比

| 维度 | 选定方案 | 备选（否决原因） |
|------|---------|----------------|
| 同步源 | github vincent-wuhan/paperclip（upstream remote） | gitcode（是个人镜像，作 push 备份而非 fetch 源）；纯 gitee（冗余） |
```

Full source: openspec/changes/sync-and-local-deploy-paperclip/design.md

## openspec/changes/sync-and-local-deploy-paperclip/tasks.md

- Source: openspec/changes/sync-and-local-deploy-paperclip/tasks.md
- Lines: 1-25
- SHA256: 6a1d8bcc46ac3111a6cfdfd9b30013ab79e1d1005a0a1f203ac446c6988a447e

```md
# Tasks: sync-and-local-deploy-paperclip

## 1. 代码同步（code-sync）

- [ ] 1.1 处理未提交改动：评估 `server/src/middleware/logger.ts`、`server/src/secrets/local-encrypted-provider.ts` 的修改与 `.runbook/`、`skills/` 未跟踪目录，决定 stash/commit/保留
- [ ] 1.2 添加 remotes：`upstream` = https://github.com/vincent-wuhan/paperclip.git（fetch 源），`gitcode` = https://gitcode.com/glorius/paperclip.git（push 备份），fetch upstream 最新代码
- [ ] 1.3 将 upstream 最新 commit 合并到 `yueming/v2026.820` 工作分支，解决可能的冲突
- [ ] 1.4 更新本地 `master` 分支指针到最新 upstream/master（fast-forward）
- [ ] 1.5 验证：`git log` 确认工作分支包含上游最新 commit，`pnpm typecheck` 通过；推送到 gitcode 镜像备份

## 2. 本地部署（local-dev-deploy）

- [ ] 2.1 检查本地环境：Node.js 版本、pnpm、端口占用情况
- [ ] 2.2 安装/刷新依赖（如 pnpm-lock.yaml 有变化则 `pnpm install`）
- [ ] 2.3 初始化数据库：`pnpm db:generate` + `pnpm db:migrate`
- [ ] 2.4 启动服务：`pnpm dev`（server + UI watch 模式）
- [ ] 2.5 验证：浏览器访问 UI，确认服务健康（server 日志无错误、页面可操作）

## 3. 协同流程配置（dual-harness-collaboration）

- [ ] 3.1 初始化 Paperclip 组织（公司/团队结构）
- [ ] 3.2 配置 Codex agent（计划者+验收者角色），写入计划制定与验收的工作约定（含验收标准模板、逐条核对要求）
- [ ] 3.3 配置 Claude Code agent（执行者角色），写入执行与完成报告的工作约定（改动摘要 + 自测证据格式）
- [ ] 3.4 建立流转约定文档：issue/task/comment 的状态机与四步流转（计划→认领→完成报告→验收/打回）
- [ ] 3.5 端到端演练：创建一个试点 issue，走完 Codex 计划 → Claude 执行 → Codex 验收全流程，验证相互映证闭环
```

## openspec/changes/sync-and-local-deploy-paperclip/specs/code-sync/spec.md

- Source: openspec/changes/sync-and-local-deploy-paperclip/specs/code-sync/spec.md
- Lines: 1-24
- SHA256: 3983c1f19c3b05295f7018ff9e22683f5f273ef5fdde28107711a1916c800843

```md
# Delta Spec: code-sync

## ADDED Requirements

### Requirement: 从 github 上游同步并推送镜像

同步操作（本地 git 操作序列）**shall**：

- 以 `upstream` remote（https://github.com/vincent-wuhan/paperclip.git）为唯一 fetch 同步源。
- 同步前对 embedded PG 数据执行备份（`pnpm db:backup`）。
- 同步前处理未提交改动：已修改文件若与上游冲突则 stash，否则 commit；未跟踪的本地运维目录单独 commit。
- 受控停止服务（`pnpm dev:stop`）后再执行 merge，不直接 kill 进程。
- 同步后更新本地 `master` 指针（fast-forward 到 upstream/master）并推送工作分支到 `gitcode` 镜像（https://gitcode.com/glorius/paperclip.git）。

#### Scenario: 单 commit 同步全流程

- **WHEN** 工作分支落后 upstream/master 1 个仅涉及 skill 文档的 commit
- **THEN** 备份 → 处理改动 → 停服务 → fetch/merge → master 指针更新 → 重启 → `pnpm typecheck` 通过
- **AND** UI 冒烟确认既有 3 个 company 数据完好

#### Scenario: merge 冲突中止恢复

- **WHEN** merge upstream/master 产生冲突
- **THEN** 执行 `git merge --abort` 回到同步前状态，服务可重启，数据无损
```

## openspec/changes/sync-and-local-deploy-paperclip/specs/dual-harness-collaboration/spec.md

- Source: openspec/changes/sync-and-local-deploy-paperclip/specs/dual-harness-collaboration/spec.md
- Lines: 1-36
- SHA256: 7f1f56f959fddcd4b2fc5042601b72c4adc407e7d29ab9c985363d919dcc835d

```md
# Delta Spec: dual-harness-collaboration

## ADDED Requirements

### Requirement: 专用 company 隔离

协同流程**shall** 使用新建的专用 company，与既有 company（fund-observatory 等）数据隔离：

- 协同 issue/task/comment/agent 配置只存在于专用 company。
- 既有 company 的运行（心跳、定时任务）不受协同配置影响。

#### Scenario: 数据隔离

- **WHEN** 在协同专用 company 中创建试点 issue 并走完流转
- **THEN** 既有 company 的 issue 列表与运行状态不受任何影响

### Requirement: 四步流转闭环

双 harness（Codex 计划/验收 + Claude 执行）**shall** 通过原生 issue/task/comment 完成四步流转：

1. Codex（计划者）：创建 issue + 分解 task，每 task 写明验收标准。
2. Claude（执行者）：认领 task，实施后提交完成 comment（改动摘要 + 自测证据）。
3. Codex（验收者）：审阅 comment 与实际 diff，回复通过 comment 或打回（附缺陷清单）。
4. 相互映证：验收 comment 必须引用执行者 comment 的关键声明并逐条核对。

#### Scenario: 试点 issue 全流程

- **WHEN** 创建一个试点 issue
- **THEN** 依次产生：Codex 计划产物（issue + task + 验收标准）、Claude 完成报告 comment、Codex 验收 comment
- **AND** 验收 comment 中包含对执行者声明逐条核对的记录

#### Scenario: 打回闭环

- **WHEN** Codex 验收发现缺陷
- **THEN** 打回 comment 附缺陷清单，task 回到执行态
- **AND** Claude 修复后重新提交完成 comment，再次进入验收
```

## openspec/changes/sync-and-local-deploy-paperclip/specs/local-dev-deploy/spec.md

- Source: openspec/changes/sync-and-local-deploy-paperclip/specs/local-dev-deploy/spec.md
- Lines: 1-27
- SHA256: 93c9a3043b5474b9b51bffa9734450279174619fa6b6f907db7bab4efea55f3a

```md
# Delta Spec: local-dev-deploy

## ADDED Requirements

### Requirement: 开发模式部署与健康验证

系统**shall** 以源码方式（`pnpm dev`，tsx watch）在本地运行 Paperclip 服务：

- `.env` 配置 `PORT=3110`、不设 `DATABASE_URL`（嵌入式 PostgreSQL 模式，数据目录 `~/.paperclip/instances/default/db`）。
- 服务监听 `127.0.0.1:3110`，UI 可通过浏览器访问。
- 部署验证：server 日志无错误、UI 页面可操作、既有 company 数据可见。

#### Scenario: 同步前后数据存活

- **WHEN** 在运行中的实例上执行代码同步（备份→停服务→merge→重启）
- **THEN** 同步后既有 3 个 company 的 issue/comment/agent 配置数据完好
- **AND** embedded PG 数据目录（`~/.paperclip/instances/default/db`）在同步过程中不被删除或重置

#### Scenario: 依赖刷新条件

- **WHEN** 同步的 commit 未修改 `pnpm-lock.yaml`
- **THEN** 跳过 `pnpm install`，直接重启服务

#### Scenario: 健康检查

- **WHEN** `pnpm dev` 启动完成
- **THEN** `127.0.0.1:3110` 可访问且 UI 首页正常渲染
```

