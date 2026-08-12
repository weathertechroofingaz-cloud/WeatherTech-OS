# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved

## Sprint Name

WeatherTech Roofing Website — Homepage Foundation & Visual System

## Objective

Build the first production-quality homepage foundation for the WeatherTech Roofing LLC public website using the owner-approved design direction in GitHub Issue #11: premium large-format presentation, strong Arizona roofing photography, immediate lead capture, WeatherTech purple/orange branding, and a tasteful Phoenix identity.

## Owner

Joe Harris

## Owner Approval Date

2026-08-12

## Verified Starting State

- Repository: `weathertechroofingaz-cloud/WeatherTech-OS`.
- Implementation branch: `website-homepage-sprint`.
- Starting `origin/main`: `cb4b45473b25b5a0927e1b7c3b5350a9b092669f`.
- Owner approved this sprint explicitly in ChatGPT on 2026-08-12.
- The existing local checkout cannot be inspected through the GitHub connector, so this sprint is isolated on a new remote branch created from the verified `origin/main` commit. No direct edits to `main` are authorized during implementation.
- The previously documented local Property Intelligence working-tree exceptions and `.env.local` must not be touched by this remote branch workflow.

## Owner-Approved Scope

- Inspect the existing public-web/app structure and reuse established architecture where practical.
- Build the WeatherTech Roofing LLC homepage foundation and visual system only.
- Create a premium, responsive hero using the working headline **A Better Roof Starts With WeatherTech.**
- Put a concise free-roof-inspection lead form in the first screen with an obvious phone/contact path.
- Add a trust/credibility area using only verified or clearly placeholder-safe content; do not invent ratings, review counts, license numbers, awards, warranties, or financing terms.
- Add an Arizona-specific roofing expertise section.
- Present the seven owner-approved core services: Roof Replacement, Roof Repair, Foam Roofing, Roof Coating, Roof Maintenance, Storm Damage, and Commercial Roofing.
- Add a Phoenix brand moment using **Built to Endure. Ready to Rise.** with restrained visual treatment.
- Add homepage foundations for project portfolio, financing, reviews/social proof, the four-step WeatherTech process, and final conversion CTA.
- Preserve WeatherTech purple/orange identity while keeping photography and whitespace premium and uncluttered.
- Ensure desktop and mobile responsiveness, accessible semantic structure, keyboard usability, readable contrast, and sensible reduced-motion behavior where animation exists.
- Keep implementation original; do not copy reference-site source code, proprietary imagery, or branding.
- Add or update targeted automated coverage where practical for the homepage structure and critical interactions.

## Explicit Exclusions

- No production deployment or merge to `main` without owner review/approval.
- No Supabase schema or migration changes.
- No RLS or authentication changes.
- No provider activation or production integration changes.
- No live financing rates, payment examples, lender claims, or financing-provider activation.
- No fabricated testimonials, review counts, credentials, awards, license information, or superiority claims.
- No broad WeatherTech OS UI redesign.
- No IHC website work in this sprint.
- No customer-portal expansion.
- No `.env.local` changes.
- Do not modify the preserved Property Intelligence files.
- Do not rebuild AI Command Center, Stripe, Yelp, CompanyCam, Twilio, QuickBooks, or unrelated modules.

## Completion Criteria

- Homepage implements the approved visual/content structure at a production-quality foundation level.
- All seven services are visible and correctly named.
- Hero lead capture is immediately visible on desktop and appropriately prioritized on mobile.
- Phoenix/purple/orange branding is recognizable without overwhelming the professional photographic presentation.
- No unverified business claims are published as facts.
- Existing unrelated WeatherTech OS behavior is not intentionally changed.
- Relevant automated validation passes.
- Final diff is audited for sprint scope.
- Work remains on the isolated sprint branch pending owner review; no production deployment occurs in this sprint without separate approval.

## Validation Plan

- Type-check.
- Lint.
- Build where the available execution environment permits it without touching production data.
- `git diff --check` or equivalent patch review.
- Relevant automated tests.
- Targeted browser/visual validation where the available execution environment permits it.
- Responsive review for desktop and mobile breakpoints.
- Accessibility-oriented review of headings, labels, form controls, focus behavior, contrast, and reduced motion.
- Final scope/diff audit before presenting for owner review.

## Planned Commit Message

`feat: build WeatherTech Roofing homepage foundation`

## Mandatory Stop Conditions

Stop before any destructive, production, schema, RLS, provider-activation, credential, or unrelated-system change. Stop if implementation requires owner-only business facts or credentials that cannot safely remain placeholders.