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
