# R26P6 Completion Confirmation Guidance

## Incident

The production “确认完成并推进” action looked like an enabled blue primary button,
but clicking it produced no visible response.

Production evidence showed:

- completion preview requests returned successfully;
- no `/complete` request was emitted by the affected click;
- the current task remained active and the workflow did not advance.

Safari accessibility inspection confirmed that the button was natively disabled
because “完成说明” was empty and the impact acknowledgement was unchecked. Those
fields were below the visible area of the scrollable drawer, while the disabled
button had no distinct disabled styling.

## Fix

- Keep the confirmation action clickable when the server preview allows completion.
- When “完成说明” is missing, show an explicit validation message and focus/scroll
  to the textarea.
- When the impact acknowledgement is missing, show an explicit validation message
  and focus/scroll to the checkbox.
- Add a persistent footer hint explaining the next required input.
- Reserve native disabled state for a pending request or a failed server completion
  gate.
- Add an obvious disabled visual style for all V2 buttons.
- Preserve all existing backend state-machine, permission, material, blocker,
  optimistic-lock and idempotency controls.

## Validation

```text
focused completion tests               PASS (13)
pnpm install                           PASS
pnpm lint                              PASS
pnpm typecheck                         PASS
pnpm test                              PASS (Web 135 / API 294)
pnpm --filter web build                PASS
pnpm --filter api build                PASS
pnpm --filter api prisma:validate      PASS
git diff --check                       PASS
production release verification       PASS
production acceptance                 PASS
```

Production Safari verification intentionally stopped before a real workflow write:

1. Opened the existing step-1 completion drawer.
2. Confirmed the footer explains that a completion reason is required.
3. Clicked “确认完成并推进” with the required fields empty.
4. Confirmed the drawer focused the completion-reason field and displayed
   “请填写完成说明。”
5. Confirmed no `/complete` request was sent and the project remained on step 1.

No seed, migration, task completion, workflow transition, or production business-data
change was performed by this verification.

## Result

```text
R26P6_COMPLETION_CONFIRMATION_GUIDANCE_DEPLOYED
SILENT_DISABLED_ACTION_REMOVED
MISSING_INPUT_FOCUSED_AND_EXPLAINED
NO_WORKFLOW_TRANSITION_DURING_VERIFICATION
```
