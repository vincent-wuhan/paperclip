---
comet_change: sync-and-local-deploy-paperclip
role: technical-design
canonical_spec: openspec
---

# Design Doc: sync-and-local-deploy-paperclip

需求事实源：`openspec/changes/sync-and-local-deploy-paperclip/`（proposal / design / tasks）。本文档只做技术设计，不重复需求。

## 现状重估（设计地基）

设计前探查证实，本机 Paperclip 实例已在运行：

- 服务进程：node PID（tsx `server/src/index.ts`），监听 `127.0.0.1:3110`（`.env`: `PORT=3110`，未设 `DATABASE_URL` → 嵌入式 PG 模式）
- 数据库：嵌入式 PostgreSQL 18.1（二进制来自仓库 `node_modules`），监听 `:54329`，数据目录 `~/.paperclip/instances/default/db`
- 实例数据：`~/.paperclip/instances/default/` 下已有 3 个 company、真实 issue/comment 活动（日志当天仍在写入，`codex_local` adapter 在跑）

因此设计重心从"部署"转为"在运行中的实例上安全同步代码 + 在现有实例上做协同配置"。

## 代码同步方案（含运行中服务的安全协议）

前置事实：待合入的上游 commit（66575fe51）仅修改 paperclip-page skill 文档（AWS 凭据说明），不触碰 server 代码、DB schema、依赖。

执行顺序：

1. **快照**：`pnpm db:backup`（备份 embedded PG 数据，服务自带脚本）。
2. **未提交改动**：
   - `server/src/middleware/logger.ts`、`server/src/secrets/local-encrypted-provider.ts`（M）：先 diff 与上游改动是否冲突；冲突则 stash，否则 commit 到工作分支。
   - `.runbook/`、`skills/`（未跟踪）：含本地运维脚本，单独 commit 保留跟踪（不混入同步 commit）。
3. **停服务（受控）**：`pnpm dev:stop`，让 embedded PG 干净落盘。不直接 kill。
4. **同步**：
   - `git remote add upstream https://github.com/vincent-wuhan/paperclip.git`
   - `git fetch upstream && git merge upstream/master`（工作分支 `yueming/v2026.820`）
   - `git branch -f master upstream/master`（更新过期 1214 commits 的本地 master 指针）
   - 验证 pnpm-lock.yaml 无变化后跳过 `pnpm install`；有变化才安装
5. **重启 + 回归**：`pnpm dev` → 健康检查 → UI 冒烟确认 3 个 company 数据完好。
6. **备份镜像**：推送工作分支与 master 到 `gitcode`（`https://gitcode.com/glorius/paperclip.git`）。gitee origin 保留不动。

## 协同流程配置

**复用既有 "Paperclip Pilot" company**（build 阶段探查修正：该 company 已存在且正是本场景，含 Codex Planner / Claude Executor / Codex Reviewer / Trae Tester 等 6 个 agent），与 Fund Observatory、镜舟传媒等其他 company 天然数据隔离。历史停滞 issue（PAP-1xx）在试点前批量关闭归档。

四步流转闭环（修订既有 agent 的 adapter 配置/system prompt，属配置非代码）：

```
1. Codex（计划者+验收者）：创建 issue + 分解 task，
   每 task 写明验收标准
2. Claude（执行者）：认领 task，实施后提交完成
   comment（改动摘要 + 自测证据）
3. Codex（验收者）：审阅 comment 与实际 diff，
   回复通过 comment 或打回（附缺陷清单）
4. 相互映证：验收 comment 必须引用执行者 comment 的
   关键声明并逐条核对（check 闭环）
```

流转约定文档落在 Pilot company 的工作区内，作为两个 agent 共同的约定来源。

## 错误处理

| 故障 | 对策 |
|------|------|
| merge 冲突 | `git merge --abort`；服务回同步前代码可重启 |
| 同步后服务起不来 | DB 已有备份；embedded PG 数据目录独立于 git，回滚代码即可 |
| `pnpm install` 触碰 embedded-postgres 二进制 | PG 数据在 `~/.paperclip`，不受 node_modules 变化影响；最坏 reinstall |
| 协同试点卡在流转某步 | 四步每步都有 comment 留痕，可从 issue 时间线定位卡点，人工接管续跑 |

## 测试策略

- **同步后**：`pnpm typecheck` 通过（tasks 1.5）
- **部署验证**：UI 可访问、server 日志无错误、3 个 company 数据完好（备份→同步→数据存活验证）
- **协同验证**：试点 issue 走完四步流转；验收 comment 含逐条核对记录

## Spec Patch（回写 OpenSpec delta spec）

确认后回写以下验收场景：

- `local-dev-deploy`：同步前后现有 company 数据与 embedded PG 数据完好（备份→同步→恢复验证）。
- `dual-harness-collaboration`：协同使用专用 company，与既有 company（fund-observatory 等）数据隔离。
