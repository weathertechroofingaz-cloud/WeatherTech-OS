# Electronic Signatures Phase 1 Setup

This document records the WeatherTech OS electronic signature integration foundation for DocuSign and Dropbox Sign. It is intentionally readiness-only: it does not connect to either provider, send live signature requests, upload documents to providers, download signed files, or store live OAuth tokens.

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

## Database Change

`supabase/migrations/0031_electronic_signatures_foundation.sql` only extends existing `integration_connections` and `integration_sync_logs` provider check constraints so future provider records can reference `docusign` and `dropbox_sign`.

The migration is:

- additive
- transactionally wrapped
- non-destructive
- not an RLS change
- not a grant change
- not a provider activation

The existing `signatures.provider` check already supports `native`, `docusign`, and `dropbox_sign` from the Document Storage & Signature Workflow foundation.

## Owner Setup Still Required

1. Create or select the approved DocuSign developer app.
2. Create or select the approved Dropbox Sign API app.
3. Configure OAuth redirect URIs for WeatherTech OS.
4. Map WeatherTech Roofing LLC and IHC provider account IDs server-side.
5. Configure DocuSign Connect webhook validation.
6. Configure Dropbox Sign account or app callback validation.
7. Validate envelope/request mapping in sandbox or test mode.
8. Validate status callbacks, duplicate keys, retries, and signed-document download.
9. Complete a future owner-approved activation sprint before live signature requests, document uploads, provider writes, or customer-facing provider sends are enabled.

## Explicitly Not Implemented

- No live DocuSign envelope creation.
- No live Dropbox Sign `signature_request/send`.
- No document upload to either provider.
- No signed-document download from either provider.
- No provider webhook route.
- No OAuth token exchange route.
- No customer-facing provider send.
- No provider status is shown as connected unless a real saved connection record exists.
