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
| 部署 | 源码 dev 模式 | Docker quickstart（定制不便）；Docker→源码两步走（多余，仓库依赖已就绪） |
| 验收机制 | 原生 comment 流程 | PAP-1139 signoff 策略（属上游未合入分支的探索，不稳）；自定义插件（前期成本高，先跑通原生流程） |

## 风险与对策

- **合并冲突**：工作分支与上游仅差 1 commit 且领先 0，冲突风险极低；未提交改动（logger.ts 等）在 merge 前 stash 或先 commit。
- **DB schema 变更**：同步的 1 个 commit 不涉及 DB；若后续同步涉及，跑 `db:migrate` 解决。
- **端口/环境冲突**：dev 模式端口可配置，启动前检查占用。
- **harness 接入**：Codex/Claude 均为 Paperclip 原生支持 adapter，接入走其标准 heartbeat/API 配置。
