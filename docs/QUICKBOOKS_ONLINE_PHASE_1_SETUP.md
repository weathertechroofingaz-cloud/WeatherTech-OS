# QuickBooks Online Phase 1 Setup

This document records the WeatherTech OS QuickBooks Online accounting integration foundation. It is intentionally readiness-only: it does not connect to Intuit, sync accounting data, create QuickBooks records, process payments, or store live OAuth tokens.

## Official Capability Boundary

- QuickBooks Online apps use Intuit OAuth 2.0. WeatherTech OS must request user consent, exchange an authorization code server-side, and associate tokens with the connected QuickBooks company `realmId`.
- The current foundation uses the QuickBooks Online Accounting scope: `com.intuit.quickbooks.accounting`.
- QuickBooks Online Accounting API documentation identifies REST/JSON and GraphQL development surfaces, API Explorer support, sandbox testing, data queries, batch operations, minor versions, subscription status, and webhook support.
- Accounting entities include customer, estimate, invoice, and payment-style transaction resources. WeatherTech OS only prepares duplicate-safe mappings for those entities in this sprint.
- QuickBooks Online webhooks can notify connected apps about entity changes for OAuth-authorized QuickBooks Online companies. A future live implementation must verify webhook authenticity and reconcile missed events with Change Data Capture.
- QuickBooks Payments is a separate scope/API surface. Payment processing is not activated by this sprint.

Official references:

- [QuickBooks Online develop docs](https://developer.intuit.com/app/developer/qbo/docs/develop)
- [Intuit OAuth 2.0 setup](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [QuickBooks Online scopes](https://developer.intuit.com/app/developer/qbo/docs/learn/scopes)
- [QuickBooks Online API overview](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api)
- [QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [QuickBooks Online webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices)
- [QuickBooks Online field definitions](https://developer.intuit.com/app/developer/qbo/docs/learn/learn-basic-field-definitions)

## Supported WeatherTech OS Foundation

- Provider key: `quickbooks_online`
- UI location: Integration Center, Communications readiness, Customer 360 activity language, and Financial workspace readiness language.
- Company mapping:
  - WeatherTech Roofing LLC
  - IHC
- Prepared mappings:
  - Customer export draft
  - Estimate export draft
  - Invoice export draft
  - Payment export draft
- Safety architecture:
  - deterministic duplicate keys
  - deterministic request fingerprints
  - QuickBooks-safe document reference numbers for future estimate, invoice, and payment exports
  - production write gate
  - live sync gate
  - payment-processing gate
  - integration audit-log provider support
  - future webhook verifier token placeholder

## Required Environment Variables

All values are server-only and must not be prefixed with `NEXT_PUBLIC_`.

```bash
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=
QUICKBOOKS_ENVIRONMENT=sandbox
QUICKBOOKS_SYNC_ENABLED=false
QUICKBOOKS_ACCOUNTING_WRITES_ENABLED=false
QUICKBOOKS_PAYMENT_PROCESSING_ENABLED=false
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=
QUICKBOOKS_REALM_ID_WEATHERTECH=
QUICKBOOKS_REALM_ID_IHC=
QUICKBOOKS_ENVIRONMENT_WEATHERTECH=sandbox
QUICKBOOKS_ENVIRONMENT_IHC=sandbox
QUICKBOOKS_INCOME_ACCOUNT_ID_WEATHERTECH=
QUICKBOOKS_INCOME_ACCOUNT_ID_IHC=
QUICKBOOKS_DEPOSIT_ACCOUNT_ID_WEATHERTECH=
QUICKBOOKS_DEPOSIT_ACCOUNT_ID_IHC=
```

## Owner Setup Still Required

1. Create or select the approved Intuit Developer app.
2. Configure the OAuth redirect URI for WeatherTech OS.
3. Authorize the WeatherTech Roofing LLC QuickBooks Online company and record its `realmId` server-side.
4. Authorize the IHC QuickBooks Online company and record its `realmId` server-side.
5. Map WeatherTech OS line items to owner-approved QuickBooks income accounts.
6. Map payment/deposit behavior to owner-approved QuickBooks deposit accounts.
7. Configure and verify the QuickBooks webhook verifier token.
8. Validate customer, estimate, invoice, and payment mappings in sandbox.
9. Validate idempotency and duplicate-prevention behavior before any production write.
10. Complete a future owner-approved activation sprint before turning on live sync or accounting writes.

## Disabled Until Future Approval

- Live QuickBooks Online synchronization.
- Creating customers in QuickBooks.
- Creating estimates in QuickBooks.
- Creating invoices in QuickBooks.
- Recording payments in QuickBooks.
- Payment processing through QuickBooks Payments.
- Webhook ingestion from live Intuit traffic.
- Any production accounting mutation.

## Migration Note

`supabase/migrations/0030_quickbooks_online_foundation.sql` only extends existing integration provider check constraints so `integration_connections` and `integration_sync_logs` can safely reference `quickbooks_online`. It is transactionally wrapped and does not delete data, change RLS, grant broad access, or modify existing records.
