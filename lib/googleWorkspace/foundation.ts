import { gmailIdentityScopes, gmailScopes, googleWorkspaceEnvVars } from "../crm/integrations";

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
  id: "oauth_start" | "oauth_callback" | "readiness" | "sync" | "send";
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
    label: "Safe Gmail send",
    path: googleWorkspaceEnvVars.sendEndpoint,
    method: "POST",
    liveEnabled: false,
    summary:
      "Sends only when a connected mailbox exists and GOOGLE_GMAIL_SEND_ENABLED is explicitly enabled.",
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
] as const;

export const googleWorkspacePhaseOneGuardrails = [
  "OAuth codes, access tokens, refresh tokens, and Google client secrets stay server-side.",
  "Mailbox sync writes Gmail message metadata and sanitized previews into the existing CRM communication model.",
  "Unknown inbound Gmail messages are preserved for manual review rather than creating duplicate customers.",
  "Outbound Gmail send remains disabled unless GOOGLE_GMAIL_SEND_ENABLED is explicitly enabled.",
  "Automated tests use mocks and never connect to or send through a real Gmail account.",
];

export const googleWorkspaceSupportedScopes = [...gmailIdentityScopes, ...gmailScopes];

export const googleWorkspaceFoundationMigration =
  "0027_gmail_workspace_email_foundation.sql";
