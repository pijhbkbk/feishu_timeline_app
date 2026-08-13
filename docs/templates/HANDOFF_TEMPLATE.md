# Task Handoff v2

> 只有 Task Contract 设置 `HANDOFF_REQUIRED=true` 时才创建或更新本文件。
> `READ_ONLY` 与 `SECURITY_REVIEW` 默认不写 handoff；其最终审查输出即可作为本次交付。

## Identity

- Task ID:
- Repository:
- Worktree:
- Branch:
- Baseline commit:
- HEAD / working-tree identity:
- Git status:
- Change class:

## Authorization snapshot

- Stage allowed:
- Commit allowed:
- Push allowed:
- Main merge allowed:
- Tag allowed:
- Deployment allowed:
- Staging access allowed:
- Production access allowed:

## Objective and scope

- Objective:
- Allowed files:
- Forbidden files:
- Finding IDs / root-cause cluster:
- Security invariants:

## Completed

- Changes:
- Decisions:
- Gates executed:
- Evidence identity:

## Not completed

- Blockers:
- Proof gaps:
- New findings recorded but not handled:
- High-cost Gates deliberately not run:

## Frozen decisions / do not regress

- ...

## Exact next step

- One next task only.

## Stop state

```text
HANDOFF_READY=<PASS|FAIL>
SOURCE_CHANGE=<YES|NO>
STAGE_EXECUTED=<YES|NO>
COMMIT_CREATED=<YES|NO>
PUSH_EXECUTED=<YES|NO>
MAIN_MERGED=<YES|NO>
TAG_CHANGED=<YES|NO>
DEPLOYMENT=<NOT_AUTHORIZED|NOT_EXECUTED|...>
STOP
```
