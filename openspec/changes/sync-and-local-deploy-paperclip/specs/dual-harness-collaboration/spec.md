# Delta Spec: dual-harness-collaboration

## ADDED Requirements

### Requirement: 协同使用 Pilot company 且与其他 company 隔离

协同流程**shall** 复用既有 "Paperclip Pilot" company（34b76735-88f1-4f48-9d1f-721b2d1eaeed，含 Codex Planner / Claude Executor / Codex Reviewer 等 agent），与其他 company（Fund Observatory、镜舟传媒）数据隔离：

- 协同 issue/task/comment/agent 配置只存在于 Pilot company。
- 其他 company 的运行（心跳、定时任务）不受协同配置影响。
- 历史停滞 issue（PAP-1xx）在试点前批量关闭归档，不混入新试点。

#### Scenario: 数据隔离

- **WHEN** 在 Pilot company 中创建试点 issue 并走完流转
- **THEN** 其他 company 的 issue 列表与运行状态不受任何影响

#### Scenario: 停滞 issue 清理

- **WHEN** 试点开始前
- **THEN** 处于 blocked/todo 停滞态的历史 PAP issue 已批量关闭或归档，Pilot 的活跃列表只剩新试点

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
