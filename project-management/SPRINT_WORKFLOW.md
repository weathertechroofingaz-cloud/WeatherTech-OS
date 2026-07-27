# Sprint Workflow

This workflow is mandatory for WeatherTech OS sprint execution. The repository is the source of truth for active sprint approval, completed work, and validation expectations.

## Mandatory Lifecycle

A. Read [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

B. Confirm the working tree is clean and local `HEAD` matches `origin/main`.

C. Do not start if the sprint is ambiguous, unapproved, or the repository is dirty.

D. Implement only the approved scope.

E. Do not rebuild completed modules or add unrelated improvements.

F. Run all applicable validation:

- Build.
- Type-check.
- Lint.
- `git diff --check`.
- Relevant automated tests.
- Targeted browser regression.
- Direct browser validation.

G. Fix only sprint-related failures.

H. Perform a final scope and diff audit.

I. Commit with one focused conventional commit.

J. Push to the current remote branch.

K. Verify local `HEAD` equals the remote branch.

L. Verify the working tree is clean.

M. Record the completed sprint in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

N. Do not automatically promote or begin [NEXT_SPRINT.md](./NEXT_SPRINT.md) without owner approval.

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

Stop before development if the branch is not `main`, local `HEAD` does not match `origin/main`, the working tree is not clean, or Git reports an interrupted merge, rebase, cherry-pick, or bisect.

## Validation Commands

Run the commands that apply to the sprint:

```bash
npm run type-check
npm run lint
npm run build
git diff --check
```

When browser behavior is affected, run the relevant Codex browser regression shard from the signed-in in-app Browser session. Do not count a command that only prints runner instructions as a browser pass.

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
3. Leave [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) in an owner-approved completed state or reset it to `Awaiting owner approval` only when the owner requests that update.
4. Do not start work from [NEXT_SPRINT.md](./NEXT_SPRINT.md) until the owner explicitly approves it.
