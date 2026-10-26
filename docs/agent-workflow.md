# Spec-driven agent setup

An orchestrator-led, spec-driven workflow for Claude Code. Copy these files into the root of your project and commit them so every teammate gets the same setup.

## What's included

```
CLAUDE.md                     Project context + "Always ask" list
CONSTITUTION.md               Non-negotiable principles (edit the examples)
docs/agent-workflow.md        This file
.claude/settings.json         Starts every session as the orchestrator
.claude/agents/
  orchestrator.md             Routes requests, runs flows and gates (Opus)
  spec-writer.md              Writes the what and why (Opus)
  verifier-spec.md            verify / checklist / analyze modes (Sonnet)
  planner.md                  Writes plan.md and tasks.md (Opus)
  code-writer.md              Implements tasks with tests (Sonnet)
  reviewer.md                 Runs tests, checks per requirement, PASS/FAIL (Opus)
  investigator.md             Diagnose and drift checks, read-only (Haiku)
.claude/skills/grilling/      Clarify step used by the orchestrator
specs/_templates/             spec, plan, tasks, bug, refactor, checklist
```

## Setup (done for this project)

1. Agents, settings, the `grilling` skill (from https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) and `specs/_templates/` are installed.
2. `CLAUDE.md` keeps its existing project context; the "Principles", "Always ask" and "Spec-driven workflow" sections were appended.
3. **To do:** edit `CONSTITUTION.md` so it holds 5–10 principles the team agrees on.
4. **To do:** `.gitignore` ignores `.claude/`, so agents and settings are local only until that is changed.
5. Prerequisites: Git, and the GitHub CLI (`gh`) for PR reviews and design PRs.
6. Start Claude Code in the project. You should be talking to the orchestrator; `/agents` lists all seven.

## Verify on your version

These rely on Claude Code features that change over time. Check them against the official docs if something doesn't work:

- The `agent` setting in `.claude/settings.json` (or start with `claude --agent orchestrator`)
- The `Agent(name, ...)` syntax in the orchestrator's `tools:` line, which limits the subagents it may spawn. If it isn't supported, replace it with `Agent`
- Worktree isolation for parallel `[P]` tasks

## Daily use

Just describe what you want. The orchestrator states the route it picked, then runs it. Feature flow:

scout → size triage (small/large) → grilling → spec ⇄ verify (+ checklists) → **approve spec** → plan → analyze → **approve plan** → optional design PR → branch → story by story (split into sub-batches of ~300 lines): implement ⇄ review, commit, checkpoint → **final check** → optional PR draft

Speed rules:

- Small features (about one module or mostly styling, no data-model/API change) get one verify round, one analyze, at most ~15 tasks, and may combine stories into one implement/review cycle.
- Keep review batches small: split by CSS/feature area or ~300 changed lines; fold minor findings into the next batch and reserve extra rounds for blocking issues.
- Iterate on affected spec files only; one full e2e run per batch (code-writer) and one per review round (reviewer). Never run e2e runs in parallel or leave background processes.
- Every new or changed test must be shown red by temporarily breaking the code it protects; the reviewer checks for vacuous tests.
- Don't resume agents whose work is committed; start fresh ones.
