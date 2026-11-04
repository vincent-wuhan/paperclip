# paperclip 上游 issue 草稿（2026-11-04）

背景：奔悦在 walker（智能 SRE 垂域插件）实战中踩到的三个平台级问题。
分支 `yueming/v2026.10`（commit `c50514f31`）已含问题 1 的修复补丁，可直接作为 PR 基础。

---

## Issue 1: Event delivery failures are silently dropped — stale subscriptions become invisible

**Symptom**

A plugin worker restart (crash-recovery backoff or upgrade) can leave event-bus
subscriptions whose handlers proxy into the dead worker channel. Every
subsequent emit to those handlers fails, but the errors collected in
`PluginEventBusEmitResult.errors` are never surfaced anywhere. The plugin
appears subscribed (activation log shows `eventSubscriptions: N`) while
receiving nothing. In our case the walker plugin silently stopped ingesting
contract comments for ~30 minutes with zero log lines.

**Root cause**

`server/src/services/plugin-event-bus.ts` `emit()` collects handler errors
into the result, but callers (DB-layer emitters) discard the result.

**Proposed fix** (implemented in `c50514f31` on branch `yueming/v2026.10`)

Inject an optional failure logger via `setPluginEventBusLogger()`; warn with
plugin + error detail whenever `errors.length > 0`. Non-invasive, zero cost
when unset.

**Suggested follow-ups**

- On repeated delivery failures for the same subscription, auto-deregister it
  and/or surface plugin health degradation.
- Consider re-running plugin setup subscriptions on worker crash-restart
  (crash-restart currently bypasses the loader's activate path, so stale
  handlers survive).

---

## Issue 2: Capability escalation on upgrade is hard-blocked with no approval path

**Symptom**

Upgrading a plugin that adds any new capability fails with 400 "introduces new
capabilities that require approval" — but there is no approval flow anywhere:
not in the operator UI, not in the API. The only workaround is uninstall +
reinstall, which wipes plugin state.

**Impact**

- Per-plugin state loss on every legitimate capability addition.
- The governance intent (require human review of escalated capability) is
  defeated by the uninstall workaround, so the gate currently provides
  friction without security.

**Request**

Implement the approval the error message promises: e.g. a pending-approval
record + `POST /api/plugins/{id}/approve-capabilities` (board auth), visible
in the plugin settings UI.

---

## Issue 3: Plugin jobs have no company scope — background work cannot read issues/config

**Symptom**

Inside a `jobs.register` handler, `ctx.companies.list`, `ctx.issues.list`,
`ctx.config.get` all fail with "company context is required". Jobs are the
only place a plugin can run periodic work, yet they cannot read anything
company-scoped.

**Impact on architecture**

Plugins are forced into pure event-driven ingestion (`issue.created` /
`issue.comment.created`) even for inherently periodic work (polling an
external system's issues, reconciliation, sweeps). Combined with issue 1
(silent event delivery failure), this is a structural reliability risk:
when events stall, plugins have no fallback read path.

**Requests (any one would unblock)**

1. Allow per-company job declarations (manifest `companies: [...]` or
   auto-fan-out), passing companyId into the job context.
2. Permit `issues.list` / `config.get` with an explicit `companyId` argument
   from job context (the argument already exists in the API shape).
3. Document the intended pattern for periodic company-scoped plugin work.

---

## 附：中文摘要

1. **事件投递失败静默**（已修，`c50514f31`）：失效订阅无感知，建议合并补丁 + 重复失败自动注销 + crash-restart 重放订阅
2. **capability 升级审批只有硬闸**：无放行界面/端点，唯一出路删号重装清 state，治理意图被绕过架空
3. **job 无公司作用域**：插件被迫全事件驱动，与问题 1 叠加成可靠性结构性风险，建议 per-company job 或允许显式 companyId 参数
