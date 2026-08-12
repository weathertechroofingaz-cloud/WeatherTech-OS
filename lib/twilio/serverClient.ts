import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { twilioEnvVars } from "../crm/integrations";
import type { Database } from "../crm/types";
import { normalizeTwilioPhoneNumber } from "./webhooks";

export type TwilioConfigWarningCode =
  | "missing_from_number"
  | "missing_public_base_url"
  | "inbound_sms_disabled"
  | "outbound_sms_disabled";

export type TwilioConfigWarning = {
  code: TwilioConfigWarningCode;
  message: string;
};

export type TwilioMaskedConfig = {
  accountSid: string | null;
  authToken: string | null;
  apiKeySid: string | null;
  apiKeySecret: string | null;
  messagingServiceSid: string | null;
  fromNumber: string | null;
  publicBaseUrl: string | null;
};

export type TwilioBusinessNumberConfig = {
  key: "weathertech_phoenix" | "weathertech_tucson" | "ihc";
  label: string;
  company: "WeatherTech Roofing LLC" | "IHC Painting";
  envVar: string;
  configured: boolean;
  phoneNumber: string | null;
};

export type TwilioConfigStatus =
  | "configured"
  | "configured_with_warning"
  | "missing_config";

export type TwilioConfigCheckResult = {
  ok: boolean;
  status: TwilioConfigStatus;
  checkedAt: string;
  inboundReady: boolean;
  inboundSmsEnabled: boolean;
  outboundReady: boolean;
  outboundSmsEnabled: boolean;
  outboundLocked: true;
  missing: string[];
  warnings: TwilioConfigWarning[];
  credentials: TwilioMaskedConfig;
  businessNumbers: TwilioBusinessNumberConfig[];
  inboundWebhookUrl: string | null;
  messagesEndpoint: string;
};

export type TwilioTestSmsResult =
  | {
      attempted: false;
      sent: false;
      message: string;
    }
  | {
      attempted: true;
      sent: true;
      message: string;
      to: string;
      twilioMessageSid: string | null;
      twilioStatus: string | null;
    }
  | {
      attempted: true;
      sent: false;
      message: string;
      to: string;
      error: string;
    };

export type TwilioServerConfig = {
  accountSid: string | null;
  authToken: string | null;
  apiKeySid: string | null;
  apiKeySecret: string | null;
  messagingServiceSid: string | null;
  fromNumber: string | null;
  publicBaseUrl: string | null;
  inboundSmsEnabled: boolean;
  outboundSmsEnabled: boolean;
  businessNumbers: TwilioBusinessNumberConfig[];
};

export type TwilioExpectedBusinessNumber = {
  key: TwilioBusinessNumberConfig["key"];
  label: string;
  company: TwilioBusinessNumberConfig["company"];
  envVar: string;
  phoneNumberE164: string | null;
};

type TwilioServiceClient = SupabaseClient<Database>;

function getEnvValue(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

function maskSid(value: string | null, expectedPrefix: string) {
  if (!value) {
    return null;
  }

  return value.startsWith(expectedPrefix)
    ? `${expectedPrefix}****`
    : `${value.slice(0, 2)}****`;
}

function maskPhoneNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length <= 4) {
    return "****";
  }

  return `****${digits.slice(-4)}`;
}

function getBooleanEnvValue(name: string) {
  const value = getEnvValue(name)?.toLowerCase();

  return value === "true";
}

function getTwilioAccountSid() {
  const value = getEnvValue(twilioEnvVars.accountSid);

  return value && /^AC[0-9a-fA-F]{32}$/.test(value) ? value : null;
}

function getPublicBaseUrl() {
  const value = getEnvValue(twilioEnvVars.publicBaseUrl);

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getTwilioExpectedBusinessNumbers(): TwilioExpectedBusinessNumber[] {
  return [
    {
      key: "weathertech_phoenix",
      label: "WeatherTech Phoenix",
      company: "WeatherTech Roofing LLC",
      envVar: twilioEnvVars.weatherTechPhoenixNumber,
      phoneNumberE164: normalizeTwilioPhoneNumber(
        getEnvValue(twilioEnvVars.weatherTechPhoenixNumber),
      ),
    },
    {
      key: "weathertech_tucson",
      label: "WeatherTech Tucson",
      company: "WeatherTech Roofing LLC",
      envVar: twilioEnvVars.weatherTechTucsonNumber,
      phoneNumberE164: normalizeTwilioPhoneNumber(
        getEnvValue(twilioEnvVars.weatherTechTucsonNumber),
      ),
    },
    {
      key: "ihc",
      label: "IHC",
      company: "IHC Painting",
      envVar: twilioEnvVars.ihcNumber,
      phoneNumberE164: normalizeTwilioPhoneNumber(getEnvValue(twilioEnvVars.ihcNumber)),
    },
  ];
}

function getBusinessNumberConfig(): TwilioBusinessNumberConfig[] {
  return getTwilioExpectedBusinessNumbers().map((number) => ({
    key: number.key,
    label: number.label,
    company: number.company,
    envVar: number.envVar,
    configured: Boolean(number.phoneNumberE164),
    phoneNumber: maskPhoneNumber(number.phoneNumberE164),
  }));
}

export function getTwilioServerConfig(): TwilioServerConfig {
  return {
    accountSid: getTwilioAccountSid(),
    authToken: getEnvValue(twilioEnvVars.authToken),
    apiKeySid: getEnvValue(twilioEnvVars.apiKeySid),
    apiKeySecret: getEnvValue(twilioEnvVars.apiKeySecret),
    messagingServiceSid: getEnvValue(twilioEnvVars.messagingServiceSid),
    fromNumber: getEnvValue(twilioEnvVars.fromNumber),
    publicBaseUrl: getPublicBaseUrl(),
    inboundSmsEnabled: getBooleanEnvValue(twilioEnvVars.inboundSmsEnabled),
    outboundSmsEnabled: getBooleanEnvValue(twilioEnvVars.outboundSmsEnabled),
    businessNumbers: getBusinessNumberConfig(),
  };
}

export function createTwilioServiceClient(): TwilioServiceClient | null {
  const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getMissingConfig(config: TwilioServerConfig) {
  return [
    config.accountSid && /^AC[0-9a-fA-F]{32}$/.test(config.accountSid)
      ? null
      : twilioEnvVars.accountSid,
    config.authToken ? null : twilioEnvVars.authToken,
    config.messagingServiceSid && /^MG[0-9a-fA-F]{32}$/.test(config.messagingServiceSid)
      ? null
      : twilioEnvVars.messagingServiceSid,
    getInboundWebhookUrl(config) ? null : twilioEnvVars.publicBaseUrl,
  ].filter((value): value is string => Boolean(value));
}

function getConfigWarnings(config: TwilioServerConfig): TwilioConfigWarning[] {
  return [
    !config.fromNumber
      ? {
          code: "missing_from_number",
          message:
            "TWILIO_FROM_NUMBER is blank. Outbound sending requires a sender number after buying one or porting an existing business number.",
        }
      : null,
    !config.publicBaseUrl
      ? {
          code: "missing_public_base_url",
          message:
            "TWILIO_PUBLIC_BASE_URL is blank. Twilio webhooks need the deployed WeatherTech OS base URL.",
        }
      : null,
    !config.inboundSmsEnabled
      ? {
          code: "inbound_sms_disabled",
          message:
            "TWILIO_INBOUND_SMS_ENABLED is not true. Authenticated inbound SMS processing remains disabled.",
        }
      : null,
    !config.outboundSmsEnabled
      ? {
          code: "outbound_sms_disabled",
          message:
            "TWILIO_OUTBOUND_SMS_ENABLED is not true. Outbound SMS remains disabled for safety.",
        }
      : null,
  ].filter((warning): warning is TwilioConfigWarning => Boolean(warning));
}

function getMaskedConfig(config: TwilioServerConfig): TwilioMaskedConfig {
  return {
    accountSid: maskSid(config.accountSid, "AC"),
    authToken: config.authToken ? "****" : null,
    apiKeySid: maskSid(config.apiKeySid, "SK"),
    apiKeySecret: config.apiKeySecret ? "****" : null,
    messagingServiceSid: maskSid(config.messagingServiceSid, "MG"),
    fromNumber: maskPhoneNumber(config.fromNumber),
    publicBaseUrl: config.publicBaseUrl,
  };
}

function getMessagesEndpoint(config: TwilioServerConfig) {
  return twilioEnvVars.messagesEndpoint.replace(
    "{AccountSid}",
    config.accountSid
      ? maskSid(config.accountSid, "AC") ?? "{AccountSid}"
      : "{AccountSid}",
  );
}

function getInboundWebhookUrl(config: TwilioServerConfig) {
  if (!config.publicBaseUrl) {
    return null;
  }

  try {
    const baseUrl = new URL(config.publicBaseUrl);

    if (
      baseUrl.protocol !== "https:" ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      return null;
    }

    return new URL(
      twilioEnvVars.inboundSmsWebhookPath,
      `${baseUrl.origin}/`,
    ).toString();
  } catch {
    return null;
  }
}

export function normalizeTwilioTestRecipient(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const recipient = value.trim();

  return /^\+[1-9]\d{7,14}$/.test(recipient) ? recipient : null;
}

export function getTwilioConfigCheckResult(): TwilioConfigCheckResult {
  const config = getTwilioServerConfig();
  const missing = getMissingConfig(config);
  const ok = missing.length === 0;
  const warnings = getConfigWarnings(config);

  return {
    ok,
    status: ok
      ? warnings.length > 0
        ? "configured_with_warning"
        : "configured"
      : "missing_config",
    checkedAt: new Date().toISOString(),
    inboundReady: ok && config.inboundSmsEnabled,
    inboundSmsEnabled: config.inboundSmsEnabled,
    outboundReady: false,
    outboundSmsEnabled: config.outboundSmsEnabled,
    outboundLocked: true,
    missing,
    warnings,
    credentials: getMaskedConfig(config),
    businessNumbers: config.businessNumbers,
    inboundWebhookUrl: getInboundWebhookUrl(config),
    messagesEndpoint: getMessagesEndpoint(config),
  };
}

export async function sendTwilioTestSms({
  recipient,
  body: _body,
}: {
  recipient: string;
  body?: string;
}): Promise<TwilioTestSmsResult> {
  void recipient;

  return {
    attempted: false,
    sent: false,
    message:
      "Twilio outbound SMS is unavailable in the inbound-only production phase. No provider request was made.",
  };
}
