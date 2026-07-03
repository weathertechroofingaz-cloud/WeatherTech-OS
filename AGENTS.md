# WeatherTech OS Agent Instructions

WeatherTech OS is the command center for WeatherTech Roofing and IHC Painting. The owner does not want to hand-code features. Codex should handle implementation, testing, debugging, and pull request creation with minimal owner involvement.

## Autonomy

- Implement, test, debug, and prepare PRs proactively.
- Pause for the owner only when a task requires a business decision, secret or API key, billing decision, destructive database change, production deploy, or approval for customer-facing automation.
- If blocked, explain the exact blocker and the minimum owner action required.

## Security

- Do not commit `.env.local` or any secrets.
- Never expose Supabase `service_role` keys, Twilio auth tokens, GoHighLevel tokens, or private credentials.
- Server-only secrets must not use `NEXT_PUBLIC_`.
- Keep public browser variables limited to values that are safe to expose.

## Product Architecture

- Use Supabase as the database and source of truth.
- Use GoHighLevel as the automation and communications layer, not the core operating brain.
- Preserve the existing UI unless the task specifically asks for UI changes.
- Prefer small, focused PRs.

## Database And Automations

- Do not make destructive database or schema changes without explicit owner approval.
- Do not send real SMS, email, or customer messages without explicit owner approval.
- For migrations or data changes, keep the blast radius small and document the operational impact.

## Verification

- Run `npm run build` before marking work complete.
- If test, lint, or type-check scripts exist, run them too.
- If a verification command cannot run, explain why and list the residual risk.

## Completion Summary

When a task is complete, summarize:

- Changed files.
- Verification commands and results.
- Risks or follow-up concerns.
- The next recommended task.
