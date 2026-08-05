import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  googleWorkspaceEndpoints,
  googleWorkspaceFoundationMigration,
  googleWorkspacePhaseOneGuardrails,
  googleWorkspaceReadinessLabels,
  googleWorkspaceRequiredEnvVars,
  googleWorkspaceSupportedScopes,
} from "./foundation";
import { googleWorkspaceEnvVars } from "../crm/integrations";
import { getGoogleCalendarConfigCheckResult } from "./calendar";
import type {
  CompanyRecord,
  CrmSnapshot,
  CustomerRecord,
  Database,
  EmailMessageInput,
  EmailMessageRecord,
  EstimateLineItemRecord,
  EstimateRecord,
  GmailEmailAttachmentInsert,
  GmailEmailThreadInsert,
  IntegrationConnectionRecord,
  LeadRecord,
  JobRecord,
} from "../crm/types";

type CrmClient = SupabaseClient<Database>;
type FetchLike = typeof fetch;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const OAUTH_STATE_TTL_MINUTES = 10;
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 2 * 60 * 1000;
const TOKEN_ENCRYPTION_VERSION = "v1";

export const GMAIL_EMAIL_SYNC_EVENT_TYPE = "gmail.email.sync";
export const GMAIL_EMAIL_SEND_EVENT_TYPE = "gmail.email.send";
export const GMAIL_OAUTH_EVENT_TYPE = "gmail.oauth";

export type GoogleWorkspaceMaskedConfig = {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  publicBaseUrl: string | null;
  workspaceDomain: string | null;
  tokenEncryptionKey: string | null;
  gmailSendEnabled: boolean;
  googleCalendarWriteEnabled: boolean;
};

export type GoogleWorkspaceConfigCheckResult = {
  ok: boolean;
  status: "ready" | "missing_config";
  checkedAt: string;
  missing: string[];
  credentials: GoogleWorkspaceMaskedConfig;
  oauthAuthorizationEndpoint: typeof GOOGLE_AUTH_URL;
  tokenEndpoint: typeof GOOGLE_TOKEN_URL;
  gmailApiBaseUrl: typeof GMAIL_API_BASE_URL;
  calendarApiBaseUrl: string;
  scopes: string[];
};

export type GoogleOAuthState = {
  rawState: string;
  stateHash: string;
  codeVerifier: string;
  codeChallenge: string;
  expiresAt: string;
};

export type GoogleOAuthAuthorizationRequest = GoogleOAuthState & {
  authorizationUrl: string;
  scopes: string[];
};

export type GmailHeader = {
  name?: unknown;
  value?: unknown;
};

export type GmailMessagePart = {
  partId?: unknown;
  mimeType?: unknown;
  filename?: unknown;
  headers?: GmailHeader[];
  body?: {
    data?: unknown;
    size?: unknown;
    attachmentId?: unknown;
  };
  parts?: GmailMessagePart[];
};

export type GmailApiMessage = {
  id?: unknown;
  threadId?: unknown;
  labelIds?: unknown;
  snippet?: unknown;
  historyId?: unknown;
  internalDate?: unknown;
  payload?: GmailMessagePart;
};

export type GmailMailboxContext = {
  integrationConnectionId: string;
  companyId: string;
  accountEmail: string;
  providerAccountId: string | null;
  historyId?: string | null;
};

export type GmailCrmMatch = {
  customerId: string | null;
  leadId: string | null;
  jobId: string | null;
  estimateId: string | null;
  propertyId: string | null;
  matchStatus:
    | "matched_customer"
    | "matched_lead"
    | "matched_job"
    | "matched_estimate"
    | "unmatched";
};

export type GmailImportPlan = {
  duplicate: boolean;
  duplicateReason: string | null;
  messageId: string | null;
  threadId: string | null;
  historyId: string | null;
  direction: "inbound" | "outbound";
  emailMessage: EmailMessageInput | null;
  thread: GmailEmailThreadInsert | null;
  attachments: GmailEmailAttachmentInsert[];
  match: GmailCrmMatch;
  sanitizedPreview: string;
  providerPayloadHash: string;
};

export type GmailSendResult =
  | {
      attempted: false;
      sent: false;
      status: "disabled" | "missing_token" | "missing_message" | "configuration_missing";
      message: string;
    }
  | {
      attempted: true;
      sent: true;
      status: "sent";
      message: string;
      gmailMessageId: string | null;
      gmailThreadId: string | null;
    }
  | {
      attempted: true;
      sent: false;
      status: "failed";
      message: string;
      error: string;
    };

type GmailSendResponse = {
  id?: unknown;
  threadId?: unknown;
  message?: unknown;
  error?: {
    message?: unknown;
  };
};

export type GmailOutboundAttachment = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type GmailOwnerApprovalCheck = {
  ok: boolean;
  status:
    | "approved"
    | "owner_required"
    | "explicit_approval_required"
    | "approval_submission_required"
    | "outbound_required"
    | "already_sent";
  message: string;
};

export type GmailRecipientValidation = {
  ok: boolean;
  message: string;
};

type TokenRefreshResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
};

function getServerEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getBooleanEnvValue(name: string) {
  const value = getServerEnv(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function maskValue(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function getGoogleWorkspaceConfigCheckResult(): GoogleWorkspaceConfigCheckResult {
  const missing = googleWorkspaceRequiredEnvVars.filter((name) => !getServerEnv(name));

  return {
    ok: missing.length === 0,
    status: missing.length === 0 ? "ready" : "missing_config",
    checkedAt: new Date().toISOString(),
    missing: [...missing],
    credentials: {
      clientId: maskValue(getServerEnv(googleWorkspaceEnvVars.clientId)),
      clientSecret: maskValue(getServerEnv(googleWorkspaceEnvVars.clientSecret)),
      redirectUri: getServerEnv(googleWorkspaceEnvVars.redirectUri),
      publicBaseUrl: getServerEnv(googleWorkspaceEnvVars.publicBaseUrl),
      workspaceDomain: getServerEnv(googleWorkspaceEnvVars.workspaceDomain),
      tokenEncryptionKey: maskValue(getServerEnv(googleWorkspaceEnvVars.tokenEncryptionKey)),
      gmailSendEnabled: getBooleanEnvValue(googleWorkspaceEnvVars.gmailSendEnabled),
      googleCalendarWriteEnabled: getBooleanEnvValue(
        googleWorkspaceEnvVars.googleCalendarWriteEnabled,
      ),
    },
    oauthAuthorizationEndpoint: GOOGLE_AUTH_URL,
    tokenEndpoint: GOOGLE_TOKEN_URL,
    gmailApiBaseUrl: GMAIL_API_BASE_URL,
    calendarApiBaseUrl: getGoogleCalendarConfigCheckResult().credentials.calendarApiBaseUrl,
    scopes: googleWorkspaceSupportedScopes,
  };
}

export function getGoogleWorkspaceReadinessSummary({
  schemaApplied,
  connectedMailboxCount,
}: {
  schemaApplied: boolean | null;
  connectedMailboxCount: number;
}) {
  const config = getGoogleWorkspaceConfigCheckResult();
  const status = !config.ok
    ? "configuration_required"
    : connectedMailboxCount > 0
      ? "connected"
      : "backend_ready";

  return {
    ok: config.ok && schemaApplied !== false,
    status,
    statusLabel: googleWorkspaceReadinessLabels[status],
    checkedAt: config.checkedAt,
    message:
      status === "connected"
        ? "Google Workspace mailbox records are available. Live sync still requires controlled owner validation."
        : status === "backend_ready"
          ? "Google Workspace backend is configured; connect an approved company mailbox next."
          : "Google Workspace configuration is incomplete.",
    config,
    schema: {
      migration: googleWorkspaceFoundationMigration,
      applied: schemaApplied,
      message:
        schemaApplied === true
          ? "Gmail foundation tables are available."
          : schemaApplied === false
            ? "Apply the Gmail Workspace foundation migration before connecting mailboxes."
            : "Schema readiness could not be checked.",
    },
    connectedMailboxCount,
    endpoints: googleWorkspaceEndpoints,
    guardrails: googleWorkspacePhaseOneGuardrails,
  };
}

export function createServiceSupabaseClient(): CrmClient | null {
  const url = getServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

export function hashGoogleOAuthState(state: string) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export function createGoogleOAuthState({
  randomBytes = (size: number) => crypto.randomBytes(size),
}: {
  randomBytes?: (size: number) => Buffer;
} = {}): GoogleOAuthState {
  const rawState = base64UrlEncode(randomBytes(32));
  const codeVerifier = base64UrlEncode(randomBytes(64));
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MINUTES * 60 * 1000).toISOString();

  return {
    rawState,
    stateHash: hashGoogleOAuthState(rawState),
    codeVerifier,
    codeChallenge,
    expiresAt,
  };
}

export function buildGoogleOAuthAuthorizationRequest({
  state,
  loginHint,
  scopes = googleWorkspaceSupportedScopes,
}: {
  state?: GoogleOAuthState;
  loginHint?: string | null;
  scopes?: string[];
}): GoogleOAuthAuthorizationRequest {
  const oauthState = state ?? createGoogleOAuthState();
  const clientId = getServerEnv(googleWorkspaceEnvVars.clientId);
  const redirectUri = getServerEnv(googleWorkspaceEnvVars.redirectUri);
  const workspaceDomain = getServerEnv(googleWorkspaceEnvVars.workspaceDomain);
  const params = new URLSearchParams({
    client_id: clientId ?? "",
    redirect_uri: redirectUri ?? "",
    response_type: "code",
    scope: scopes.join(" "),
    state: oauthState.rawState,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    code_challenge: oauthState.codeChallenge,
    code_challenge_method: "S256",
  });

  if (loginHint) {
    params.set("login_hint", loginHint);
  }

  if (workspaceDomain) {
    params.set("hd", workspaceDomain);
  }

  return {
    ...oauthState,
    authorizationUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    scopes: [...scopes],
  };
}

export function normalizeGmailEmailAddress(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const angleMatch = value.match(/<([^>]+)>/);
  const email = (angleMatch?.[1] ?? value).trim().toLowerCase();
  const emailMatch = email.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i);

  return emailMatch?.[0].toLowerCase() ?? null;
}

export function validateGoogleWorkspaceAccountDomain(emailAddress: string) {
  const configuredDomain = getServerEnv(googleWorkspaceEnvVars.workspaceDomain)
    ?.replace(/^@/, "")
    .toLowerCase();
  const normalizedEmail = normalizeGmailEmailAddress(emailAddress);
  const accountDomain = normalizedEmail?.split("@")[1] ?? null;

  if (!configuredDomain) {
    return {
      ok: true as const,
      restricted: false,
      message: "No Google Workspace domain restriction is configured.",
    };
  }

  if (accountDomain === configuredDomain) {
    return {
      ok: true as const,
      restricted: true,
      message: "The authorized Google account matches the configured Workspace domain.",
    };
  }

  return {
    ok: false as const,
    restricted: true,
    message: "The authorized Google account is outside the configured Workspace domain.",
  };
}

function normalizeEmailList(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .flatMap((value) => (value ?? "").split(","))
        .map((value) => normalizeGmailEmailAddress(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function getHeaderValue(message: GmailApiMessage, headerName: string) {
  const headers = message.payload?.headers ?? [];
  const match = headers.find(
    (header) =>
      typeof header.name === "string" &&
      header.name.toLowerCase() === headerName.toLowerCase(),
  );

  return typeof match?.value === "string" ? match.value : null;
}

function getMessageInternalDate(message: GmailApiMessage) {
  const rawInternalDate =
    typeof message.internalDate === "string" ? Number.parseInt(message.internalDate, 10) : NaN;

  if (Number.isFinite(rawInternalDate)) {
    return new Date(rawInternalDate).toISOString();
  }

  const dateHeader = getHeaderValue(message, "Date");
  const dateValue = dateHeader ? new Date(dateHeader) : null;

  return dateValue && Number.isFinite(dateValue.getTime())
    ? dateValue.toISOString()
    : new Date().toISOString();
}

function collectMessageParts(part: GmailMessagePart | undefined, output: GmailMessagePart[] = []) {
  if (!part) {
    return output;
  }

  output.push(part);

  for (const child of part.parts ?? []) {
    collectMessageParts(child, output);
  }

  return output;
}

function decodeMessagePart(part: GmailMessagePart) {
  const data = typeof part.body?.data === "string" ? part.body.data : null;
  return data ? base64UrlDecode(data) : "";
}

function sanitizePreview(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function extractGmailMessageText(message: GmailApiMessage) {
  const parts = collectMessageParts(message.payload);
  const textPart = parts.find((part) => part.mimeType === "text/plain" && part.body?.data);
  const htmlPart = parts.find((part) => part.mimeType === "text/html" && part.body?.data);
  const directText =
    message.payload?.mimeType === "text/plain" && message.payload.body?.data
      ? decodeMessagePart(message.payload)
      : null;

  return sanitizePreview(
    directText ?? (textPart ? decodeMessagePart(textPart) : htmlPart ? decodeMessagePart(htmlPart) : typeof message.snippet === "string" ? message.snippet : ""),
  );
}

export function extractGmailAttachmentMetadata({
  message,
  companyId,
  integrationConnectionId,
  emailMessageId = "pending",
}: {
  message: GmailApiMessage;
  companyId: string;
  integrationConnectionId: string;
  emailMessageId?: string;
}): GmailEmailAttachmentInsert[] {
  return collectMessageParts(message.payload)
    .filter((part) => {
      const fileName = typeof part.filename === "string" ? part.filename.trim() : "";
      return Boolean(fileName || part.body?.attachmentId);
    })
    .map((part) => ({
      company_id: companyId,
      integration_connection_id: integrationConnectionId,
      email_message_id: emailMessageId,
      gmail_attachment_id:
        typeof part.body?.attachmentId === "string" ? part.body.attachmentId : null,
      file_name:
        typeof part.filename === "string" && part.filename.trim()
          ? part.filename.trim().slice(0, 255)
          : "Gmail attachment",
      mime_type: typeof part.mimeType === "string" ? part.mimeType : null,
      size_bytes:
        typeof part.body?.size === "number" && Number.isFinite(part.body.size)
          ? part.body.size
          : null,
      content_disposition: getPartContentDisposition(part),
      metadata: {
        provider: "gmail",
        contentNotDownloaded: true,
      },
    }));
}

function getPartContentDisposition(part: GmailMessagePart) {
  const header = (part.headers ?? []).find(
    (item) =>
      typeof item.name === "string" &&
      item.name.toLowerCase() === "content-disposition",
  );

  return typeof header?.value === "string" ? header.value.slice(0, 255) : null;
}

function getRecordEmailCandidates(record: CustomerRecord | LeadRecord) {
  return normalizeEmailList(["email" in record ? record.email : null]);
}

export function findGmailCrmMatch({
  companyId,
  direction,
  mailboxEmail,
  fromEmail,
  toEmails,
  customers,
  leads,
  jobs,
  estimates,
}: {
  companyId: string;
  direction: "inbound" | "outbound";
  mailboxEmail: string;
  fromEmail: string | null;
  toEmails: string[];
  customers: CustomerRecord[];
  leads: LeadRecord[];
  jobs: JobRecord[];
  estimates: EstimateRecord[];
}): GmailCrmMatch {
  const contactEmails = direction === "inbound" ? [fromEmail] : toEmails;
  const normalizedContacts = new Set(normalizeEmailList(contactEmails));
  normalizedContacts.delete(mailboxEmail);

  const customer = customers.find(
    (candidate) =>
      candidate.company_id === companyId &&
      getRecordEmailCandidates(candidate).some((email) => normalizedContacts.has(email)),
  );

  if (customer) {
    const job = jobs.find(
      (candidate) =>
        candidate.company_id === companyId && candidate.customer_id === customer.id,
    );
    const estimate = estimates.find(
      (candidate) =>
        candidate.company_id === companyId && candidate.customer_id === customer.id,
    );

    return {
      customerId: customer.id,
      leadId: null,
      jobId: job?.id ?? null,
      estimateId: estimate?.id ?? null,
      propertyId: null,
      matchStatus: job ? "matched_job" : estimate ? "matched_estimate" : "matched_customer",
    };
  }

  const lead = leads.find(
    (candidate) =>
      candidate.company_id === companyId &&
      getRecordEmailCandidates(candidate).some((email) => normalizedContacts.has(email)),
  );

  if (lead) {
    return {
      customerId: lead.customer_id,
      leadId: lead.id,
      jobId: null,
      estimateId: null,
      propertyId: lead.property_id ?? null,
      matchStatus: "matched_lead",
    };
  }

  return {
    customerId: null,
    leadId: null,
    jobId: null,
    estimateId: null,
    propertyId: null,
    matchStatus: "unmatched",
  };
}

export function buildGmailMessageImportPlan({
  mailbox,
  message,
  snapshot,
  existingEmailMessages = snapshot.emailMessages,
}: {
  mailbox: GmailMailboxContext;
  message: GmailApiMessage;
  snapshot: Pick<
    CrmSnapshot,
    "customers" | "leads" | "jobs" | "estimates" | "emailMessages"
  >;
  existingEmailMessages?: EmailMessageRecord[];
}): GmailImportPlan {
  const messageId = typeof message.id === "string" ? message.id : null;
  const threadId = typeof message.threadId === "string" ? message.threadId : null;
  const historyId = typeof message.historyId === "string" ? message.historyId : null;
  const duplicate = Boolean(
    messageId &&
      existingEmailMessages.some(
        (candidate) =>
          candidate.integration_connection_id === mailbox.integrationConnectionId &&
          candidate.gmail_message_id === messageId,
      ),
  );
  const fromEmail = normalizeGmailEmailAddress(getHeaderValue(message, "From"));
  const toEmails = normalizeEmailList([
    getHeaderValue(message, "To"),
    getHeaderValue(message, "Delivered-To"),
  ]);
  const ccEmails = normalizeEmailList([getHeaderValue(message, "Cc")]);
  const replyToEmails = normalizeEmailList([getHeaderValue(message, "Reply-To")]);
  const mailboxEmail = normalizeGmailEmailAddress(mailbox.accountEmail) ?? mailbox.accountEmail;
  const direction =
    fromEmail && fromEmail === mailboxEmail.toLowerCase() ? "outbound" : "inbound";
  const subject = getHeaderValue(message, "Subject") ?? "(No subject)";
  const occurredAt = getMessageInternalDate(message);
  const sanitizedPreview = extractGmailMessageText(message);
  const attachments = extractGmailAttachmentMetadata({
    message,
    companyId: mailbox.companyId,
    integrationConnectionId: mailbox.integrationConnectionId,
  });
  const match = findGmailCrmMatch({
    companyId: mailbox.companyId,
    direction,
    mailboxEmail: mailboxEmail.toLowerCase(),
    fromEmail,
    toEmails,
    customers: snapshot.customers,
    leads: snapshot.leads,
    jobs: snapshot.jobs,
    estimates: snapshot.estimates,
  });
  const providerPayloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ messageId, threadId, historyId, subject, occurredAt }))
    .digest("hex");

  if (duplicate) {
    return {
      duplicate,
      duplicateReason: "A Gmail message with this provider id already exists for the mailbox.",
      messageId,
      threadId,
      historyId,
      direction,
      emailMessage: null,
      thread: null,
      attachments,
      match,
      sanitizedPreview,
      providerPayloadHash,
    };
  }

  const primaryToEmail =
    direction === "inbound"
      ? mailbox.accountEmail
      : toEmails[0] ?? mailbox.accountEmail;

  return {
    duplicate,
    duplicateReason: null,
    messageId,
    threadId,
    historyId,
    direction,
    emailMessage: {
      company_id: mailbox.companyId,
      customer_id: match.customerId,
      lead_id: match.leadId,
      job_id: match.jobId,
      property_id: match.propertyId,
      estimate_id: match.estimateId,
      invoice_id: null,
      document_id: null,
      integration_connection_id: mailbox.integrationConnectionId,
      provider: "gmail",
      category: "general",
      status: direction === "outbound" ? "sent" : "sent",
      direction,
      from_email: fromEmail,
      to_email: primaryToEmail,
      to_emails: toEmails,
      cc_email: ccEmails[0] ?? null,
      cc_emails: ccEmails,
      bcc_emails: [],
      reply_to_emails: replyToEmails,
      subject,
      body: sanitizedPreview,
      gmail_message_id: messageId,
      gmail_thread_id: threadId,
      provider_account_id: mailbox.providerAccountId,
      received_at: direction === "inbound" ? occurredAt : null,
      sent_at: direction === "outbound" ? occurredAt : null,
      message_preview: sanitizedPreview,
      has_attachments: attachments.length > 0,
      attachment_count: attachments.length,
      sync_status: "imported",
      imported_at: new Date().toISOString(),
      provider_payload_hash: providerPayloadHash,
      metadata: {
        gmailHistoryId: historyId,
        matchStatus: match.matchStatus,
        mailboxEmail: mailbox.accountEmail,
      },
      last_error: null,
    },
    thread: threadId
      ? {
          company_id: mailbox.companyId,
          integration_connection_id: mailbox.integrationConnectionId,
          customer_id: match.customerId,
          lead_id: match.leadId,
          job_id: match.jobId,
          estimate_id: match.estimateId,
          gmail_thread_id: threadId,
          subject,
          last_message_at: occurredAt,
          message_count: 1,
          last_direction: direction,
          match_status:
            match.matchStatus === "unmatched" ? "manual_review" : match.matchStatus,
          sync_status: "imported",
          metadata: {
            gmailHistoryId: historyId,
          },
        }
      : null,
    attachments,
    match,
    sanitizedPreview,
    providerPayloadHash,
  };
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildGmailHtmlBody(body: string) {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:16px">${paragraphs}</body></html>`;
}

function wrapBase64(value: Buffer) {
  return value
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
}

export function buildGmailRawMessage(
  message: EmailMessageRecord,
  attachments: GmailOutboundAttachment[] = [],
) {
  const alternativeBoundary = `wtos-alt-${crypto.randomBytes(12).toString("hex")}`;
  const mixedBoundary = `wtos-mixed-${crypto.randomBytes(12).toString("hex")}`;
  const recipients = message.to_emails?.length
    ? message.to_emails
    : [message.to_email];
  const ccRecipients = message.cc_emails?.length
    ? message.cc_emails
    : message.cc_email
      ? [message.cc_email]
      : [];
  const headers = [
    `To: ${recipients.map(sanitizeHeaderValue).join(", ")}`,
    ccRecipients.length
      ? `Cc: ${ccRecipients.map(sanitizeHeaderValue).join(", ")}`
      : null,
    message.bcc_emails?.length
      ? `Bcc: ${message.bcc_emails.map(sanitizeHeaderValue).join(", ")}`
      : null,
    message.reply_to_emails?.length
      ? `Reply-To: ${message.reply_to_emails.map(sanitizeHeaderValue).join(", ")}`
      : null,
    message.from_email ? `From: ${sanitizeHeaderValue(message.from_email)}` : null,
    `Subject: ${sanitizeHeaderValue(message.subject)}`,
    "MIME-Version: 1.0",
    attachments.length
      ? `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
      : `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
  ].filter((line): line is string => line !== null);
  const alternative = [
    `--${alternativeBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.body,
    `--${alternativeBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    buildGmailHtmlBody(message.body),
    `--${alternativeBoundary}--`,
  ];
  const mimeLines = attachments.length
    ? [
        ...headers,
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        "",
        ...alternative,
        ...attachments.flatMap((attachment) => [
          `--${mixedBoundary}`,
          `Content-Type: ${sanitizeHeaderValue(attachment.mimeType)}; name="${sanitizeHeaderValue(attachment.fileName)}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${sanitizeHeaderValue(attachment.fileName)}"`,
          "",
          wrapBase64(attachment.content),
        ]),
        `--${mixedBoundary}--`,
      ]
    : [...headers, ...alternative];

  return base64UrlEncode(Buffer.from(mimeLines.join("\r\n"), "utf8"));
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function safePdfFileName(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${normalized || "estimate"}.pdf`;
}

export function buildEstimatePdfAttachment({
  estimate,
  lineItems,
  companyName,
  customerName,
  fileName,
}: {
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  companyName: string;
  customerName: string | null;
  fileName?: string | null;
}): GmailOutboundAttachment {
  const money = (value: number) => `$${value.toFixed(2)}`;
  const lines = [
    companyName,
    estimate.title,
    customerName ? `Prepared for: ${customerName}` : null,
    `Estimate date: ${estimate.issue_date}`,
    "",
    ...lineItems.slice(0, 24).map(
      (item) => `${item.description}  ${item.quantity} ${item.unit}  ${money(item.total)}`,
    ),
    "",
    `Subtotal: ${money(estimate.subtotal)}`,
    `Tax: ${money(estimate.tax_total)}`,
    `Total: ${money(estimate.total)}`,
    estimate.notes ? `Notes: ${estimate.notes}` : null,
  ].filter((line): line is string => line !== null);
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 742 Td",
    ...lines.flatMap((line, index) => [
      ...(index ? ["0 -18 Td"] : []),
      `(${escapePdfText(line.slice(0, 110))}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return {
    fileName: fileName?.trim() || safePdfFileName(estimate.title),
    mimeType: "application/pdf",
    content: Buffer.from(pdf, "utf8"),
  };
}

export function validateGmailOwnerApproval({
  message,
  isOwner,
  approvalAction,
}: {
  message: EmailMessageRecord;
  isOwner: boolean;
  approvalAction: string | null;
}): GmailOwnerApprovalCheck {
  if ((message.direction ?? "outbound") !== "outbound") {
    return {
      ok: false,
      status: "outbound_required",
      message: "Only outbound WeatherTech OS email drafts can be approved for sending.",
    };
  }

  if (message.status === "sent") {
    return { ok: false, status: "already_sent", message: "This email was already sent." };
  }

  if (message.status !== "queued" || message.sync_status !== "queued") {
    return {
      ok: false,
      status: "approval_submission_required",
      message: "Submit this email for owner approval before confirming Gmail delivery.",
    };
  }

  if (!isOwner) {
    return {
      ok: false,
      status: "owner_required",
      message: "A company owner must approve every outbound customer email.",
    };
  }

  if (approvalAction !== "owner_approved_send") {
    return {
      ok: false,
      status: "explicit_approval_required",
      message: "Explicit owner approval is required before Gmail delivery.",
    };
  }

  return { ok: true, status: "approved", message: "Owner approval confirmed." };
}

export function validateGmailOutboundRecipients(
  message: EmailMessageRecord,
): GmailRecipientValidation {
  const toRecipients = message.to_emails?.length
    ? message.to_emails
    : message.to_email
      ? [message.to_email]
      : [];
  const optionalRecipients = [
    ...(message.cc_emails ?? []),
    ...(message.cc_email ? [message.cc_email] : []),
    ...(message.bcc_emails ?? []),
    ...(message.reply_to_emails ?? []),
  ];

  if (!toRecipients.length) {
    return { ok: false, message: "Add at least one valid recipient before sending." };
  }

  if (
    [...toRecipients, ...optionalRecipients].some(
      (recipient) => !normalizeGmailEmailAddress(recipient),
    )
  ) {
    return {
      ok: false,
      message: "Every To, Cc, Bcc, and Reply-To value must contain a valid email address.",
    };
  }

  return { ok: true, message: "Outbound recipients are valid." };
}

export function encryptionKeyIsConfigured() {
  return Boolean(getServerEnv(googleWorkspaceEnvVars.tokenEncryptionKey));
}

function getTokenCipherKey() {
  const key = getServerEnv(googleWorkspaceEnvVars.tokenEncryptionKey);

  if (!key) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required for Gmail token storage.");
  }

  return crypto.createHash("sha256").update(key).digest();
}

export function encryptGoogleToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTokenCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_ENCRYPTION_VERSION,
    base64UrlEncode(iv),
    base64UrlEncode(tag),
    base64UrlEncode(encrypted),
  ].join(":");
}

export function decryptGoogleToken(value: string) {
  const [version, encodedIv, encodedTag, encodedEncrypted] = value.split(":");

  if (version !== TOKEN_ENCRYPTION_VERSION || !encodedIv || !encodedTag || !encodedEncrypted) {
    throw new Error("Unsupported Gmail token format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getTokenCipherKey(),
    Buffer.from(encodedIv.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );
  decipher.setAuthTag(
    Buffer.from(encodedTag.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );

  return Buffer.concat([
    decipher.update(Buffer.from(encodedEncrypted.replace(/-/g, "+").replace(/_/g, "/"), "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function refreshGoogleAccessToken({
  refreshToken,
  fetchImpl = fetch,
}: {
  refreshToken: string | null;
  fetchImpl?: FetchLike;
}) {
  const config = getGoogleWorkspaceConfigCheckResult();
  const clientId = getServerEnv(googleWorkspaceEnvVars.clientId);
  const clientSecret = getServerEnv(googleWorkspaceEnvVars.clientSecret);

  if (!config.ok || !clientId || !clientSecret || !refreshToken) {
    return {
      ok: false as const,
      accessToken: null,
      expiresAt: null,
      tokenType: null,
      scope: null,
      error: "Google Workspace token refresh is not configured.",
    };
  }

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json()) as TokenRefreshResponse;

  if (!response.ok || typeof payload.access_token !== "string") {
    return {
      ok: false as const,
      accessToken: null,
      expiresAt: null,
      tokenType: null,
      scope: null,
      error:
        typeof payload.error_description === "string"
          ? payload.error_description
          : "Google token refresh failed.",
    };
  }

  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;

  return {
    ok: true as const,
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000 - ACCESS_TOKEN_EXPIRY_SKEW_MS).toISOString(),
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    scope: typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [],
    error: null,
  };
}

export async function exchangeGoogleOAuthCode({
  code,
  codeVerifier,
  fetchImpl = fetch,
}: {
  code: string;
  codeVerifier: string;
  fetchImpl?: FetchLike;
}) {
  const clientId = getServerEnv(googleWorkspaceEnvVars.clientId);
  const clientSecret = getServerEnv(googleWorkspaceEnvVars.clientSecret);
  const redirectUri = getServerEnv(googleWorkspaceEnvVars.redirectUri);

  if (!clientId || !clientSecret || !redirectUri) {
    return {
      ok: false as const,
      error: "Google OAuth configuration is incomplete.",
      payload: null,
    };
  }

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok || typeof payload.access_token !== "string") {
    return {
      ok: false as const,
      error:
        typeof payload.error_description === "string"
          ? payload.error_description
          : "Google OAuth code exchange failed.",
      payload,
    };
  }

  return {
    ok: true as const,
    error: null,
    payload,
  };
}

export async function fetchGmailProfile({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: FetchLike;
}) {
  const response = await fetchImpl(`${GMAIL_API_BASE_URL}/users/me/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const payload = (await response.json()) as {
    emailAddress?: unknown;
    messagesTotal?: unknown;
    threadsTotal?: unknown;
    historyId?: unknown;
  };

  if (!response.ok || typeof payload.emailAddress !== "string") {
    return {
      ok: false as const,
      error: "Could not load Gmail mailbox profile.",
      payload,
    };
  }

  return {
    ok: true as const,
    emailAddress: payload.emailAddress,
    providerAccountId: normalizeGmailEmailAddress(payload.emailAddress),
    historyId: typeof payload.historyId === "string" ? payload.historyId : null,
    payload,
  };
}

export async function sendGmailEmail({
  message,
  accessToken,
  attachments = [],
  fetchImpl = fetch,
}: {
  message: EmailMessageRecord | null;
  accessToken: string | null;
  attachments?: GmailOutboundAttachment[];
  fetchImpl?: FetchLike;
}): Promise<GmailSendResult> {
  if (!getGoogleWorkspaceConfigCheckResult().ok) {
    return {
      attempted: false,
      sent: false,
      status: "configuration_missing",
      message: "Google Workspace configuration is incomplete. No email was sent.",
    };
  }

  if (!getBooleanEnvValue(googleWorkspaceEnvVars.gmailSendEnabled)) {
    return {
      attempted: false,
      sent: false,
      status: "disabled",
      message:
        "No email was sent. GOOGLE_GMAIL_SEND_ENABLED must be explicitly enabled for controlled live sending.",
    };
  }

  if (!message) {
    return {
      attempted: false,
      sent: false,
      status: "missing_message",
      message: "No email message was provided.",
    };
  }

  if (!accessToken) {
    return {
      attempted: false,
      sent: false,
      status: "missing_token",
      message: "No authorized Gmail mailbox token is available. No email was sent.",
    };
  }

  try {
    const response = await fetchImpl(`${GMAIL_API_BASE_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: buildGmailRawMessage(message, attachments),
        threadId: message.gmail_thread_id ?? undefined,
      }),
    });
    const payload = (await response.json()) as GmailSendResponse;

    if (!response.ok) {
      return {
        attempted: true,
        sent: false,
        status: "failed",
        message: "Gmail send failed.",
        error:
          typeof payload.error?.message === "string"
            ? payload.error.message
            : "Gmail send API returned an error.",
      };
    }

    return {
      attempted: true,
      sent: true,
      status: "sent",
      message: "Gmail message sent.",
      gmailMessageId: typeof payload.id === "string" ? payload.id : null,
      gmailThreadId: typeof payload.threadId === "string" ? payload.threadId : null,
    };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      status: "failed",
      message: "Gmail send failed.",
      error: error instanceof Error ? error.message : "Gmail send API returned an error.",
    };
  }
}

export async function listGmailMessages({
  accessToken,
  historyId,
  fetchImpl = fetch,
}: {
  accessToken: string;
  historyId?: string | null;
  fetchImpl?: FetchLike;
}) {
  const params = new URLSearchParams({
    maxResults: "25",
  });

  if (historyId) {
    params.set("q", `newer:${Math.max(0, Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60)}`);
  }

  const response = await fetchImpl(`${GMAIL_API_BASE_URL}/users/me/messages?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    payload: (await response.json()) as Record<string, unknown>,
  };
}

export async function getGmailMessage({
  accessToken,
  messageId,
  fetchImpl = fetch,
}: {
  accessToken: string;
  messageId: string;
  fetchImpl?: FetchLike;
}) {
  const response = await fetchImpl(
    `${GMAIL_API_BASE_URL}/users/me/messages/${encodeURIComponent(
      messageId,
    )}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  return {
    ok: response.ok,
    status: response.status,
    payload: (await response.json()) as GmailApiMessage,
  };
}

export function summarizeGmailConnection(connection: IntegrationConnectionRecord) {
  return {
    id: connection.id,
    companyId: connection.company_id,
    status: connection.status,
    mailbox: connection.account_email ?? "Mailbox pending",
    providerAccountId: connection.provider_account_id ?? connection.external_account_id,
    lastSyncAt:
      connection.last_successful_sync_at ?? connection.last_sync_at ?? null,
    lastFailureAt: connection.last_failure_at ?? null,
    tokenExpiresAt: connection.token_expires_at ?? null,
    disabled: Boolean(connection.disabled_at || connection.status === "paused"),
  };
}

export function getCompanyMailboxLabel(company: CompanyRecord | null | undefined) {
  return company?.name ? `${company.name} Gmail mailbox` : "Company Gmail mailbox";
}
