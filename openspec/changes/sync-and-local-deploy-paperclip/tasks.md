# Tasks: sync-and-local-deploy-paperclip

## 1. 代码同步（code-sync）

- [x] 1.1 备份数据库：`pnpm db:backup`（embedded PG 运行中执行，验证备份文件生成）
- [x] 1.2 提交未提交改动：`logger.ts`（secrets 路由日志脱敏）与 `local-encrypted-provider.ts`（master key 路径 ~ 展开）commit 到工作分支；`.runbook/`、`skills/` 未跟踪目录单独 commit（本地运维脚本，保留跟踪）
- [x] 1.3 添加 remotes：`upstream` = https://github.com/vincent-wuhan/paperclip.git（fetch 源），`gitcode` = https://gitcode.com/glorius/paperclip.git（push 备份），fetch upstream 最新代码
- [x] 1.4 受控停服（卸载 launchd KeepAlive 任务后 kill 进程树），将工作分支 **rebase** 到 upstream/master（全量 243 commits，fd106c6fa；零冲突，修复 1 处上游签名变化）
- [x] 1.5 更新本地 `master` 分支指针到 upstream/master（fast-forward）；`pnpm install`（lock 大改）+ `db migrate`（15 个 pending migrations 应用）
- [x] 1.6 重启服务（`pnpm dev`）+ 回归：`/api/health` 200、`/api/companies` 返回 3 个 company；`pnpm typecheck` 通过；推送工作分支与 master 到 gitcode 镜像

## 2. 本地部署验证（local-dev-deploy）

- [x] 2.1 验证运行环境：Node v22 / pnpm 9、`/api/health` 返回 `bootstrapStatus: ready`、server 日志无错误（服务已在运行，验证代替部署）
- [x] 2.2 验证数据存活：同步重启后既有 3 个 company 的 issue/agent 配置完好，embedded PG 数据目录未被重置

## 3. 协同流程配置（dual-harness-collaboration）

- [x] 3.1 清理 Pilot company 停滞 issue：批量关闭 blocked/todo 态的历史 PAP issue（PAP-1xx 系列），活跃列表只留新试点（111 个全部 cancelled）
- [x] 3.2 审视并修订 Codex Planner / Codex Reviewer agent 配置：计划产物含验收标准模板（新增"验收标准必须客观可核对"规则）；验收 comment 必须逐条核对执行者声明（新增 Cross-Check 相互映证表格规范）
- [x] 3.3 审视并修订 Claude Executor agent 配置：完成 comment 格式新增强制 Self-test evidence（命令 + 真实输出）
- [x] 3.4 落地流转约定文档：四步流转（计划→认领→完成报告→验收/打回）+ 相互映证要求，以 PAP-112 issue 形式发布在 Pilot company
- [x] 3.5 端到端试点：PAP-113（[PILOT] Add README index to .runbook/）走完 Codex 计划（含可核对验收标准）→ Claude 执行（含自测证据）→ Codex 验收（Cross-Check 表逐条核对 6/6 声明，verdict approve）全流程，相互映证闭环验证；其他 company 不受影响（Fund Observatory/镜舟传媒 issue 状态未变）
