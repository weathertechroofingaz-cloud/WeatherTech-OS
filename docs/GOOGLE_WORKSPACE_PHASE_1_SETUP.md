# Google Workspace / Gmail Production Activation

WeatherTech OS uses one server-side Google OAuth integration for Gmail. Supabase remains the source of truth for customer records, drafts, approvals, delivery results, and related estimate or proposal status. Nothing in this runbook authorizes automatic email delivery.

Do not commit Google client secrets, OAuth codes, access tokens, refresh tokens, mailbox exports, or private customer email content. Do not paste credentials into Codex chat. Production values belong only in the active server environment or the future hosting provider's secret manager.

## Activation boundary

Codex can validate repository behavior without Google credentials. The owner must personally complete Google Cloud setup, enter secrets, authorize each mailbox, enable the send gate for a controlled test, approve that test, and later approve production deployment.

Keep `GOOGLE_GMAIL_SEND_ENABLED=false` until the owner explicitly authorizes one internal test. No customer email may be used for activation testing.

## Exact server environment

Local activation expects:

```dotenv
GOOGLE_CLIENT_ID=<enter privately>
GOOGLE_CLIENT_SECRET=<enter privately>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google-workspace/oauth/callback
GOOGLE_PUBLIC_BASE_URL=http://localhost:3000
GOOGLE_TOKEN_ENCRYPTION_KEY=<generate privately>
GOOGLE_WORKSPACE_DOMAIN=<managed-workspace-domain-or-blank>
GOOGLE_GMAIL_SEND_ENABLED=false
```

`SUPABASE_SERVICE_ROLE_KEY` is also required server-side and must never use a `NEXT_PUBLIC_` prefix.

After deployment, use this exact redirect pattern, substituting the final HTTPS host:

```text
https://<production-weathertech-os-domain>/api/integrations/google-workspace/oauth/callback
```

The scheme, host, path, case, and trailing slash must exactly match the authorized redirect URI in Google Cloud. This repository's callback path has no trailing slash.

`GOOGLE_WORKSPACE_DOMAIN` is optional. Leave it blank when the approved mailboxes do not share one managed Google Workspace domain. When set, WeatherTech OS both supplies Google's `hd` login hint and rejects a callback whose mailbox domain does not exactly match.

## Token-encryption key

The repository accepts any non-empty `GOOGLE_TOKEN_ENCRYPTION_KEY`, hashes it with SHA-256, and uses the derived 32-byte key with AES-256-GCM. Use at least 32 random bytes. Generate one value locally with:

```bash
openssl rand -base64 32
```

Enter only that generated value into the active `.env.local` or future hosting secret manager. Do not commit it, reuse another application secret, or rotate it while encrypted mailbox credentials still need to be read.

## Required Google API and scopes

Enable only the **Gmail API** (`gmail.googleapis.com`) for this activation.

The Gmail OAuth start route requests exactly:

| Scope | Purpose | Google classification |
| --- | --- | --- |
| `https://www.googleapis.com/auth/gmail.readonly` | Manual inbound mailbox sync and message/profile reads | Restricted |
| `https://www.googleapis.com/auth/gmail.send` | Explicitly owner-approved delivery | Sensitive |

WeatherTech OS does not request `gmail.compose`; drafts stay in Supabase. It does not request `gmail.modify`, `mail.google.com`, password access, IMAP, or SMTP. Calendar authorization is a separate flow and is not part of this Gmail activation.

## Google Cloud Console setup

Owner access is required:

1. Open Google Cloud Console and create or select the dedicated **WeatherTech OS** project.
2. Confirm the project belongs to the intended Google Cloud Organization when Internal audience is required.
3. Open **APIs & Services → Library**, find **Gmail API**, and select **Enable**.
4. Open **Google Auth platform → Branding**. If prompted, select **Get Started**.
5. Set App name to **WeatherTech OS**. Choose an owner-monitored User support email and Developer contact email. Do not add a Google product name to the app name.
6. Open **Audience**:
   - Choose **Internal** only if the Cloud project is owned by the Google Workspace organization and every mailbox that will authorize WeatherTech OS belongs to that organization.
   - Otherwise choose **External**, keep Publishing status at **Testing**, and add only the owner-controlled mailbox accounts as Test users.
7. Open **Data Access → Add or Remove Scopes** and add only the two Gmail scopes listed above.
8. Open **Clients → Create Client** and choose **Web application**.
9. Name the client **WeatherTech OS Web**.
10. Add this local Authorized redirect URI exactly:

    ```text
    http://localhost:3000/api/integrations/google-workspace/oauth/callback
    ```

11. Add the HTTPS production redirect only after the final production host is approved.
12. Create the client and copy its client ID and client secret directly into the active server environment. Do not paste either value into chat.
13. Restart the WeatherTech OS development server after environment changes.

## Verification expectations

- **Controlled owner-only testing:** An External app in Testing can be used by listed test users without completing public verification, but Google will show an unverified/test warning. Because non-profile scopes are requested, test authorization and its refresh token expire after seven days.
- **Internal Workspace use:** An Internal app limited to one Google Workspace organization is generally exempt from public OAuth verification. The Workspace administrator may still need to trust the app for restricted Gmail access.
- **Broader production use:** External use of `gmail.send` requires sensitive-scope verification. External use of `gmail.readonly` requires restricted-scope verification; because WeatherTech OS stores or transmits that restricted-scope data server-side, Google may require a security assessment.

Do not publish the External app or submit verification until the production domain, privacy disclosures, scope justification, and owner-approved deployment are ready.

## Mailbox mapping

The current operating model is company-scoped:

- One primary mailbox mapping for **WeatherTech Roofing LLC**.
- One primary mailbox mapping for **IHC Painting**.

Phoenix and Tucson are locations within the WeatherTech Roofing company record, not separate company records in the Gmail mapping UI. The current workflow therefore does not require or select separate Phoenix and Tucson mailboxes. Supporting separate branch senders would require a later approved product change.

Before authorization, the owner must decide:

1. The owner-controlled mailbox that represents WeatherTech Roofing LLC.
2. The owner-controlled mailbox that represents IHC Painting.
3. Whether both accounts belong to the same managed Workspace domain.
4. Whether the optional exact-domain restriction should be set.

Do not invent mailbox addresses. A mailbox is associated with the company selected in the Integration Center when OAuth starts.

## Safe readiness verification

After the owner privately adds the values and restarts the server, use this follow-up Codex prompt:

```text
Verify Google Workspace / Gmail configuration readiness only.

Do not modify .env.local.
Do not print or inspect any credential value.
Do not start Google authorization.
Do not connect a mailbox.
Do not enable Gmail sending.
Do not send email.

Confirm only:
- GOOGLE_CLIENT_ID is detected
- GOOGLE_CLIENT_SECRET is detected
- GOOGLE_REDIRECT_URI is detected
- GOOGLE_TOKEN_ENCRYPTION_KEY is detected
- GOOGLE_GMAIL_SEND_ENABLED remains false
- the OAuth start route exists and reaches its authenticated guard
- the OAuth callback route exists
- readiness exposes only masked or non-secret configuration
- zero mailboxes remain connected until owner authorization
- local main equals origin/main and the working tree is clean

Return the readiness result and the single next owner action.
```

## Controlled owner OAuth sequence

Do not automate Google credential entry or consent.

1. Sign in to WeatherTech OS as a company owner.
2. Open **Integrations**.
3. In **Gmail / Google Workspace email foundation**, select the intended company mailbox mapping.
4. Select **Connect with Google**.
5. In Google's own page, personally choose the intended owner-controlled mailbox.
6. Confirm that consent requests only read-only Gmail access and permission to send email.
7. Approve consent.
8. Allow Google to return through `/api/integrations/google-workspace/oauth/callback`.
9. Back in WeatherTech OS, confirm the exact mailbox is shown for the intended company and status is Connected.
10. Run readiness and verify an encrypted credential record exists, a refresh token is available, no token is exposed to the browser, and `GOOGLE_GMAIL_SEND_ENABLED` is still false.
11. Repeat only when the owner is ready to map the second company mailbox.

## Controlled internal-send test

Prepare this test but do not execute it until the owner explicitly authorizes enabling the send gate:

1. Use one owner-controlled sender mailbox and one owner-controlled internal recipient.
2. Use subject `TEST — WeatherTech OS Gmail activation — no customer data`.
3. Create a Supabase-backed outbound draft with synthetic content only.
4. Include both plain-text and HTML MIME parts.
5. Attach one harmless generated test PDF with no customer information.
6. Submit the draft for owner approval.
7. Confirm `GOOGLE_GMAIL_SEND_ENABLED` is still false and verify the send attempt is blocked.
8. After a separate explicit owner authorization, set the gate to true privately and restart the server.
9. Re-open the exact pending draft, select **Approve & send**, and confirm the owner-approval dialog.
10. Verify exactly one Gmail message ID and thread ID are saved.
11. Verify the CRM communication record, approval identity/time, attachment count, integration log, and related synthetic record status.
12. Verify a second send/retry is blocked and cannot create a duplicate.
13. Force or wait for access-token expiry, then repeat with a new synthetic draft to verify refresh-token operation.
14. Confirm AI-generated content remains a Supabase draft until the same owner submission and approval gates are completed.
15. Set `GOOGLE_GMAIL_SEND_ENABLED=false` again unless the owner separately approves continued production sending.

## Security behavior

- Client secrets and Google tokens remain server-side and never use `NEXT_PUBLIC_`.
- Access and refresh tokens are stored only as AES-256-GCM encrypted values.
- OAuth uses hashed state, PKCE S256, a ten-minute expiry, one-time state consumption, and exact callback validation.
- Only a company owner can start OAuth or approve delivery.
- An optional Workspace domain is enforced at callback, not treated only as a login hint.
- Mailbox credentials and attachments must match the email's company.
- Source-linked customer records take precedence over unrelated form selections.
- Recipient addresses are validated server-side and header newlines are removed.
- Supabase Storage attachments are loaded only through company-scoped document records.
- Each queued approval is atomically claimed as `syncing` before Gmail is called, blocking concurrent or retry duplicates.
- AI creates drafts only and cannot invoke the send route automatically.
- Integration logs contain identifiers and safe summaries, not OAuth tokens or message bodies.

## Pause and rollback

To pause a mailbox, set the connection to Paused and set `GOOGLE_GMAIL_SEND_ENABLED=false`. To revoke access, use the Google Account or Workspace administrator controls and then reconnect only through a new owner-approved OAuth flow. Do not manually delete CRM communications or encrypted credential rows without an approved recovery plan.
