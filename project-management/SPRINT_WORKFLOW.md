# Sprint Workflow

This workflow is mandatory for WeatherTech OS sprint execution. The repository is the source of truth for active sprint approval, completed work, and validation expectations.

## Authority Hierarchy

When instructions conflict, use this order of authority:

1. Explicit owner instruction.
2. [OWNER_APPROVAL.md](./OWNER_APPROVAL.md).
3. [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).
4. [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).
5. [NEXT_SPRINT.md](./NEXT_SPRINT.md).
6. [ROADMAP.md](../ROADMAP.md).
7. [README.md](../README.md).
8. General inference.

General inference must never override an owner decision or sprint document.

## Mandatory Lifecycle

A. Read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md).

B. Read [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

C. Verify approval status is `Approved`.

D. Verify the working tree is clean.

E. Verify local `HEAD` matches the intended remote branch.

F. Confirm the scope is narrow and unambiguous.

G. Implement only the approved scope.

H. Do not add unrelated improvements.

I. Run all applicable validation.

J. Fix only sprint-related failures.

K. Perform a final scope and diff audit.

L. Commit one focused sprint.

M. Push to the current remote branch.

N. Verify local `HEAD` equals the remote branch.

O. Verify the working tree is clean.

P. Record the sprint in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

Q. Update [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) to `Completed`.

R. Do not begin or promote the next sprint.

S. Stop and wait for owner approval.

## Pre-Development Approval Gate

Before modifying any product or application files, Codex must verify:

- [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) exists.
- Sprint status, recorded as approval status, is exactly `Approved`.
- Sprint name is present.
- Objective is present.
- Owner-approved scope is present and unambiguous.
- Explicit exclusions are present.
- Completion criteria are present.
- Validation plan is present.
- The working tree is clean.
- The current local branch is identified.
- Local `HEAD` matches the intended remote branch.
- There is no unresolved conflict with [NEXT_SPRINT.md](./NEXT_SPRINT.md), [ROADMAP.md](../ROADMAP.md), or [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

## Mandatory Stop Conditions

Codex must stop without modifying files when:

- Approval status is `Awaiting owner approval`.
- Approval status is `Awaiting owner direction`.
- Approval status is `Draft`.
- Approval status is `Blocked`.
- The approved scope is ambiguous.
- The repository is dirty before the sprint begins.
- Local and remote branches do not match.
- The requested work conflicts with completed work.
- Required owner decisions are missing.
- The next sprint cannot be identified without guessing.

## Preflight Commands

```bash
pwd
git branch --show-current
git fetch origin
git status --short
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

Stop before development if the branch is not `main`, local `HEAD` does not match the intended remote branch, the working tree is not clean, or Git reports an interrupted merge, rebase, cherry-pick, or bisect.

## Validation Commands

Run the commands that apply to the sprint:

```bash
npm run type-check
npm run lint
npm run build
git diff --check
```

When browser behavior is affected, run the relevant Codex browser regression shard from the signed-in in-app Browser session. Do not count a command that only prints runner instructions as a browser pass.

## Definition Of Done

A sprint is not complete until all applicable items are satisfied:

- Approved scope is fully implemented.
- Explicit exclusions remain untouched.
- No unrelated files or behavior are included.
- Build passes.
- Type-check passes.
- Lint passes.
- `git diff --check` passes.
- Relevant automated tests pass.
- Targeted browser regression passes.
- Direct browser validation is completed.
- Final diff audit confirms a coherent sprint.
- One focused conventional commit is created.
- Push succeeds.
- Local `HEAD` equals the remote branch.
- Working tree is clean.
- Completed sprint is recorded in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).
- [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) reflects completion.
- No additional sprint work has started.

## Scope Audit

Before committing, confirm:

- Only approved files changed.
- No `.env.local` changes.
- No secrets, tokens, or credentials were added.
- No package or lockfile changes unless explicitly approved.
- No migrations, schema changes, RLS changes, or destructive database changes unless explicitly approved.
- No API, provider, auth, or production integration activation unless explicitly approved.
- No unrelated product, UI, or test changes.

## Completion Record

After a sprint is pushed and local `HEAD` equals the remote branch:

1. Add the sprint to [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).
2. Include the commit hash, message, branch, remote, validation result, and concise notes.
3. Update [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) to `Completed`.
4. Do not start work from [NEXT_SPRINT.md](./NEXT_SPRINT.md) until the owner explicitly approves it.
