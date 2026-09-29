# Paperclip 插件首批 API 面（ADR-1 落地稿）

> 阶段: 契约基线
> 锚定自: [`baseline.lock`](../baseline.lock)

本文件落地产出 ADR-1 中声明的"首批 API 面"。**仅本阶段必需最小集**，其余能力留待后续 Phase 重新评估。

## 1. 范围声明

- **本阶段使用**(4 类):
  - `plugin manifest`（capabilities + schema_version）
  - `validator`（manifest schema 校验）
  - `webhook receiver`（OpsKeeper 事件落点）
  - `approval bridge`（占位 + 默认关闭）
- **本阶段禁止**(5 条黑名单，固化在 `baseline.lock` 与 CODEOWNERS):
  - `execute-*`、`shell-*`、`write-mcp-*`、`cross-resource-*`、`mutate-*`

任何对这些黑名单能力的请求必须**回退到安全评审**，不得静默启用。

## 2. API 面矩阵

| API 面 | 端点 / 形态 | 用途 | 权限要求 | 黑名单风险 |
|---|---|---|---|---|
| `plugin manifest` | `paperclip-plugin.json` (`capabilities[]`, `schema_version`) | 声明自身最低能力 | read-only | 误声明写入面 |
| `plugin validator` | `POST plugin/validate` | 上线门禁（CI 调用） | read-only | – |
| `webhook receiver` | `POST plugin/events` (`X-OpsKeeper-Signature`) | 接收 OpsKeeper 推送 | ingest-only | 需 HMAC 验签 |
| `approval bridge` | `POST plugin/approvals/callback` | Phase B 占位 | approval-only | **默认 `enabled=false`** |

### 2.1 字段约束

`paperclip-plugin.json`：

```json
{
  "name": "opskeeper-connector",
  "schema_version": "1.0.0",
  "capabilities": [
    "plugin.manifest",
    "plugin.validator",
    "plugin.webhook.ingest",
    "plugin.approval.bridge"
  ],
  "approval_bridge_enabled": false,
  "blacklist_self_check": true
}
```

黑名单自检字段 `blacklist_self_check` 在 CI 与启动期都会再校验一次。

## 3. 验收检查

| 验收项 | 命令 | 期望 |
|---|---|---|
| 锁 commit/tag | `git rev-parse HEAD && git describe --tags --exact-match` | 输出与 `baseline.lock` 一致 |
| manifest 黑名单 | `npm run lint:capabilities` | 退出码 0，无 `execute-/shell-/write-mcp-/cross-resource-/mutate-` |
| webhook HMAC | `tests/contract/cases/webhook_hmac.spec.ts` | 用例绿 |
| approval 默认关 | `tests/contract/cases/approval_default_off.spec.ts` | 用例绿 |

## 4. 与硬性约束的对照

集成硬性约束：
- ✅ 不暴露修复/Shell/可变 MCP/跨资源动作 —— 黑名单已固化
- ✅ 审批桥接默认关闭 —— `approval_bridge_enabled=false` + `baseline.lock.guards.approve_bridge_default_off=true`
- ✅ 凭据最小化 —— 见 `docs/service-account.md`

## 5. 回滚

- 切回上一个 `release/<v>` tag + 重做 §3 验收
- 保留 `baseline.lock` 的 `previous_pin` 字段用于一键回退（落入下一阶段任务）
