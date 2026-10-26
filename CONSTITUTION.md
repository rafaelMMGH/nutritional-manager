# Constitution

Non-negotiable principles for this project. verifier-spec checks specs and plans against them, and reviewer checks code against them. Violations are blocking.

Changing a principle requires a PR reviewed by the team. Keep this list short (5–10 principles); each needs a rule and a reason.

**Version:** 1.0 · **Last amended:** 2026-10-23

## Principles

These are starting examples. Edit, remove, or replace them to fit your team.

1. **Tests prove behavior.** No behavior change ships without a test that fails before and passes after (today that means a Playwright e2e test in `tests/e2e/`).
   *Why:* tests are how reviewers and agents verify intent.

2. **Specs are the source of truth.** Code that diverges from an approved spec is a bug in one of them; fix the spec through the spec-change route or fix the code.
   *Why:* keeps specs trustworthy for the whole team.

3. **No speculative abstraction.** Introduce a new abstraction only when there are at least two real uses.
   *Why:* premature abstraction is harder to change than duplication.

4. **Justify every dependency.** A new dependency needs a written reason in the plan and the user's explicit yes.
   *Why:* every dependency is long-term maintenance and security risk.

5. **No secrets in code.** Credentials and keys come from the environment or a secret manager, never from the repository.
   *Why:* leaked secrets are costly and hard to undo.

6. **Errors are handled explicitly.** No silently swallowed errors; failures are logged or surfaced with context.
   *Why:* silent failures are the hardest bugs to find.

7. **Small, focused changes.** One concern per commit; no unrelated changes mixed in.
   *Why:* reviewers can only trust what they can read.

## Amendments

| Version | Date | Change | Approved in |
|---|---|---|---|
| 1.0 | 2026-10-23 | Initial principles (examples, to be agreed by the team) | PR #___ |
