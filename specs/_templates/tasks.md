# Tasks: <Feature name>

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Format: `- [ ] T### [P] [US#] Description (path/to/file)`
`[P]` = can run in parallel with other `[P]` tasks in the same phase (touches different files).

## Phase 1: Setup

- [ ] T001 ...

## Phase 2: Foundational (blocks all stories)

- [ ] T002 ...

## Phase 3: US1 (P1) <title>

- [ ] T003 [US1] Write tests for REQ-1 (path/to/test)
- [ ] T004 [US1] Implement REQ-1 (path/to/file)
- [ ] T005 [P] [US1] ...

**Checkpoint:** US1 complete. Review, then continue, ship, or stop.

## Phase 4: US2 (P2) <title>

- [ ] T006 [US2] ...

**Checkpoint:** US2 complete.
