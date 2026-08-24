import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-google-workspace-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function base64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createHeader(name, value) {
  return { name, value };
}

function restoreEnv(originalEnv) {
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_WORKSPACE_DOMAIN",
    "GOOGLE_PUBLIC_BASE_URL",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
    "GOOGLE_GMAIL_SEND_ENABLED",
    "GOOGLE_CALENDAR_WRITE_ENABLED",
  ]) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/googleWorkspace/serverClient.ts",
      "lib/googleWorkspace/foundation.ts",
      "lib/googleWorkspace/emailDrafts.ts",
      "lib/crm/integrations.ts",
      "lib/crm/leadRouting.ts",
      "lib/crm/leadIntake.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Google Workspace foundation modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const serverClient = await import(
    pathToFileURL(join(outDir, "googleWorkspace", "serverClient.js"))
  );
  const foundation = await import(
    pathToFileURL(join(outDir, "googleWorkspace", "foundation.js"))
  );
  const emailDrafts = await import(
    pathToFileURL(join(outDir, "googleWorkspace", "emailDrafts.js"))
  );
  const integrations = await import(pathToFileURL(join(outDir, "crm", "integrations.js")));
  const leadIntake = await import(pathToFileURL(join(outDir, "crm", "leadIntake.js")));
  const originalEnv = { ...process.env };

  restoreEnv({});
  const missingConfig = serverClient.getGoogleWorkspaceConfigCheckResult();
  assertEqual(missingConfig.ok, false, "Missing Google env keeps readiness disabled");
  assert(
    missingConfig.missing.includes("GOOGLE_CLIENT_ID") &&
      missingConfig.missing.includes("GOOGLE_CLIENT_SECRET") &&
      missingConfig.missing.includes("GOOGLE_REDIRECT_URI") &&
      missingConfig.missing.includes("GOOGLE_TOKEN_ENCRYPTION_KEY"),
    "Readiness reports every required server env var without exposing secret values",
  );

  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  process.env.GOOGLE_REDIRECT_URI =
    "https://app.weathertech.test/api/integrations/google-workspace/oauth/callback";
  process.env.GOOGLE_PUBLIC_BASE_URL = "https://app.weathertech.test";
  process.env.GOOGLE_WORKSPACE_DOMAIN = "weathertech.example";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
    "weathertech-test-token-encryption-key-that-is-not-real";
  process.env.GOOGLE_GMAIL_SEND_ENABLED = "false";
  process.env.GOOGLE_CALENDAR_WRITE_ENABLED = "false";

  const readyConfig = serverClient.getGoogleWorkspaceConfigCheckResult();
  assertEqual(readyConfig.ok, true, "Complete Google env marks backend ready");
  assertEqual(
    readyConfig.credentials.clientSecret,
    "goog****cret",
    "Client secret is masked in readiness output",
  );
  assert(
      readyConfig.scopes.includes("https://www.googleapis.com/auth/gmail.readonly") &&
      readyConfig.scopes.includes("https://www.googleapis.com/auth/gmail.send") &&
      readyConfig.scopes.includes("https://www.googleapis.com/auth/calendar.events") &&
      readyConfig.scopes.includes("https://www.googleapis.com/auth/calendar.calendarlist.readonly") &&
      readyConfig.scopes.includes("openid"),
    "Google Workspace scopes include Gmail, Calendar, and identity readiness",
  );
  assertEqual(
    readyConfig.credentials.googleCalendarWriteEnabled,
    false,
    "Calendar writes stay disabled unless explicitly enabled",
  );

  assertEqual(
    foundation.googleWorkspaceFoundationMigration,
    "0027_gmail_workspace_email_foundation.sql",
    "Foundation metadata references the Gmail migration",
  );
  assert(
    foundation.googleWorkspaceMailboxTemplates.some(
      (template) => template.companyName === "WeatherTech Roofing LLC",
    ) &&
      foundation.googleWorkspaceMailboxTemplates.some(
        (template) => template.companyName === "IHC Painting",
      ),
    "Mailbox templates cover WeatherTech Roofing LLC and IHC Painting",
  );
  assert(
    foundation.googleWorkspaceEndpoints.some(
      (endpoint) =>
        endpoint.id === "send" &&
        endpoint.path === integrations.googleWorkspaceEnvVars.sendEndpoint &&
        endpoint.liveEnabled === false,
    ),
    "Send endpoint is documented as explicitly disabled by default",
  );

  const deterministicBytes = (size) => Buffer.alloc(size, 7);
  const oauthState = serverClient.createGoogleOAuthState({
    randomBytes: deterministicBytes,
  });
  assertEqual(
    oauthState.stateHash,
    serverClient.hashGoogleOAuthState(oauthState.rawState),
    "OAuth state hash matches the raw state",
  );
  const oauthRequest = serverClient.buildGoogleOAuthAuthorizationRequest({
    state: oauthState,
    loginHint: "sales@weathertech.example",
    scopes: integrations.gmailScopes,
  });
  const oauthUrl = new URL(oauthRequest.authorizationUrl);
  assertEqual(
    oauthUrl.hostname,
    "accounts.google.com",
    "OAuth authorization starts at Google",
  );
  assertEqual(oauthUrl.searchParams.get("access_type"), "offline", "OAuth asks for refresh token access");
  assertEqual(oauthUrl.searchParams.get("code_challenge_method"), "S256", "OAuth uses PKCE S256");
  assertEqual(oauthUrl.searchParams.get("login_hint"), "sales@weathertech.example", "OAuth keeps login hint");
  assertEqual(oauthUrl.searchParams.get("hd"), "weathertech.example", "OAuth preserves workspace domain hint");
  assertEqual(
    oauthUrl.searchParams.get("scope"),
    integrations.gmailScopes.join(" "),
    "Gmail OAuth requests only the exact running Gmail scopes",
  );
  assertEqual(
    oauthUrl.searchParams.has("wtos_company_id"),
    false,
    "Gmail OAuth does not expose internal company ids to Google",
  );
  assertEqual(
    integrations.gmailScopes.includes("https://www.googleapis.com/auth/gmail.compose"),
    false,
    "Supabase-backed drafts do not require the restricted Gmail compose scope",
  );
  assertEqual(
    integrations.hasRequiredGmailSendScopes(integrations.gmailScopes),
    true,
    "Gmail delivery requires the connected mailbox read and send scopes",
  );
  assertEqual(
    integrations.hasRequiredGmailSendScopes([
      "https://www.googleapis.com/auth/gmail.send",
    ]),
    false,
    "Gmail delivery fails closed when duplicate-protection lookup scope is missing",
  );

  assertEqual(
    serverClient.validateGoogleWorkspaceAccountDomain(
      "sales@weathertech.example",
    ).ok,
    true,
    "Configured Workspace domain accepts a matching mailbox",
  );
  assertEqual(
    serverClient.validateGoogleWorkspaceAccountDomain("owner@gmail.com").ok,
    false,
    "Configured Workspace domain rejects an outside mailbox",
  );

  assertEqual(
    serverClient.normalizeGmailEmailAddress("Jane Homeowner <Jane@Example.COM>"),
    "jane@example.com",
    "Gmail email addresses normalize from display-name format",
  );

  const gmailMessage = {
    id: "gmail-message-1",
    threadId: "gmail-thread-1",
    historyId: "9001",
    internalDate: String(Date.parse("2026-08-02T15:00:00.000Z")),
    snippet: "Need a roof estimate",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        createHeader("From", "Jane Homeowner <jane@example.com>"),
        createHeader("To", "Sales <sales@weathertech.example>"),
        createHeader("Subject", "Roof leak estimate"),
      ],
      parts: [
        {
          mimeType: "text/html",
          body: {
            data: base64Url("<script>alert(1)</script><p>I need a roof leak estimate.</p>"),
          },
        },
        {
          mimeType: "image/jpeg",
          filename: "roof-leak.jpg",
          body: {
            attachmentId: "attachment-1",
            size: 2048,
          },
          headers: [createHeader("Content-Disposition", "attachment; filename=roof-leak.jpg")],
        },
      ],
    },
  };
  const snapshot = {
    customers: [
      {
        id: "customer-1",
        company_id: "company-weathertech",
        email: "jane@example.com",
      },
    ],
    leads: [
      {
        id: "lead-1",
        company_id: "company-weathertech",
        email: "lead@example.com",
        customer_id: null,
        property_id: "property-1",
      },
    ],
    jobs: [
      {
        id: "job-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
      },
    ],
    estimates: [
      {
        id: "estimate-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
      },
    ],
    emailMessages: [],
  };
  const mailbox = {
    integrationConnectionId: "connection-1",
    companyId: "company-weathertech",
    accountEmail: "sales@weathertech.example",
    providerAccountId: "sales@weathertech.example",
  };
  const importPlan = serverClient.buildGmailMessageImportPlan({
    mailbox,
    message: gmailMessage,
    snapshot,
  });
  assertEqual(importPlan.duplicate, false, "New Gmail message imports once");
  assertEqual(importPlan.direction, "inbound", "Customer-to-mailbox Gmail message is inbound");
  assertEqual(importPlan.match.customerId, "customer-1", "Inbound Gmail matches existing customer");
  assertEqual(importPlan.match.jobId, "job-1", "Inbound Gmail can link to existing customer job");
  assertEqual(importPlan.emailMessage?.lead_id, null, "Matched customer email does not create a duplicate lead");
  assertEqual(importPlan.emailMessage?.sync_status, "imported", "Imported Gmail message uses imported sync status");
  assert(
    importPlan.sanitizedPreview.includes("I need a roof leak estimate.") &&
      !importPlan.sanitizedPreview.includes("script"),
    "Gmail preview is sanitized before storage",
  );
  assertEqual(importPlan.attachments.length, 1, "Gmail attachment metadata is captured");
  assertEqual(importPlan.attachments[0].file_name, "roof-leak.jpg", "Attachment filename is preserved as metadata");

  const unmatchedGmailLead = leadIntake.normalizeGmailLeadBody({
    gmailMessageId: "gmail-message-unmatched",
    gmailThreadId: "gmail-thread-unmatched",
    fromEmail: "new-owner@example.test",
    mailboxEmail: mailbox.accountEmail,
    subject: "Need a roof estimate",
    body: "I need a roof inspection and estimate.",
    business: "WeatherTech Roofing LLC",
    city: "Phoenix",
  });
  assert(unmatchedGmailLead.lead, "Unmatched inbound Gmail can become a lead-intake candidate");
  assertEqual(unmatchedGmailLead.lead.provider, "gmail", "Gmail intake candidate preserves provider");
  assertEqual(
    unmatchedGmailLead.lead.email,
    "new-owner@example.test",
    "Gmail intake candidate normalizes contact email",
  );

  const duplicatePlan = serverClient.buildGmailMessageImportPlan({
    mailbox,
    message: gmailMessage,
    snapshot: {
      ...snapshot,
      emailMessages: [
        {
          integration_connection_id: "connection-1",
          gmail_message_id: "gmail-message-1",
        },
      ],
    },
  });
  assertEqual(duplicatePlan.duplicate, true, "Existing Gmail provider id prevents duplicate import");
  assertEqual(duplicatePlan.emailMessage, null, "Duplicate Gmail import does not create a CRM email");

  const outboundPlan = serverClient.buildGmailMessageImportPlan({
    mailbox,
    message: {
      ...gmailMessage,
      id: "gmail-message-2",
      payload: {
        ...gmailMessage.payload,
        headers: [
          createHeader("From", "Sales <sales@weathertech.example>"),
          createHeader("To", "Jane Homeowner <jane@example.com>"),
          createHeader("Subject", "Estimate follow-up"),
        ],
      },
    },
    snapshot,
  });
  assertEqual(outboundPlan.direction, "outbound", "Mailbox-to-customer Gmail message is outbound");

  const roundTripToken = "ya29.not-a-real-token";
  const encrypted = serverClient.encryptGoogleToken(roundTripToken);
  assert(
    encrypted !== roundTripToken && encrypted.startsWith("v1:"),
    "Google token encryption stores a versioned ciphertext",
  );
  assertEqual(
    serverClient.decryptGoogleToken(encrypted),
    roundTripToken,
    "Google token encryption round-trips server-side",
  );

  let fetchCalled = false;
  const disabledSend = await serverClient.sendGmailEmail({
    message: {
      to_email: "jane@example.com",
      cc_email: null,
      from_email: "sales@weathertech.example",
      subject: "Estimate",
      body: "Your estimate is ready.",
      gmail_thread_id: null,
    },
    accessToken: "access-token",
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("Fetch must not run when Gmail send is disabled.");
    },
  });
  assertEqual(disabledSend.sent, false, "Disabled Gmail send never reports success");
  assertEqual(disabledSend.attempted, false, "Disabled Gmail send is not attempted");
  assertEqual(fetchCalled, false, "Disabled Gmail send does not call Gmail");

  process.env.GOOGLE_GMAIL_SEND_ENABLED = "true";
  const sendFixture = {
    id: "email-message-1",
    company_id: "company-1",
    integration_connection_id: "connection-1",
    customer_id: null,
    estimate_id: null,
    invoice_id: null,
    document_id: null,
    category: "estimate",
    status: "queued",
    direction: "outbound",
    to_email: "jane@example.com",
    to_emails: ["jane@example.com"],
    cc_email: null,
    cc_emails: [],
    bcc_emails: [],
    reply_to_emails: [],
    from_email: "sales@weathertech.example",
    subject: "Estimate\nInjected",
    body: "Your estimate is ready.",
    gmail_message_id: null,
    gmail_thread_id: "gmail-thread-1",
    queued_at: null,
    sent_at: null,
    last_error: null,
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
  };
  const approvedPayloadHash = integrations.createGmailOutboundPayloadFingerprint(sendFixture);
  assertEqual(
    approvedPayloadHash,
    integrations.createGmailOutboundPayloadFingerprint({ ...sendFixture }),
    "Identical Gmail approval payloads have a stable fingerprint",
  );
  assert(
    approvedPayloadHash !==
      integrations.createGmailOutboundPayloadFingerprint({
        ...sendFixture,
        subject: "Changed after approval",
      }),
    "Changing a queued Gmail payload invalidates its approval fingerprint",
  );
  const expectedIdempotencyKey = serverClient.createGmailIdempotencyKey(sendFixture);
  const sentSend = await serverClient.sendGmailEmail({
    message: sendFixture,
    accessToken: "access-token",
    fetchImpl: async (url, init) => {
      fetchCalled = true;
      if (String(url).includes("/users/me/messages?")) {
        assert(
          new URL(String(url)).searchParams.get("q")?.includes("in:sent") &&
            new URL(String(url)).searchParams
              .get("q")
              ?.includes('subject:"Estimate Injected"'),
          "Gmail duplicate protection searches recent sent messages by approved subject",
        );
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      assert(
        String(url).endsWith("/users/me/messages/send"),
        "Enabled Gmail send uses the Gmail messages.send endpoint",
      );
      assertEqual(
        init?.headers?.Authorization,
        "Bearer access-token",
        "Gmail send includes bearer token only in server request",
      );
      const payload = JSON.parse(String(init?.body));
      const decodedRaw = Buffer.from(
        String(payload.raw).replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
      assert(decodedRaw.includes("To: jane@example.com"), "Raw Gmail message includes recipient");
      assert(
        decodedRaw.includes("Subject: Estimate Injected"),
        "Raw Gmail subject strips header newlines",
      );
      assert(
        decodedRaw.includes(
          `X-WeatherTech-OS-Idempotency-Key: ${expectedIdempotencyKey}`,
        ),
        "Raw Gmail message includes the deterministic custom idempotency header",
      );
      return new Response(JSON.stringify({ id: "sent-1", threadId: "gmail-thread-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assertEqual(fetchCalled, true, "Enabled Gmail send calls Gmail mock");
  assertEqual(sentSend.sent, true, "Enabled Gmail send can report provider-confirmed send");
  assertEqual(sentSend.gmailMessageId, "sent-1", "Gmail send result preserves provider id");
  assertEqual(sentSend.providerSendAttempts, 1, "Successful Gmail delivery performs one POST");

  let duplicatePostCount = 0;
  const duplicateSend = await serverClient.sendGmailEmail({
    message: sendFixture,
    accessToken: "access-token",
    fetchImpl: async (url) => {
      if (String(url).endsWith("/users/me/messages/send")) {
        duplicatePostCount += 1;
      }
      if (String(url).includes("/users/me/messages/sent-existing?")) {
        return new Response(
          JSON.stringify({
            threadId: "thread-existing",
            payload: {
              headers: [
                { name: "Subject", value: sendFixture.subject },
                {
                  name: "X-WeatherTech-OS-Idempotency-Key",
                  value: expectedIdempotencyKey,
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ messages: [{ id: "sent-existing", threadId: "thread-existing" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assertEqual(duplicateSend.sent, true, "A provider-confirmed prior send reconciles as sent");
  assertEqual(
    duplicateSend.duplicatePrevented,
    true,
    "A matching provider idempotency header is reported as duplicate prevention",
  );
  assertEqual(duplicatePostCount, 0, "Duplicate reconciliation never repeats the Gmail POST");

  let failurePostCount = 0;
  const providerFailure = await serverClient.sendGmailEmail({
    message: { ...sendFixture, id: "email-message-provider-failure" },
    accessToken: "access-token",
    fetchImpl: async (url) => {
      if (String(url).endsWith("/users/me/messages/send")) {
        failurePostCount += 1;
        return new Response(JSON.stringify({ error: { message: "Provider unavailable" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assertEqual(providerFailure.sent, false, "A Gmail provider failure is surfaced to the CRM");
  assertEqual(failurePostCount, 1, "A provider failure never triggers a duplicate-prone POST retry");

  let retryPhase = "first";
  let retryPostCount = 0;
  const ambiguousFixture = {
    ...sendFixture,
    id: "email-message-ambiguous",
    gmail_thread_id: null,
  };
  const ambiguousIdempotencyKey =
    serverClient.createGmailIdempotencyKey(ambiguousFixture);
  const ambiguousFetch = async (url) => {
    if (String(url).endsWith("/users/me/messages/send")) {
      retryPostCount += 1;
      return new Response(JSON.stringify({ error: { message: "Gateway timeout" } }), {
        status: 504,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).includes("/users/me/messages/sent-after-timeout?")) {
      return new Response(
        JSON.stringify({
          threadId: "thread-after-timeout",
          payload: {
            headers: [
              { name: "Subject", value: ambiguousFixture.subject },
              {
                name: "X-WeatherTech-OS-Idempotency-Key",
                value: ambiguousIdempotencyKey,
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify(
        retryPhase === "retry"
          ? { messages: [{ id: "sent-after-timeout", threadId: "thread-after-timeout" }] }
          : { messages: [] },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const ambiguousFirstAttempt = await serverClient.sendGmailEmail({
    message: ambiguousFixture,
    accessToken: "access-token",
    fetchImpl: ambiguousFetch,
  });
  assertEqual(ambiguousFirstAttempt.sent, false, "An ambiguous provider failure stays failed");
  assertEqual(
    ambiguousFirstAttempt.status,
    "provider_outcome_unknown",
    "A provider timeout remains outcome-unknown instead of becoming resendable",
  );
  const unresolvedReconciliation = await serverClient.sendGmailEmail({
    message: ambiguousFixture,
    accessToken: "access-token",
    reconciliationOnly: true,
    fetchImpl: ambiguousFetch,
  });
  assertEqual(
    unresolvedReconciliation.status,
    "provider_outcome_unknown",
    "Reconciliation without provider evidence remains safely outcome-unknown",
  );
  assertEqual(
    retryPostCount,
    1,
    "Outcome-unknown reconciliation never issues another Gmail POST",
  );
  retryPhase = "retry";
  const ambiguousRetry = await serverClient.sendGmailEmail({
    message: ambiguousFixture,
    accessToken: "access-token",
    reconciliationOnly: true,
    fetchImpl: ambiguousFetch,
  });
  assertEqual(ambiguousRetry.sent, true, "An owner retry reconciles a provider-confirmed send");
  assertEqual(
    ambiguousRetry.duplicatePrevented,
    true,
    "Retry reconciliation prevents a second customer email",
  );
  assertEqual(retryPostCount, 1, "The owner retry does not issue a second Gmail POST");
  assertEqual(
    ambiguousRetry.gmailThreadId,
    "thread-after-timeout",
    "A new-thread send reconciles the exact provider-generated Gmail thread identity",
  );

  let stoppedPreSendPostCount = 0;
  const stoppedPreSend = await serverClient.sendGmailEmail({
    message: { ...sendFixture, id: "email-message-pre-send-claim-failure" },
    accessToken: "access-token",
    beforeProviderSend: async () => false,
    fetchImpl: async (url) => {
      if (String(url).endsWith("/users/me/messages/send")) {
        stoppedPreSendPostCount += 1;
      }
      return new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assertEqual(
    stoppedPreSend.status,
    "pre_send_stopped",
    "A failed durable provider-attempt checkpoint stops before Gmail",
  );
  assertEqual(
    stoppedPreSendPostCount,
    0,
    "A failed durable provider-attempt checkpoint cannot call Gmail",
  );

  let refreshRequestBody = "";
  const refreshed = await serverClient.refreshGoogleAccessToken({
    refreshToken: "refresh-token",
    fetchImpl: async (url, init) => {
      assertEqual(
        String(url),
        "https://oauth2.googleapis.com/token",
        "Token refresh uses Google's OAuth token endpoint",
      );
      refreshRequestBody = String(init?.body);
      return new Response(
        JSON.stringify({
          access_token: "refreshed-access-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "https://www.googleapis.com/auth/gmail.send",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assertEqual(refreshed.ok, true, "Refresh token flow returns a new Gmail access token");
  assert(
    refreshRequestBody.includes("grant_type=refresh_token") &&
      refreshRequestBody.includes("refresh_token=refresh-token"),
    "Refresh token request uses OAuth refresh_token grant",
  );

  const approvalMessage = {
    direction: "outbound",
    status: "queued",
    sync_status: "queued",
    to_email: "owner@example.com",
    to_emails: ["owner@example.com"],
  };
  assertEqual(
    serverClient.validateGmailOwnerApproval({
      message: approvalMessage,
      isOwner: false,
      approvalAction: "owner_approved_send",
    }).status,
    "owner_required",
    "Non-owner users cannot approve outbound Gmail",
  );
  assertEqual(
    serverClient.validateGmailOwnerApproval({
      message: approvalMessage,
      isOwner: true,
      approvalAction: null,
    }).status,
    "explicit_approval_required",
    "Owner sends require an explicit approval action",
  );
  assertEqual(
    serverClient.validateGmailOwnerApproval({
      message: approvalMessage,
      isOwner: true,
      approvalAction: "owner_approved_send",
    }).ok,
    true,
    "Explicit company-owner approval unlocks controlled send",
  );
  assertEqual(
    serverClient.validateGmailOwnerApproval({
      message: { ...approvalMessage, status: "draft", sync_status: "local" },
      isOwner: true,
      approvalAction: "owner_approved_send",
    }).status,
    "approval_submission_required",
    "A draft cannot bypass submission for owner approval",
  );
  assertEqual(
    serverClient.validateGmailOutboundRecipients(approvalMessage).ok,
    true,
    "A valid owner-controlled recipient passes server validation",
  );
  assertEqual(
    serverClient.validateGmailOutboundRecipients({
      ...approvalMessage,
      to_email: "not-an-email",
      to_emails: ["not-an-email"],
    }).ok,
    false,
    "Malformed recipients are rejected before Gmail delivery",
  );

  const sendRouteSource = readFileSync(
    join(cwd, "app/api/integrations/google-workspace/send/route.ts"),
    "utf8",
  );
  const crmAppSource = readFileSync(join(cwd, "components/CrmApp.tsx"), "utf8");
  const oauthStartRouteSource = readFileSync(
    join(cwd, "app/api/integrations/google-workspace/oauth/start/route.ts"),
    "utf8",
  );
  const oauthCallbackRouteSource = readFileSync(
    join(cwd, "app/api/integrations/google-workspace/oauth/callback/route.ts"),
    "utf8",
  );
  assert(
    sendRouteSource.includes('.eq("status", "queued")') &&
      sendRouteSource.includes('.eq("sync_status", "queued")') &&
      sendRouteSource.includes('sync_status: "syncing"') &&
      sendRouteSource.includes("No duplicate send was attempted"),
    "Send route atomically claims a queued approval before calling Gmail",
  );
  assert(
    sendRouteSource.includes('GMAIL_DELIVERY_STATE_PRE_SEND = "claimed_pre_send"') &&
      sendRouteSource.includes(
        'GMAIL_DELIVERY_STATE_UNKNOWN = "provider_outcome_unknown"',
      ) &&
      sendRouteSource.includes(
        'GMAIL_DELIVERY_STATE_CONFIRMED = "provider_confirmed"',
      ) &&
      sendRouteSource.includes("recoverStalePreSendClaim") &&
      sendRouteSource.includes("reconciliationOnly: recoveringUnknownProviderOutcome") &&
      sendRouteSource.includes("gmailConfirmedMessageId") &&
      sendRouteSource.includes("approvedGmailThreadId") &&
      sendRouteSource.includes(
        "initialDeliveryState === GMAIL_DELIVERY_STATE_CONFIRMED",
      ) &&
      sendRouteSource.includes('"failed_after_provider_send"'),
    "Send route durably separates safe pre-send recovery, outcome-only reconciliation, and provider-confirmed persistence",
  );
  assert(
    sendRouteSource.includes("message.estimate_id && !signatureMetadata"),
    "Native proposal signature delivery cannot downgrade an approved estimate back to sent",
  );
  assert(
    crmAppSource.includes('"sent_activation_deferred"') &&
      crmAppSource.includes('"failed_after_provider_send"') &&
      crmAppSource.includes('"provider_outcome_unknown"') &&
      crmAppSource.includes("result.signatureActivationDeferred") &&
      crmAppSource.includes("result.message ?? result.result?.message"),
    "Gmail UI reads the top-level delivery contract and distinguishes every post-provider state",
  );
  assert(
    sendRouteSource.includes('.select("user_id, company_id, role")') &&
      sendRouteSource.includes('.eq("provider", "gmail")') &&
      sendRouteSource.includes("hasRequiredGmailSendScopes") &&
      sendRouteSource.includes("pendingPayloadHash") &&
      sendRouteSource.includes("createGmailOutboundPayloadFingerprint"),
    "Send route enforces the real owner schema, company mailbox mapping, scopes, and approved payload",
  );
  assert(
    oauthStartRouteSource.includes('.eq("role", "owner")') &&
      oauthStartRouteSource.includes("A company owner must authorize") &&
      !oauthStartRouteSource.includes("...gmailIdentityScopes"),
    "Only a company owner can start Gmail OAuth with the minimum Gmail scope set",
  );
  assert(
    oauthCallbackRouteSource.includes("validateGoogleWorkspaceAccountDomain") &&
      oauthCallbackRouteSource.includes("workspace_domain_mismatch") &&
      oauthCallbackRouteSource.includes('.is("consumed_at", null)') &&
      oauthCallbackRouteSource.indexOf('.is("consumed_at", null)') <
        oauthCallbackRouteSource.indexOf("exchangeGoogleOAuthCode({"),
    "OAuth callback enforces the optional Workspace domain and atomically consumes state before code exchange",
  );

  const estimatePdf = serverClient.buildEstimatePdfAttachment({
    estimate: {
      title: "Roof replacement",
      issue_date: "2026-08-05",
      subtotal: 10000,
      tax_total: 850,
      total: 10850,
      notes: "Customer-safe estimate notes",
    },
    lineItems: [
      {
        description: "Roofing system",
        quantity: 1,
        unit: "job",
        total: 10000,
      },
    ],
    companyName: "WeatherTech Roofing LLC",
    customerName: "Jane Homeowner",
  });
  assertEqual(estimatePdf.mimeType, "application/pdf", "Estimate attachment is a PDF");
  assert(
    estimatePdf.content.subarray(0, 8).toString("utf8").startsWith("%PDF-1.4"),
    "Estimate attachment contains a valid PDF header",
  );
  const rawWithPdf = serverClient.buildGmailRawMessage(
    {
      to_email: "jane@example.com",
      to_emails: ["jane@example.com"],
      cc_email: null,
      from_email: "sales@weathertech.example",
      subject: "Roof estimate",
      body: "Hi Jane,\n\nYour <estimate> is ready.",
    },
    [estimatePdf],
  );
  const decodedWithPdf = Buffer.from(
    rawWithPdf.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
  assert(
    decodedWithPdf.includes("multipart/mixed") &&
      decodedWithPdf.includes("multipart/alternative"),
    "Gmail MIME contains mixed attachments and text/HTML alternatives",
  );
  assert(
    decodedWithPdf.includes("Content-Type: application/pdf") &&
      decodedWithPdf.includes(estimatePdf.content.toString("base64").slice(0, 40)),
    "Gmail MIME carries the generated estimate PDF attachment",
  );
  assert(
    decodedWithPdf.includes("text/html") &&
      decodedWithPdf.includes("Your &lt;estimate&gt; is ready."),
    "HTML delivery escapes customer text and preserves formatting",
  );

  const draftSnapshot = {
    companies: [{ id: "company-weathertech", name: "WeatherTech Roofing LLC" }],
    customers: [
      {
        id: "customer-1",
        company_id: "company-weathertech",
        contact_name: "Jane",
        display_name: "Jane Homeowner",
        email: "jane@example.com",
        property_address: "100 Main St",
      },
      {
        id: "customer-2",
        company_id: "company-weathertech",
        contact_name: "Wrong Customer",
        display_name: "Wrong Customer",
        email: "wrong-customer@example.com",
        property_address: "200 Other St",
      },
    ],
    leads: [],
    jobs: [],
    estimates: [
      {
        id: "estimate-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        property_id: "property-1",
        title: "Roof replacement",
        total: 10850,
      },
    ],
    proposalRevisions: [
      {
        id: "proposal-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: null,
        property_id: "property-1",
        estimate_id: "estimate-1",
        proposal_number: "WT-1001",
        title: "Roof proposal",
        accepted_total: 10850,
        base_total: 10850,
      },
    ],
    inspections: [
      {
        id: "inspection-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: null,
        job_id: null,
        estimate_id: null,
        property_id: "property-1",
        schedule_event_id: null,
        title: "Roof inspection",
        scheduled_start: "2026-08-07T16:00:00.000Z",
        property_address: "100 Main St",
      },
    ],
    scheduleEvents: [
      {
        id: "schedule-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: null,
        job_id: null,
        property_id: "property-1",
        title: "Production walkthrough",
        start_at: "2026-08-08T16:00:00.000Z",
        location: "100 Main St",
      },
    ],
    documents: [],
    invoices: [],
    emailMessages: [],
  };
  for (const [kind, sourceId] of [
    ["estimate_delivery", "estimate-1"],
    ["proposal_delivery", "proposal-1"],
    ["inspection_confirmation", "inspection-1"],
    ["appointment_reminder", "schedule-1"],
  ]) {
    const plan = emailDrafts.buildGoogleWorkspaceEmailDraft({
      snapshot: draftSnapshot,
      kind,
      companyId: "company-weathertech",
      sourceId,
      integrationConnectionId: "connection-1",
    });
    assertEqual(plan.ok, true, `${kind} creates a Supabase-backed email draft`);
    assertEqual(plan.input.status, "draft", `${kind} never sends automatically`);
    assertEqual(
      plan.input.metadata.approvalState,
      "draft",
      `${kind} is routed through owner approval`,
    );
  }
  const sourceLinkedEstimateDraft = emailDrafts.buildGoogleWorkspaceEmailDraft({
    snapshot: draftSnapshot,
    kind: "estimate_delivery",
    companyId: "company-weathertech",
    sourceId: "estimate-1",
    customerId: "customer-2",
  });
  assertEqual(
    sourceLinkedEstimateDraft.input.customer_id,
    "customer-1",
    "Estimate delivery keeps the source-linked customer instead of a mismatched form selection",
  );
  assertEqual(
    sourceLinkedEstimateDraft.input.to_email,
    "jane@example.com",
    "Estimate delivery uses the source-linked customer email by default",
  );

  restoreEnv(originalEnv);
  console.log("Google Workspace email foundation check passed.");
  console.log("Verified OAuth, token refresh, owner approval, mailbox-scoped drafts, HTML MIME, PDF attachments, and controlled Gmail send.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
