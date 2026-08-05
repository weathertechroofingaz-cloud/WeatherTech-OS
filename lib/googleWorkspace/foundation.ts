import {
  gmailIdentityScopes,
  gmailScopes,
  googleCalendarScopes,
  googleWorkspaceEnvVars,
} from "../crm/integrations";

export type GoogleWorkspaceReadinessStatus =
  | "not_configured"
  | "configuration_required"
  | "backend_ready"
  | "connected"
  | "sync_disabled"
  | "send_disabled"
  | "error";

export const googleWorkspaceReadinessLabels: Record<
  GoogleWorkspaceReadinessStatus,
  string
> = {
  not_configured: "Not Configured",
  configuration_required: "Configuration Required",
  backend_ready: "Backend Ready",
  connected: "Connected",
  sync_disabled: "Sync Disabled",
  send_disabled: "Send Disabled",
  error: "Error",
};

export type GoogleWorkspaceMailboxTemplate = {
  key: "weathertech-primary" | "ihc-primary" | "user-mailbox";
  companyName: "WeatherTech Roofing LLC" | "IHC Painting" | "User mailbox";
  mailboxType: "company" | "user";
  description: string;
};

export const googleWorkspaceMailboxTemplates: GoogleWorkspaceMailboxTemplate[] = [
  {
    key: "weathertech-primary",
    companyName: "WeatherTech Roofing LLC",
    mailboxType: "company",
    description:
      "Connect a WeatherTech Roofing LLC mailbox for estimate, invoice, follow-up, and customer project email.",
  },
  {
    key: "ihc-primary",
    companyName: "IHC Painting",
    mailboxType: "company",
    description:
      "Connect an IHC Painting mailbox for painting estimate, production, and customer follow-up email.",
  },
  {
    key: "user-mailbox",
    companyName: "User mailbox",
    mailboxType: "user",
    description:
      "Future authorized user mailboxes can sync when company membership and owner approval allow it.",
  },
];

export type GoogleWorkspaceEndpoint = {
  id:
    | "oauth_start"
    | "oauth_callback"
    | "readiness"
    | "sync"
    | "send"
    | "calendar_discovery"
    | "calendar_sync"
    | "calendar_webhook";
  label: string;
  path: string;
  method: "GET" | "POST";
  liveEnabled: boolean;
  summary: string;
};

export const googleWorkspaceEndpoints: GoogleWorkspaceEndpoint[] = [
  {
    id: "oauth_start",
    label: "OAuth start",
    path: googleWorkspaceEnvVars.oauthStartEndpoint,
    method: "POST",
    liveEnabled: true,
    summary: "Creates a server-side state record and returns a Google OAuth authorization URL.",
  },
  {
    id: "oauth_callback",
    label: "OAuth callback",
    path: googleWorkspaceEnvVars.oauthCallbackPath,
    method: "GET",
    liveEnabled: true,
    summary: "Exchanges an OAuth code server-side and stores encrypted mailbox credentials.",
  },
  {
    id: "readiness",
    label: "Readiness check",
    path: googleWorkspaceEnvVars.readinessEndpoint,
    method: "GET",
    liveEnabled: true,
    summary: "Reports schema, environment, and mailbox readiness without exposing secrets.",
  },
  {
    id: "sync",
    label: "Manual Gmail sync",
    path: googleWorkspaceEnvVars.syncEndpoint,
    method: "POST",
    liveEnabled: true,
    summary: "Imports new Gmail message metadata through a connected mailbox.",
  },
  {
    id: "send",
    label: "Owner-approved Gmail send",
    path: googleWorkspaceEnvVars.sendEndpoint,
    method: "POST",
    liveEnabled: false,
    summary:
      "Refreshes the server-side OAuth token and sends only after an authorized company owner explicitly approves delivery and GOOGLE_GMAIL_SEND_ENABLED is enabled.",
  },
  {
    id: "calendar_discovery",
    label: "Calendar discovery",
    path: googleWorkspaceEnvVars.calendarDiscoveryEndpoint,
    method: "POST",
    liveEnabled: true,
    summary:
      "Discovers calendars available to an authorized Google account and stores safe metadata.",
  },
  {
    id: "calendar_sync",
    label: "Manual Calendar sync",
    path: googleWorkspaceEnvVars.calendarSyncEndpoint,
    method: "POST",
    liveEnabled: false,
    summary:
      "Creates or updates Google Calendar events only when GOOGLE_CALENDAR_WRITE_ENABLED is explicitly enabled.",
  },
  {
    id: "calendar_webhook",
    label: "Calendar webhook",
    path: googleWorkspaceEnvVars.calendarWebhookEndpoint,
    method: "POST",
    liveEnabled: false,
    summary:
      "Accepts future Google Calendar push notifications after owner-controlled public webhook configuration.",
  },
];

export const googleWorkspaceRequiredEnvVars = [
  googleWorkspaceEnvVars.clientId,
  googleWorkspaceEnvVars.clientSecret,
  googleWorkspaceEnvVars.redirectUri,
  googleWorkspaceEnvVars.tokenEncryptionKey,
] as const;

export const googleWorkspaceOptionalEnvVars = [
  googleWorkspaceEnvVars.publicBaseUrl,
  googleWorkspaceEnvVars.workspaceDomain,
  googleWorkspaceEnvVars.gmailSendEnabled,
  googleWorkspaceEnvVars.googleCalendarWriteEnabled,
] as const;

export const googleWorkspacePhaseOneGuardrails = [
  "OAuth codes, access tokens, refresh tokens, and Google client secrets stay server-side.",
  "Gmail access tokens are refreshed server-side before delivery; encrypted refresh credentials never enter browser code.",
  "Mailbox sync writes Gmail message metadata and sanitized previews into the existing CRM communication model.",
  "Unknown inbound Gmail messages are preserved for manual review rather than creating duplicate customers.",
  "Estimate, proposal, inspection, appointment, and AI-generated emails remain Supabase drafts until a company owner submits and explicitly approves them.",
  "Only an authorized company owner can send, and outbound Gmail remains disabled unless GOOGLE_GMAIL_SEND_ENABLED is explicitly enabled.",
  "Google Calendar writes remain disabled unless GOOGLE_CALENDAR_WRITE_ENABLED is explicitly enabled.",
  "Calendar discovery and sync use server-side OAuth tokens and never expose provider credentials to browser code.",
  "Automated tests use mocks and never connect to or send through a real Gmail account.",
];

export const googleWorkspaceSupportedScopes = [
  ...gmailIdentityScopes,
  ...gmailScopes,
  ...googleCalendarScopes,
];

export const googleWorkspaceFoundationMigration =
  "0027_gmail_workspace_email_foundation.sql";
