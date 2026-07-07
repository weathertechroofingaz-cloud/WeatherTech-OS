import { twilioEnvVars } from "../crm/integrations";

const DEFAULT_TEST_MESSAGE =
  "WeatherTech OS Twilio integration test. No customer message was sent.";

export type TwilioConfigWarningCode = "missing_from_number";

export type TwilioConfigWarning = {
  code: TwilioConfigWarningCode;
  message: string;
};

export type TwilioMaskedConfig = {
  accountSid: string | null;
  authToken: string | null;
  messagingServiceSid: string | null;
  fromNumber: string | null;
};

export type TwilioConfigStatus =
  | "configured"
  | "configured_with_warning"
  | "missing_config";

export type TwilioConfigCheckResult = {
  ok: boolean;
  status: TwilioConfigStatus;
  checkedAt: string;
  outboundReady: boolean;
  missing: string[];
  warnings: TwilioConfigWarning[];
  credentials: TwilioMaskedConfig;
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

type TwilioServerConfig = {
  accountSid: string | null;
  authToken: string | null;
  messagingServiceSid: string | null;
  fromNumber: string | null;
};

type TwilioMessageResponse = {
  sid?: unknown;
  status?: unknown;
  message?: unknown;
  error_message?: unknown;
  code?: unknown;
};

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

function getTwilioServerConfig(): TwilioServerConfig {
  return {
    accountSid: getEnvValue(twilioEnvVars.accountSid),
    authToken: getEnvValue(twilioEnvVars.authToken),
    messagingServiceSid: getEnvValue(twilioEnvVars.messagingServiceSid),
    fromNumber: getEnvValue(twilioEnvVars.fromNumber),
  };
}

function getMissingConfig(config: TwilioServerConfig) {
  return [
    config.accountSid ? null : twilioEnvVars.accountSid,
    config.authToken ? null : twilioEnvVars.authToken,
    config.messagingServiceSid ? null : twilioEnvVars.messagingServiceSid,
  ].filter((value): value is string => Boolean(value));
}

function getConfigWarnings(config: TwilioServerConfig): TwilioConfigWarning[] {
  if (config.fromNumber) {
    return [];
  }

  return [
    {
      code: "missing_from_number",
      message:
        "TWILIO_FROM_NUMBER is blank. Outbound sending requires a sender number after buying one or porting an existing business number.",
    },
  ];
}

function getMaskedConfig(config: TwilioServerConfig): TwilioMaskedConfig {
  return {
    accountSid: maskSid(config.accountSid, "AC"),
    authToken: config.authToken ? "****" : null,
    messagingServiceSid: maskSid(config.messagingServiceSid, "MG"),
    fromNumber: maskPhoneNumber(config.fromNumber),
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

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Twilio request failed.";
}

function getTwilioErrorMessage(body: TwilioMessageResponse, status: number) {
  const message =
    typeof body.message === "string"
      ? body.message
      : typeof body.error_message === "string"
        ? body.error_message
        : `Twilio returned HTTP ${status}.`;
  const code =
    typeof body.code === "number" || typeof body.code === "string"
      ? ` (${body.code})`
      : "";

  return `${message}${code}`;
}

function redactConfigValues(message: string, config: TwilioServerConfig) {
  const valuesToRedact = [
    config.accountSid,
    config.authToken,
    config.messagingServiceSid,
    config.fromNumber,
  ].filter((value): value is string => Boolean(value));

  return valuesToRedact.reduce((redactedMessage, value) => {
    return redactedMessage.split(value).join("****");
  }, message);
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
    outboundReady: ok && Boolean(config.fromNumber),
    missing,
    warnings,
    credentials: getMaskedConfig(config),
    messagesEndpoint: getMessagesEndpoint(config),
  };
}

export async function sendTwilioTestSms({
  recipient,
  body = DEFAULT_TEST_MESSAGE,
}: {
  recipient: string;
  body?: string;
}): Promise<TwilioTestSmsResult> {
  const config = getTwilioServerConfig();
  const missing = getMissingConfig(config);

  if (missing.length > 0) {
    return {
      attempted: true,
      sent: false,
      to: recipient,
      message: "Twilio test SMS was not sent because server configuration is incomplete.",
      error: `Missing ${missing.join(", ")}.`,
    };
  }

  const endpoint = twilioEnvVars.messagesEndpoint.replace(
    "{AccountSid}",
    encodeURIComponent(config.accountSid ?? ""),
  );
  const formBody = new URLSearchParams({
    To: recipient,
    MessagingServiceSid: config.messagingServiceSid ?? "",
    Body: body,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.accountSid}:${config.authToken}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });
    const responseBody = (await response.json().catch(() => ({}))) as TwilioMessageResponse;

    if (!response.ok) {
      return {
        attempted: true,
        sent: false,
        to: recipient,
        message: "Twilio rejected the test SMS request.",
        error: redactConfigValues(
          getTwilioErrorMessage(responseBody, response.status),
          config,
        ),
      };
    }

    return {
      attempted: true,
      sent: true,
      to: recipient,
      message: "Twilio accepted the test SMS request.",
      twilioMessageSid:
        typeof responseBody.sid === "string" ? maskSid(responseBody.sid, "SM") : null,
      twilioStatus: typeof responseBody.status === "string" ? responseBody.status : null,
    };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      to: recipient,
      message: "Twilio test SMS request failed before Twilio accepted it.",
      error: redactConfigValues(getSafeErrorMessage(error), config),
    };
  }
}
