# Delta Spec: code-sync

## ADDED Requirements

### Requirement: 从 github 上游同步并推送镜像

同步操作（本地 git 操作序列）**shall**：

- 以 `upstream` remote（https://github.com/vincent-wuhan/paperclip.git）为唯一 fetch 同步源。
- 同步前对 embedded PG 数据执行备份（`pnpm db:backup`）。
- 同步前处理未提交改动：已修改文件若与上游冲突则 stash，否则 commit；未跟踪的本地运维目录单独 commit。
- 受控停止服务（`pnpm dev:stop`）后再执行 merge，不直接 kill 进程。
- 同步后更新本地 `master` 指针（fast-forward 到 upstream/master）并推送工作分支到 `gitcode` 镜像（https://gitcode.com/glorius/paperclip.git）。

#### Scenario: 单 commit 同步全流程

- **WHEN** 工作分支落后 upstream/master 1 个仅涉及 skill 文档的 commit
- **THEN** 备份 → 处理改动 → 停服务 → fetch/merge → master 指针更新 → 重启 → `pnpm typecheck` 通过
- **AND** UI 冒烟确认既有 3 个 company 数据完好

#### Scenario: merge 冲突中止恢复

- **WHEN** merge upstream/master 产生冲突
- **THEN** 执行 `git merge --abort` 回到同步前状态，服务可重启，数据无损
