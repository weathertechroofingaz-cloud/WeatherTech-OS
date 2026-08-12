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

D. Verify the working tree is clean, except for exact owner-designated preserved paths whose starting hashes are recorded in [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

E. Verify local `HEAD` matches the intended remote branch.

F. Confirm the scope is narrow and unambiguous.

G. Implement only the approved scope.

H. Do not add unrelated improvements.

I. Run all applicable validation.

J. Fix only sprint-related failures.

K. Perform a final scope and diff audit.

L. Create one focused implementation commit.

M. Push to the current remote branch.

N. Verify local `HEAD` equals the remote branch.

O. Verify no unapproved changes exist and every owner-designated preserved path still matches its recorded starting hash.

P. Record the sprint in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

Q. Update [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) to `Completed`.

R. If steps P and Q changed governance files after the implementation commit, create and push one documentation-only closeout commit that records the immutable implementation commit hash.

S. Verify final local `HEAD` equals the remote branch and the working tree contains only unchanged owner-designated preserved paths, if any.

T. Do not begin or promote the next sprint.

U. Stop and wait for owner approval.

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
- The working tree is clean, except for exact owner-designated preserved paths listed with starting hashes in [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).
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
- The repository contains an unapproved working-tree change, or an owner-designated preserved path does not match its recorded starting hash.
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

Stop before development if the branch is not `main`, local `HEAD` does not match the intended remote branch, the working tree contains anything other than unchanged owner-designated preserved paths, or Git reports an interrupted merge, rebase, cherry-pick, or bisect.

For every preserved path, record a content hash before implementation and verify it again before staging and at sprint completion. A preserved-path exception never permits staging, committing, stashing, discarding, resetting, or rewriting that file.

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
- One focused conventional implementation commit is created.
- When the immutable implementation hash must be added to completion records afterward, no more than one documentation-only closeout commit is created.
- Push succeeds.
- Local `HEAD` equals the remote branch.
- Working tree contains no changes except owner-designated preserved paths that still match their recorded hashes.
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
- Every owner-designated preserved path remains hash-identical, unstaged, and excluded from all commits.

## Completion Record

After the implementation commit is pushed and local `HEAD` equals the remote branch:

1. Add the sprint to [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).
2. Include the immutable implementation commit hash, message, branch, remote, validation result, and concise notes.
3. Update [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) to `Completed`.
4. If steps 1-3 create changes, commit only those governance/documentation changes in one closeout commit and push it.
5. Verify final local `HEAD` equals the remote branch and only unchanged owner-designated preserved paths remain in the working tree.
6. Do not start work from [NEXT_SPRINT.md](./NEXT_SPRINT.md) until the owner explicitly approves it.
