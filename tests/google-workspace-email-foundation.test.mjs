import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
      readyConfig.scopes.includes("https://www.googleapis.com/auth/gmail.compose") &&
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
    companyId: "company-weathertech",
    state: oauthState,
    loginHint: "sales@weathertech.example",
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
  const sentSend = await serverClient.sendGmailEmail({
    message: {
      to_email: "jane@example.com",
      cc_email: null,
      from_email: "sales@weathertech.example",
      subject: "Estimate\nInjected",
      body: "Your estimate is ready.",
      gmail_thread_id: "gmail-thread-1",
    },
    accessToken: "access-token",
    fetchImpl: async (url, init) => {
      fetchCalled = true;
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
      return new Response(JSON.stringify({ id: "sent-1", threadId: "gmail-thread-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assertEqual(fetchCalled, true, "Enabled Gmail send calls Gmail mock");
  assertEqual(sentSend.sent, true, "Enabled Gmail send can report provider-confirmed send");
  assertEqual(sentSend.gmailMessageId, "sent-1", "Gmail send result preserves provider id");

  restoreEnv(originalEnv);
  console.log("Google Workspace email foundation check passed.");
  console.log("Verified OAuth readiness, Gmail scopes, message import, matching, attachments, token encryption, and disabled send guardrails.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
