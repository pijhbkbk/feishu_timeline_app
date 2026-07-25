# R26P7 Completion Next-Task Navigation

Date: 2026-07-25

## Reported symptom

After completing step 2, “新颜色开发报告”, the workspace still looked like it
was on step 2. The user therefore opened “完成工序” again before seeing step 3.

## Read-only production evidence

Production access logs contain two completion-preview requests for step 2 but
exactly one successful `POST /complete` request.

The production PostgreSQL read-only audit found:

- one completed step-1 task;
- one completed step-2 task;
- one active step-3 task;
- no duplicate workflow task for any of those steps;
- workflow `currentNodeCode=PAINT_DEVELOPMENT`;
- exactly two completion commands for this project in total, one for step 1 and
  one for step 2.

No workflow action was triggered while collecting this evidence.

## Root cause

The completion response refreshed the workspace ViewModel but left the selected
node and URL on the completed task. The backend had already advanced correctly,
but closing the success drawer revealed the old selection.

## Fix

- Select the primary task returned by the completion command immediately after
  a successful response.
- Replace the workspace URL with the returned next-task `taskId`.
- Keep the success drawer visible so the completion result is not hidden.
- State explicitly that the page has entered the next step.
- Change the success action to `进入下一步：<工序名称>`.
- Keep server response `isPrimary` as the sole source for choosing the mainline
  task; the frontend does not calculate workflow topology.

## Safety

- No backend state-machine rule changed.
- No database write or migration was introduced.
- No V1 behavior changed.
- Existing idempotency and optimistic-lock behavior remains unchanged.
