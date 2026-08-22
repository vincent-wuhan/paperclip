# sync-and-local-deploy-paperclip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在运行中的本地 Paperclip 实例上安全同步 github 上游代码，验证部署健康，并复用 Pilot company 跑通 Codex/Claude 双 harness 四步协同流转。

**Architecture:** 运维操作序列（非代码开发）：备份 → 提交本地改动 → 受控停服 → merge → 重启回归 → Pilot company 配置修订与端到端试点。每步"操作→验证"，验证不过不进下一步。

**Tech Stack:** git (upstream=github vincent-wuhan, 备份=gitcode)、pnpm dev (tsx watch + embedded PostgreSQL 18.1)、Paperclip REST API (`http://127.0.0.1:3110/api/...`)。

---
```yaml
change: sync-and-local-deploy-paperclip
design-doc: docs/superpowers/specs/2026-08-21-sync-deploy-paperclip-design.md
base-ref: d648becb90a346818e83d42c4439e2456228c657
```

---

**关键事实（执行者必读）：**
- 服务**正在运行**：node tsx `server/src/index.ts` 监听 `127.0.0.1:3110`（`.env`: `PORT=3110`，无 `DATABASE_URL` → embedded PG `:54329`，数据在 `~/.paperclip/instances/default/db`）
- 待合入 upstream commit `66575fe51` 只改 `.agents/skills/paperclip-page/` 4 个文件，与本地改动零重叠
- API 无需认证即可 GET（deploymentMode: local_trusted）；health 探针：`GET /api/health` → `{"status":"ok",...}`
- Pilot company ID：`34b76735-88f1-4f48-9d1f-721b2d1eaeed`；6 个 agent：Codex Planner(7d324ebc)/Claude Executor(2dd487e6)/Codex Reviewer(0ea8f249)/Trae Tester(ffc75ea9)/Summarizer(4952647f)/Reflection Coach(d02dca2d)（ID 前 8 位）
- 停滞 issue：Pilot 里大量 `blocked`/`todo` 态 PAP-1xx issue

---

### Task 1: 数据库备份

**Files:** 无文件改动（产出备份文件于 `~/.paperclip/instances/default/data/backups/`）

- [x] **Step 1: 执行备份**

```bash
./scripts/backup-db.sh
```

- [x] **Step 2: 验证备份文件**

Run: `ls -t ~/.paperclip/instances/default/data/backups/ | head -1`
Expected: 形如 `paperclip-YYYYMMDD-HHMMSS.sql.gz` 的新文件，大小 > 1M

- [x] **Step 3: 勾选 tasks.md 1.1 并提交**

```bash
# 编辑 openspec/changes/sync-and-local-deploy-paperclip/tasks.md 勾选 1.1
git add openspec/changes/sync-and-local-deploy-paperclip/tasks.md
git commit -m "chore(change): task 1.1 db backup done"
```

### Task 2: 提交本地未提交改动

**Files:**
- Modify(暂存): `server/src/middleware/logger.ts`、`server/src/secrets/local-encrypted-provider.ts`
- Add: `.runbook/`、`skills/autoglm-hermes-bridge/`、`skills/fund-market-data/`

- [x] **Step 1: 确认改动内容仍是预期两组**

Run: `git status --short && git diff --stat`
Expected: 只有 logger.ts (+13/-2 redactRequestBody secrets 路由脱敏)、local-encrypted-provider.ts (+2/-2 expandHomePrefix)、未跟踪 `.runbook/` `skills/autoglm-hermes-bridge/` `skills/fund-market-data/`

- [x] **Step 2: 分两个 commit 提交**

```bash
git add server/src/middleware/logger.ts server/src/secrets/local-encrypted-provider.ts
git commit -m "fix(server): redact secret-route request bodies and expand ~ in master key path"

git add .runbook/ skills/autoglm-hermes-bridge/ skills/fund-market-data/
git commit -m "chore(local): track runbook and fund-market-data/autoglm skills"
```

- [x] **Step 3: 验证工作树干净**

Run: `git status --short`
Expected: 空输出（可能残留 openspec/ 与 docs/ 的 change 产物未跟踪/未提交 —— 这些留待 Task 7 一并提交）

### Task 3: 添加 remotes 并 fetch

**Files:** 无（git remote 配置）

- [x] **Step 1: 添加 upstream 与 gitcode**

```bash
git remote add upstream https://github.com/vincent-wuhan/paperclip.git
git remote add gitcode https://gitcode.com/glorius/paperclip.git
```

（已存在时报错可忽略，用 `git remote set-url` 校正）

- [x] **Step 2: fetch upstream**

```bash
git fetch upstream
```

Expected: 拉取成功，`upstream/master` 指向 `66575fe51...`

- [x] **Step 3: 验证目标 commit**

Run: `git log upstream/master --oneline -1`
Expected: `66575fe51 fix(paperclip-page): scope uploader credentials to the publish helper (#10894)`

### Task 4: 受控停服 + merge + master 指针更新

**Files:** `.agents/skills/paperclip-page/`（来自 merge）

- [x] **Step 1: 受控停服**

```bash
pnpm dev:stop
```

Expected: 停止成功输出；验证 `lsof -i :3110 -P -n` 无监听、`lsof -i :54329 -P -n` 无监听（embedded PG 一并退出）

- [x] **Step 2: merge upstream/master**

```bash
git merge upstream/master --no-edit
```

Expected: fast-forward 或干净 merge，只动 `.agents/skills/paperclip-page/` 4 文件。冲突时：`git merge --abort` 后人工评估。

- [x] **Step 3: 更新本地 master 指针**

```bash
git branch -f master upstream/master
```

- [x] **Step 4: 验证锁文件未变**

Run: `git diff HEAD~1 --stat -- pnpm-lock.yaml`
Expected: 无输出（→ 跳过 `pnpm install`；有输出则 `pnpm install` 后再继续）

### Task 5: 重启 + 回归验证

**Files:** 无（操作验证）

- [x] **Step 1: 后台启动服务**

```bash
pnpm dev:once
```

（或 `pnpm dev` watch 模式后台运行；启动需等待 embedded PG + server 就绪）

- [x] **Step 2: 健康检查**

Run: `curl -s http://127.0.0.1:3110/api/health`
Expected: `{"status":"ok",...,"bootstrapStatus":"ready"}`，`commit` 字段包含 merge 后的 HEAD

- [x] **Step 3: 数据存活验证**

Run: `curl -s http://127.0.0.1:3110/api/companies | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"`
Expected: `3`（Paperclip Pilot / Fund Observatory / 镜舟传媒）

Run: `ls ~/.paperclip/instances/default/db/PG_VERSION`
Expected: 文件存在（数据目录未重置）

- [x] **Step 4: typecheck**

```bash
pnpm typecheck
```

Expected: 通过（无 error 退出）

- [x] **Step 5: 推送镜像备份**

```bash
git push gitcode yueming/v2026.820
git push gitcode master
```

（如远端默认分支保护导致 master 推送被拒，改推 `git push gitcode master:main` 或仅推工作分支，记录即可）

- [x] **Step 6: 勾选 tasks.md 1.2–1.6、2.1–2.2 并提交**

```bash
git add openspec/changes/sync-and-local-deploy-paperclip/tasks.md
git commit -m "chore(change): code sync and deploy verification done"
```

### Task 6: Pilot company 清理与 agent 配置修订

**Files:** 无仓库文件（通过 Paperclip API/UI 配置）

- [x] **Step 1: 盘点停滞 issue**

Run: `curl -s "http://127.0.0.1:3110/api/companies/34b76735-88f1-4f48-9d1f-721b2d1eaeed/issues?limit=200" | python3 -c "
import json,sys
data=json.load(sys.stdin)
issues=data if isinstance(data,list) else data.get('issues',[])
from collections import Counter
print(Counter(i.get('status') for i in issues))"`
Expected: blocked/todo 数量清单（记下总数）

- [x] **Step 2: 批量关闭停滞 issue**

对每个非 done/cancelled 的 PAP issue 逐个：

```bash
curl -s -X PATCH "http://127.0.0.1:3110/api/issues/<issue-id>" \
  -H "content-type: application/json" \
  -d '{"status":"cancelled"}'
```

（若 API 字段名不同，先 `GET /api/issues/<id>` 观察字段；用 UI 批量操作亦可。目标：Pilot 活跃列表只剩空或新试点）

- [x] **Step 3: 读取 3 个关键 agent 的现有配置**

Run: `curl -s "http://127.0.0.1:3110/api/companies/34b76735-88f1-4f48-9d1f-721b2d1eaeed/agents" > /tmp/agents.json && python3 -m json.tool /tmp/agents.json | head -100`

对照四步流转约定，记录 Codex Planner / Claude Executor / Codex Reviewer 的 system prompt 缺口。

- [x] **Step 4: 修订 agent 配置（通过 UI 或 PATCH agents API）**

修订要点：
- Codex Planner：计划产物必须含每 task 的验收标准（可核对条目式）
- Claude Executor：完成 comment 格式 = 改动摘要 + 自测证据（命令与输出）
- Codex Reviewer：验收 comment 必须引用执行者声明并逐条标注 ✅/❌，打回附缺陷清单

- [x] **Step 5: 落地流转约定文档**

在 Pilot company 工作区（或 issue 形式）写入四步流转约定文本：计划→认领→完成报告→验收/打回，含相互映证要求。

- [x] **Step 6: 勾选 tasks.md 3.1–3.4 并提交**

```bash
git add openspec/changes/sync-and-local-deploy-paperclip/tasks.md
git commit -m "chore(change): pilot company cleanup and agent conventions done"
```

### Task 7: 端到端试点 + change 产物提交

**Files:**
- Add: `openspec/`（change 产物）、`docs/superpowers/`（design doc、本计划）

- [x] **Step 1: 创建试点 issue**

通过 UI 或 API 在 Pilot company 创建一个**小而真实**的试点 issue（例：给 `.runbook/` 补一个 README 索引），标题带 `[PILOT]` 前缀。

- [x] **Step 2: 走四步流转**

人工驱动（或触发 agent run）：Codex Planner 计划 → Claude Executor 执行 + 完成 comment → Codex Reviewer 验收 comment（逐条核对）。每步在 issue 时间线留痕。

- [x] **Step 3: 验证闭环**

Run: `curl -s "http://127.0.0.1:3110/api/issues/<pilot-issue-id>/comments" | python3 -m json.tool | tail -40`
Expected: 时间线含计划、完成报告（改动摘要+自测证据）、验收（逐条核对）三类 comment

Run: `curl -s http://127.0.0.1:3110/api/companies | python3 -c "import json,sys; print([c['name'] for c in json.load(sys.stdin)])"`
Expected: 3 个 company 均在，Fund Observatory / 镜舟传媒 的最近 issue 未变

- [x] **Step 4: 提交 change 产物**

```bash
git add openspec/ docs/superpowers/
git commit -m "docs(change): sync-and-local-deploy-paperclip artifacts (proposal/design/specs/tasks/plan)"
```

- [x] **Step 5: 勾选 tasks.md 3.5、全量验证**

```bash
pnpm typecheck && git status --short
```

Expected: typecheck 通过；工作树只剩 openspec tasks.md 勾选变更，一并提交。

---

## Self-Review 记录

- Spec 覆盖：code-sync（Task 1–5）、local-dev-deploy（Task 5 Step 2–3）、dual-harness-collaboration（Task 6–7，含停滞清理与隔离验证场景）✓
- 占位符扫描：无 TBD/TODO；agent 配置修订给了具体要点 ✓
- 类型/命名一致：Pilot company ID、agent 名、端口、路径全文一致 ✓
