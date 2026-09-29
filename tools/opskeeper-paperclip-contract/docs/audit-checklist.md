# 权限模型 × 失败路径 审计清单（落地稿）

> 阶段: 契约基线
> 关联: `docs/api-surface.md`、`docs/service-account.md`、`tests/contract/fake_opskeeper.ts`

每条审计项必须可证伪 —— 用 `/path/to/check.sh` 或具体测试 ID 引用证据。

## A. 权限模型审查

- [ ] **A-1** Paperclip manifest 无 `execute-*` / `shell-*` / `write-mcp-*` / `cross-resource-*` / `mutate-*` 任一 capability
    - 证据: `tests/contract/scripts/lint-capabilities.sh`（`npm run lint:capabilities`）
- [ ] **A-2** 服务账户仅持有 `ok-readonly` 与 `ok-approval` 两类 scope，无 admin scope
    - 证据: `tests/contract/cases/service_account_negative.spec.ts`
- [ ] **A-3** 凭据注入走 secret store，未落盘、未写入 manifest、未进仓库
    - 证据: `tests/contract/scripts/lint-secrets.sh`（`npm run lint:secrets`） + 仓库 grep
- [ ] **A-4** 轮换记录可在 OpsKeeper audit log 中查到对应 `secret_version` 切换
    - 证据: `tests/contract/cases/service_account_negative.spec.ts` 末尾的"轮换审计 trace"用例

## B. 失败路径审查（每条必须有对应测试用例）

- [ ] **B-1** 5xx 不会污染 cursor、不重复建档
    - 证据: `tests/contract/cases/failure_5xx.spec.ts` —— 客户端只在 2xx 推进 cursor
- [ ] **B-2** 超时被识别为 stale，UI/页面有显式提示
    - 证据: `tests/contract/cases/failure_timeout.spec.ts` —— 客户端把响应包成 `state: "stale"`
- [ ] **B-3** 401/403 触发告警，停止轮询，不静默重试
    - 证据: `tests/contract/cases/failure_auth.spec.ts` —— 客户端立即停止并 raise secret-invalid 信号
- [ ] **B-4** 409 archive 幂等：重复请求不产生副作用
    - 证据: `tests/contract/cases/failure_conflict_409.spec.ts` —— 重复 archive 不增加计数
- [ ] **B-5** 任何失败路径日志含 `trace_id`、失败类别、阶段（contract）
    - 证据: fake server 每个响应都带 `x-trace-id`，客户端日志断言同时携带这三个字段

## C. 黑名单与硬性约束对照

- [ ] **C-1** 修复、Shell、可变 MCP、跨资源动作 全部不在 manifest 内
- [ ] **C-2** 审批桥接默认 `enabled=false`，且 CI 在启动期再校验
- [ ] **C-3** Paperclip 不持久化 OpsKeeper 审计账本副本（留待 Phase A 实施时核对）
- [ ] **C-4** 不使用任何 OpsKeeper admin 角色或 admin scope

## D. 回滚演练

- [ ] **D-1** 紧急吊销 `ok-approval`：Paperclip 进入只读视图，不可绕过权限继续触发审批
    - 证据: `tests/contract/cases/service_account_negative.spec.ts` 中"approval revoked → 403 + degrade"
- [ ] **D-2** 紧急吊销 `ok-readonly`：插件进入 NoLiveSync 模式，无静默重试

## E. 自动化命令汇总

```bash
# 黑名单 / 凭据静态校验
npm run lint:capabilities
npm run lint:secrets

# 契约 + 失败路径
npm run contract:fake &        # 启动 fake OpsKeeper（端口 4117）
SERVER_URL=http://127.0.0.1:4117 npm test -- tests/contract/cases

# 按失败类别跑
npm test -- --grep "5xx|timeout|401|403|409"
```

## F. 状态

- 当前: **draft**（首次发布，所有项目随实现一并追踪）
- 下一次复审: 由架构守护者在收到实现报告后做"权限模型 × 失败路径"复审；通过后 → `approved`
