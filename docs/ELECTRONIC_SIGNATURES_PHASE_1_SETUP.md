# Electronic Signatures Phase 1 Setup

This document records both the WeatherTech OS electronic-signature integration foundation for DocuSign and Dropbox Sign and the independently implemented native electronic-signature workflow. The external-provider foundation remains readiness-only: it does not connect to either provider, send provider signature requests, upload documents to providers, download provider-signed files, or store live OAuth tokens. Native signing does not activate either provider or customer-facing portal authentication.

## Native Electronic-Signature Operational Completion

Proposal-to-Sold Job Operational Completion Phase 1 provides:

- owner-only finalization of an approved estimate into an immutable customer-safe proposal revision and deterministic PDF
- owner-controlled preparation and delivery of an exact native signing request
- a one-time raw signing token whose persisted evidence is digest-bound, followed by scoped secure-session and CSRF protections
- exact-revision review, acceptance or decline, immutable signature and acceptance evidence, signed-document registration, and receipt recovery
- secure renewal of a terminal read-only signed session so the intended signer can reopen the exact receipt after the original active session expires
- owner-only deposit-invoice creation, exact posted-deposit enforcement when required, and company-scoped sold-job conversion
- source-drift, replay, cross-company, stale-session, duplicate-delivery, evidence-mutation, and direct-write fail-closed controls

Verified release evidence:

- Implementation commit: `b694ad844af48fb23d1849f3180382a016056441`
- Merge and Production implementation deployment commit: `7186001eec28177a32b454168e5fd05b43af9937`
- Production migration: `20260824044610_native_proposal_esign_sold_job_gate.sql`
- Migration SHA-256: `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`
- Final local, regression, and Production migration state: `51/51`
- Targeted Browser run `20260824223608414` passed the deposit and no-deposit paths, signed-session renewal, exact receipt recovery, zero console findings, and zero residue.
- Complete isolated Browser run `20260824231426642` passed `24/24` groups and `31/31` assertions with zero console errors, zero console warnings, bounded cleanup, and zero residue.
- No proposal/signature request was sent to a real customer, and no real acceptance, deposit, payment, invoice, or sold job was created for validation.

Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.

## Official Capability Boundary

### DocuSign

- DocuSign eSignature integrations require OAuth before WeatherTech OS can access account or envelope APIs.
- DocuSign envelopes are the core signing container and can include documents, recipients, and tabs.
- Envelope status can be retrieved after authorization so WeatherTech OS can map provider events into local signature status.
- Envelope documents can be listed and downloaded after authorization.
- DocuSign Connect provides webhook-style event notifications for eSignature workflows.

Official references:

- [DocuSign authentication overview](https://developers.docusign.com/platform/auth/)
- [DocuSign create envelope](https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/create/)
- [DocuSign get envelope status](https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/get/)
- [DocuSign envelope documents](https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/documents/)
- [DocuSign Connect webhooks](https://developers.docusign.com/platform/webhooks/connect/)

### Dropbox Sign

- Dropbox Sign supports API apps, OAuth, and signature request endpoints.
- Signature request endpoints support get, list, file download, send, template, reminder, update, and cancel flows.
- Test mode can exercise most endpoints, but test-mode signature requests are not legally binding and still appear in Dropbox Sign accounts.
- Production signature requests require the appropriate Dropbox Sign API plan.
- Events and callbacks can report signature request lifecycle activity and must be verified before WeatherTech OS trusts the event.

Official references:

- [Dropbox Sign API overview](https://developers.hellosign.com/docs/overview)
- [Dropbox Sign OAuth overview](https://developers.hellosign.com/docs/guides/o-auth/overview)
- [Dropbox Sign signature request API](https://developers.hellosign.com/api/signature-request/get)
- [Dropbox Sign download files API](https://developers.hellosign.com/api/signature-request/files)
- [Dropbox Sign events and callbacks](https://developers.hellosign.com/docs/guides/events-and-callbacks/overview)

## Supported WeatherTech OS Foundation

- Provider keys:
  - `docusign`
  - `dropbox_sign`
- UI locations:
  - Integration Center provider cards
  - Integration Center electronic signatures foundation panel
  - Communications provider readiness
  - Customer 360 document/signature activity wording
- Company mapping:
  - WeatherTech Roofing LLC
  - IHC
- Prepared architecture:
  - provider abstraction
  - OAuth readiness
  - envelope/signature request draft mapping
  - signed-document status tracking language
  - Customer 360 event labels
  - integration audit-log provider support
  - retry planning helper
  - production write gate
  - live signature request gate

## Required Environment Variables

All values are server-only and must not be prefixed with `NEXT_PUBLIC_`.

```bash
DOCUSIGN_CLIENT_ID=
DOCUSIGN_CLIENT_SECRET=
DOCUSIGN_REDIRECT_URI=
DOCUSIGN_BASE_URI=https://demo.docusign.net/restapi
DOCUSIGN_AUTH_BASE_URI=https://account-d.docusign.com
DOCUSIGN_WEBHOOK_HMAC_KEY=
DOCUSIGN_SIGNATURE_REQUESTS_ENABLED=false
DOCUSIGN_PROVIDER_WRITES_ENABLED=false
DOCUSIGN_ACCOUNT_ID_WEATHERTECH=
DOCUSIGN_ACCOUNT_ID_IHC=

DROPBOX_SIGN_CLIENT_ID=
DROPBOX_SIGN_CLIENT_SECRET=
DROPBOX_SIGN_REDIRECT_URI=
DROPBOX_SIGN_WEBHOOK_SECRET=
DROPBOX_SIGN_SIGNATURE_REQUESTS_ENABLED=false
DROPBOX_SIGN_PROVIDER_WRITES_ENABLED=false
DROPBOX_SIGN_TEST_MODE=true
DROPBOX_SIGN_ACCOUNT_ID_WEATHERTECH=
DROPBOX_SIGN_ACCOUNT_ID_IHC=
```

## Database Changes

`supabase/migrations/0031_electronic_signatures_foundation.sql` only extends existing `integration_connections` and `integration_sync_logs` provider check constraints so future provider records can reference `docusign` and `dropbox_sign`.

The migration is:

- additive
- transactionally wrapped
- non-destructive
- not an RLS change
- not a grant change
- not a provider activation

The existing `signatures.provider` check already supports `native`, `docusign`, and `dropbox_sign` from the Document Storage & Signature Workflow foundation.

`supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql` is the approved additive native-signing and sold-job-gate migration. It adds private signing-request, session, receipt, and guard tables; immutable evidence links; guarded native-signing lifecycle functions; deposit-invoice enforcement; and exact sold-job conversion. It does not backfill or mutate existing proposal, document, payment, signature, invoice, job, or Storage records. Its verified SHA-256 is `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`; local, regression, and Production ledgers match at `51/51`.

## Owner Setup Still Required

1. Complete the legal-review gate above before the first real customer native electronic-signature delivery.
2. Keep native delivery owner-controlled and do not treat this release as customer portal activation.
3. Create or select an approved DocuSign developer app only in a separately approved provider-activation sprint.
4. Create or select an approved Dropbox Sign API app only in a separately approved provider-activation sprint.
5. Configure OAuth redirects, company account mappings, webhook validation, sandbox mappings, retries, and signed-document handling before either external provider is activated.
6. Complete a future owner-approved activation sprint before external-provider signature requests, document uploads, provider writes, or customer-facing provider sends are enabled.

## Explicitly Not Implemented

- No live DocuSign envelope creation.
- No live Dropbox Sign `signature_request/send`.
- No document upload to either provider.
- No signed-document download from either provider.
- No provider webhook route.
- No OAuth token exchange route.
- No customer-facing provider send.
- No customer-facing portal authentication or customer portal activation.
- No automatic native-signature delivery; the implemented native path requires an authorized owner action.
- No real customer signature delivery, acceptance, deposit, payment, invoice, or sold job was created for release validation.
- No provider status is shown as connected unless a real saved connection record exists.
