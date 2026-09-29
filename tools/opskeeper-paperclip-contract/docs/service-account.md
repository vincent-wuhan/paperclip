# OpsKeeper Scoped Service Account（ADR-2 落地稿）

> 阶段: 契约基线
> 锚定自: [`baseline.lock`](../baseline.lock) → `service_account`
> 源设计: ADR-2

## 1. 目标与硬性约束

- **目标**：为 OpsKeeper×Paperclip 连接器建立最小权限的双 token scoped service account
- **硬性约束**：
  - 禁止复用管理员凭据
  - 凭据注入与轮换方案需明确、可审计
  - 权限最小化要可证伪

## 2. 命名规范

格式：`ok-<env>-<scope>-<short-hash>`

| 段 | 允许 | 示例 |
|---|---|---|
| `<env>` | `dev` / `staging` / `prod` | `prod` |
| `<scope>` | `readonly` / `approval` | `readonly` |
| `<short-hash>` | 8 hex 字符，伪随机 | `a1b2c3d4` |

**禁止命名**：`admin-*`、`root-*`、`shared-*`、`super-*`。

## 3. 权限矩阵

| Scope | Endpoint 族 | 可写 | 不可写 |
|---|---|---|---|
| `ok-readonly` | `GET /api/v1/incidents`、`GET /api/v1/incidents/:id`、`GET /api/v1/incidents/:id/timeline`、`GET /api/v1/incidents/:id/evidence` | – | – |
| `ok-approval` | `POST /api/v1/approvals`、`GET /api/v1/approvals/:id` | 仅审批工作流 | 任何执行/修复端点 |

### 3.1 双 token 隔离（操作守则）

- `ok-readonly` 与 `ok-approval` 分两个 secret，禁止同名混用
- 凭据**不得**互相读写；审批 token 不能用来拉只读列表
- `ok-approval` 调用必须再做一次"白名单 incident"二次确认

### 3.2 黑名单（永远禁止签发）

- `ok-admin-*`、`ok-write-*`、`ok-exec-*`
- OpsKeeper 自带管理员角色（任何 `OrgRole=admin` / `ProjectRole=admin`）

CI 静态校验见 `tests/contract/scripts/lint-secrets.sh`，对应 `npm run lint:secrets`。

## 4. 注入通道

| 通道 | 用途 | 是否允许 |
|---|---|---|
| Paperclip plugin secret store | 运行时读取 | ✅ |
| 环境变量（CI 临时） | 仅测试夹具 | ⚠️ 仅在 `tests/contract/*` 下使用 mock |
| manifest 字段 | – | ❌ |
| 仓库文件（`.env`、配置明文） | – | ❌ |
| UI / 客户端 bundle | – | ❌ |

注入器（如 `secrets-injector`）规则：
- 同一个 secret 名字 **不允许** 既可作 admin 也可作 scoped
- 注入失败应立即使插件拒启动

## 5. 凭据轮换

| 项 | `ok-readonly` | `ok-approval` |
|---|---|---|
| TTL | 30 天 | 7 天 |
| 轮换 SLA | 到期前 24h 自动续签 | 到期前 4h 自动续签 |
| 双写期 | 24h 灰度（旧+新均可读/审，新仅签名） | 4h 灰度 |
| 旧 token 失效 | 双写期结束 + 即时吊销 + 留 30 天审计查询权限 | 同左 |
| 紧急吊销 | 运维触发 → Paperclip 进入只读降级 | 同左 |

每次轮换需写入 OpsKeeper audit log，包含：
- `secret_id`、`new_version`、`old_version`、`trace_id`
- 与 Paperclip 侧 `secret_version` 配对：任一侧缺失或不一致 → 插件拒启动

## 6. 反模式（明确禁止）

- ❌ 把 admin token 注入任何环境
- ❌ 把 token 写进 manifest / 仓库 / `.env` / 日志明文
- ❌ 把审批 token 用于只读探测（信息泄漏）
- ❌ 复用同一个 token 给多个插件
- ❌ 把 token 通过 CLI 参数传递（出现在 `ps`）

## 7. 自动化校验

| 命令 | 校验内容 |
|---|---|
| `npm run lint:secrets` | 扫描 `manifest.json`、仓库、git diff，禁止 `admin-`/`sk-`/`Bearer ` 等敏感模式；不区分大小写 |
| `tests/contract/cases/service_account_negative.spec.ts` | 在 fake OpsKeeper 上跑：换 `ok-admin-*` 凭据应被 403 / 拒签发；换错 scope 应被 403 |

## 8. 回滚

- 紧急吊销 `ok-approval`：Paperclip 进入只读视图，**禁止**绕过权限继续触发审批
- 紧急吊销 `ok-readonly`：插件进入"NoLiveSync"模式，仅保留已经缓存的事件 + 显式 UI 提示
