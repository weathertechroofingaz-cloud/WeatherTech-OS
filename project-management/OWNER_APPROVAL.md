# Owner Approval Contract

This contract defines who may approve WeatherTech OS sprint work and when Codex may begin implementation.

## Authority

- Only the project owner may approve a sprint.
- Codex must never independently choose the next sprint.
- Codex must never automatically promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).
- Codex must never begin development when a sprint is unapproved, ambiguous, incomplete, or conflicting.
- Codex must never expand the approved sprint scope without owner approval.
- Codex must never combine multiple sprints into one commit unless the owner explicitly approves that structure.
- Codex must never rebuild completed modules unless the owner explicitly approves a rework sprint.
- Codex must not discard, overwrite, stash, reset, or reconstruct existing work without owner approval.

## Pre-Development Approval Gate

Before modifying any product or application files, Codex must verify all of the following:

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

If any approval-gate item fails, Codex must stop before modifying files and report the exact missing or conflicting condition.

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

## Waiting State

When no sprint is approved, the repository remains in a waiting state. Codex may inspect, audit, and report, but must not begin product development until the owner explicitly approves the current sprint.
