import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { twilioEnvVars } from "../crm/integrations";
import type { Database } from "../crm/types";
import {
  getTwilioBusinessNumberRouteTemplate,
  type TwilioBusinessNumberRouteTemplate,
  type TwilioBusinessRouteKey,
} from "./foundation";

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
  routeKey: TwilioBusinessRouteKey;
  label: string;
  company: "WeatherTech Roofing LLC" | "IHC Painting";
  businessLocation: TwilioBusinessNumberRouteTemplate["businessLocation"];
  teamQueue: string;
  leadSource: string;
  communicationChannel: TwilioBusinessNumberRouteTemplate["communicationChannel"];
  timeZone: TwilioBusinessNumberRouteTemplate["timeZone"];
  envVar: string;
  configured: boolean;
  phoneNumber: string | null;
};

export type TwilioTucsonVoiceForwardingServerConfig = {
  enabled: boolean;
  tucsonNumberE164: string | null;
  destinationPresent: boolean;
  destinationE164: string | null;
  loopDetected: boolean;
  statusCallbackUrl: string | null;
  configurationReady: boolean;
};

export type TwilioVoiceRouteServerConfig = {
  routeKey: TwilioBusinessRouteKey;
  label: string;
  company: TwilioBusinessNumberConfig["company"];
  enabled: boolean;
  ingressPresent: boolean;
  ingressNumberE164: string | null;
  publicSourceRequired: boolean;
  publicSourcePresent: boolean;
  publicSourceE164: string | null;
  destinationPresent: boolean;
  destinationE164: string | null;
  loopDetected: boolean;
  terminalForwardingAttestationRequired: boolean;
  terminalForwardingDisabledConfirmed: boolean;
  configurationReady: boolean;
};

export type TwilioVoiceForwardingServerConfig = {
  webhookUrl: string | null;
  statusCallbackUrl: string | null;
  graphValid: boolean;
  /** Informational only; true when Phoenix and IHC use one explicit shared sink. */
  sharedDestination: boolean;
  /** Aggregate compatibility state for valid, independently attested configured terminals. */
  terminalForwardingDisabledConfirmed: boolean;
  routes: TwilioVoiceRouteServerConfig[];
};

export type TwilioVoiceRouteCheckResult = {
  routeKey: TwilioBusinessRouteKey;
  label: string;
  enabled: boolean;
  ingressConfigured: boolean;
  maskedIngressNumber: string | null;
  publicSourceRequired: boolean;
  publicSourceConfigured: boolean;
  publicSourceValid: boolean;
  maskedPublicSource: string | null;
  destinationConfigured: boolean;
  destinationValid: boolean;
  maskedDestination: string | null;
  loopDetected: boolean;
  terminalForwardingAttestationRequired: boolean;
  terminalForwardingDisabledConfirmed: boolean;
  routeExact: boolean;
  ready: boolean;
  nextAction: string;
};

export type TwilioVoiceForwardingCheckResult = {
  webhookUrl: string | null;
  statusCallbackUrl: string | null;
  graphValid: boolean;
  /** Informational only; route activation does not require one shared destination. */
  sharedDestination: boolean;
  /** Aggregate compatibility state; route readiness uses its route-specific value. */
  terminalForwardingDisabledConfirmed: boolean;
  routes: TwilioVoiceRouteCheckResult[];
};

export type TwilioTucsonVoiceForwardingCheckResult = {
  enabled: boolean;
  destinationConfigured: boolean;
  destinationValid: boolean;
  maskedDestination: string | null;
  loopDetected: boolean;
  routeExact: boolean;
  ready: boolean;
  webhookUrl: string | null;
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
  voiceForwarding: TwilioVoiceForwardingServerConfig;
  tucsonVoiceForwarding: TwilioTucsonVoiceForwardingServerConfig;
  businessNumbers: TwilioBusinessNumberConfig[];
};

export type TwilioExpectedBusinessNumber = {
  key: TwilioBusinessNumberConfig["key"];
  label: string;
  company: TwilioBusinessNumberConfig["company"];
  routeKey: TwilioBusinessRouteKey;
  businessLocation: TwilioBusinessNumberRouteTemplate["businessLocation"];
  teamQueue: string;
  leadSource: string;
  communicationChannel: TwilioBusinessNumberRouteTemplate["communicationChannel"];
  timeZone: TwilioBusinessNumberRouteTemplate["timeZone"];
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

function getStrictE164EnvValue(name: string) {
  const value = getEnvValue(name);

  return value && /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
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
  const configuredNumbers = [
    {
      key: "weathertech_phoenix",
      routeKey: "weathertech-phoenix",
      label: "WeatherTech Phoenix",
      company: "WeatherTech Roofing LLC",
      envVar: twilioEnvVars.weatherTechPhoenixNumber,
      phoneNumberE164: getStrictE164EnvValue(
        twilioEnvVars.weatherTechPhoenixNumber,
      ),
    },
    {
      key: "weathertech_tucson",
      routeKey: "weathertech-tucson",
      label: "WeatherTech Tucson",
      company: "WeatherTech Roofing LLC",
      envVar: twilioEnvVars.weatherTechTucsonNumber,
      phoneNumberE164: getStrictE164EnvValue(
        twilioEnvVars.weatherTechTucsonNumber,
      ),
    },
    {
      key: "ihc",
      routeKey: "ihc-primary",
      label: "IHC",
      company: "IHC Painting",
      envVar: twilioEnvVars.ihcNumber,
      phoneNumberE164: getStrictE164EnvValue(twilioEnvVars.ihcNumber),
    },
  ] as const;

  return configuredNumbers.map((number) => {
    const template = getTwilioBusinessNumberRouteTemplate(number.routeKey);

    if (!template) {
      throw new Error(`Missing Twilio route template for ${number.routeKey}.`);
    }

    return {
      ...number,
      businessLocation: template.businessLocation,
      teamQueue: template.teamQueue,
      leadSource: template.leadSource,
      communicationChannel: template.communicationChannel,
      timeZone: template.timeZone,
    };
  });
}

function getBusinessNumberConfig(): TwilioBusinessNumberConfig[] {
  return getTwilioExpectedBusinessNumbers().map((number) => ({
    key: number.key,
    routeKey: number.routeKey,
    label: number.label,
    company: number.company,
    businessLocation: number.businessLocation,
    teamQueue: number.teamQueue,
    leadSource: number.leadSource,
    communicationChannel: number.communicationChannel,
    timeZone: number.timeZone,
    envVar: number.envVar,
    configured: Boolean(number.phoneNumberE164),
    phoneNumber: maskPhoneNumber(number.phoneNumberE164),
  }));
}

const twilioVoiceRouteEnvDefinitions = [
  {
    routeKey: "weathertech-phoenix",
    enabledEnv: twilioEnvVars.weatherTechPhoenixVoiceForwardingEnabled,
    destinationEnv: twilioEnvVars.weatherTechPhoenixVoiceForwardTo,
    publicSourceEnv: twilioEnvVars.weatherTechPhoenixPublicNumber,
    terminalAttestationEnv:
      twilioEnvVars.weatherTechPhoenixTerminalForwardingDisabledConfirmed,
  },
  {
    routeKey: "weathertech-tucson",
    enabledEnv: twilioEnvVars.weatherTechTucsonVoiceForwardingEnabled,
    destinationEnv: twilioEnvVars.weatherTechTucsonVoiceForwardTo,
    publicSourceEnv: null,
    terminalAttestationEnv:
      twilioEnvVars.voiceTerminalForwardingDisabledConfirmed,
  },
  {
    routeKey: "ihc-primary",
    enabledEnv: twilioEnvVars.ihcVoiceForwardingEnabled,
    destinationEnv: twilioEnvVars.ihcVoiceForwardTo,
    publicSourceEnv: twilioEnvVars.ihcPublicNumber,
    terminalAttestationEnv:
      twilioEnvVars.ihcTerminalForwardingDisabledConfirmed,
  },
] as const satisfies ReadonlyArray<{
  routeKey: TwilioBusinessRouteKey;
  enabledEnv: string;
  destinationEnv: string;
  publicSourceEnv: string | null;
  terminalAttestationEnv: string;
}>;

function countConfiguredValue(values: Array<string | null>, expected: string) {
  return values.filter((value) => value === expected).length;
}

export function getTwilioServerConfig(): TwilioServerConfig {
  const accountSid = getTwilioAccountSid();
  const authToken = getEnvValue(twilioEnvVars.authToken);
  const messagingServiceSid = getEnvValue(twilioEnvVars.messagingServiceSid);
  const publicBaseUrl = getPublicBaseUrl();
  const outboundSmsEnabled = getBooleanEnvValue(twilioEnvVars.outboundSmsEnabled);
  const businessNumbers = getBusinessNumberConfig();
  const expectedBusinessNumbers = getTwilioExpectedBusinessNumbers();
  const webhookUrl = getTwilioWebhookUrl(
    publicBaseUrl,
    twilioEnvVars.voiceWebhookPath,
  );
  const statusCallbackUrl = getTwilioWebhookUrl(
    publicBaseUrl,
    twilioEnvVars.voiceStatusCallbackPath,
  );
  const routeDrafts = twilioVoiceRouteEnvDefinitions.map((definition) => {
    const expected = expectedBusinessNumbers.find(
      (number) => number.routeKey === definition.routeKey,
    );
    if (!expected) {
      throw new Error(`Missing expected Twilio number for ${definition.routeKey}.`);
    }
    const ingressRaw = getEnvValue(expected.envVar);
    const ingressNumberE164 = expected.phoneNumberE164;
    const destinationRaw = getEnvValue(definition.destinationEnv);
    const destinationE164 = getStrictE164EnvValue(definition.destinationEnv);
    const publicSourceRaw = definition.publicSourceEnv
      ? getEnvValue(definition.publicSourceEnv)
      : ingressRaw;
    const publicSourceE164 = definition.publicSourceEnv
      ? getStrictE164EnvValue(definition.publicSourceEnv)
      : ingressNumberE164;

    return {
      routeKey: definition.routeKey,
      label: expected.label,
      company: expected.company,
      enabled: getBooleanEnvValue(definition.enabledEnv),
      ingressPresent: Boolean(ingressRaw),
      ingressNumberE164,
      publicSourceRequired: Boolean(definition.publicSourceEnv),
      publicSourcePresent: Boolean(publicSourceRaw),
      publicSourceE164,
      destinationPresent: Boolean(destinationRaw),
      destinationE164,
      terminalForwardingDisabledConfirmed: getBooleanEnvValue(
        definition.terminalAttestationEnv,
      ),
    };
  });
  const ingressNumbers = routeDrafts.map((route) => route.ingressNumberE164);
  const publicSourceNumbers = routeDrafts.map((route) => route.publicSourceE164);
  const protectedSourceNodes = new Set(
    [...ingressNumbers, ...publicSourceNumbers].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const tucsonTerminal = routeDrafts.find(
    (route) => route.routeKey === "weathertech-tucson",
  )?.destinationE164;
  const tucsonTerminalCollisionRouteKeys = new Set<TwilioBusinessRouteKey>();
  if (tucsonTerminal) {
    for (const route of routeDrafts) {
      if (
        route.routeKey !== "weathertech-tucson" &&
        route.destinationE164 === tucsonTerminal
      ) {
        tucsonTerminalCollisionRouteKeys.add("weathertech-tucson");
        tucsonTerminalCollisionRouteKeys.add(route.routeKey);
      }
    }
  }
  const routeLoopStates = routeDrafts.map((route) => {
    const ingressDuplicated = Boolean(
      route.ingressNumberE164 &&
        countConfiguredValue(ingressNumbers, route.ingressNumberE164) !== 1,
    );
    const publicSourceDuplicated = Boolean(
      route.publicSourceRequired &&
        route.publicSourceE164 &&
        countConfiguredValue(publicSourceNumbers, route.publicSourceE164) !== 1,
    );
    const publicSourceMatchesIngress = Boolean(
      route.publicSourceRequired &&
        route.publicSourceE164 &&
        ingressNumbers.includes(route.publicSourceE164),
    );
    const destinationMatchesProtectedSource = Boolean(
      route.destinationE164 && protectedSourceNodes.has(route.destinationE164),
    );

    return (
      ingressDuplicated ||
      publicSourceDuplicated ||
      publicSourceMatchesIngress ||
      destinationMatchesProtectedSource ||
      tucsonTerminalCollisionRouteKeys.has(route.routeKey)
    );
  });
  const graphValid = routeLoopStates.every((loopDetected) => !loopDetected);
  const carrierRouteDestinations = routeDrafts
    .filter((route) => route.routeKey !== "weathertech-tucson")
    .map((route) => route.destinationE164)
    .filter((value): value is string => Boolean(value));
  const sharedDestination =
    carrierRouteDestinations.length === 2 &&
    new Set(carrierRouteDestinations).size === 1;
  const voiceRoutes: TwilioVoiceRouteServerConfig[] = routeDrafts.map(
    (route, index) => {
      const terminalForwardingAttestationRequired = true;
      const publicSourceReady =
        !route.publicSourceRequired ||
        (route.publicSourcePresent && Boolean(route.publicSourceE164));
      const loopDetected = routeLoopStates[index];

      return {
        ...route,
        loopDetected,
        terminalForwardingAttestationRequired,
        configurationReady: Boolean(
          route.enabled &&
            accountSid &&
            authToken &&
            messagingServiceSid &&
            /^MG[0-9a-fA-F]{32}$/.test(messagingServiceSid) &&
            publicBaseUrl &&
            webhookUrl &&
            statusCallbackUrl &&
            route.ingressPresent &&
            route.ingressNumberE164 &&
            publicSourceReady &&
            route.destinationPresent &&
            route.destinationE164 &&
            graphValid &&
            route.terminalForwardingDisabledConfirmed &&
            !outboundSmsEnabled
        ),
      };
    },
  );
  const configuredTerminalRoutes = voiceRoutes.filter(
    (route) => route.destinationPresent,
  );
  const terminalForwardingDisabledConfirmed =
    configuredTerminalRoutes.length > 0 &&
    configuredTerminalRoutes.every(
      (route) =>
        Boolean(route.destinationE164) &&
        route.terminalForwardingDisabledConfirmed,
    );
  const tucsonVoiceRoute = voiceRoutes.find(
    (route) => route.routeKey === "weathertech-tucson",
  );
  if (!tucsonVoiceRoute) {
    throw new Error("Missing WeatherTech Tucson voice route configuration.");
  }

  return {
    accountSid,
    authToken,
    apiKeySid: getEnvValue(twilioEnvVars.apiKeySid),
    apiKeySecret: getEnvValue(twilioEnvVars.apiKeySecret),
    messagingServiceSid,
    fromNumber: getEnvValue(twilioEnvVars.fromNumber),
    publicBaseUrl,
    inboundSmsEnabled: getBooleanEnvValue(twilioEnvVars.inboundSmsEnabled),
    outboundSmsEnabled,
    voiceForwarding: {
      webhookUrl,
      statusCallbackUrl,
      graphValid,
      sharedDestination,
      terminalForwardingDisabledConfirmed,
      routes: voiceRoutes,
    },
    tucsonVoiceForwarding: {
      enabled: tucsonVoiceRoute.enabled,
      tucsonNumberE164: tucsonVoiceRoute.ingressNumberE164,
      destinationPresent: tucsonVoiceRoute.destinationPresent,
      destinationE164: tucsonVoiceRoute.destinationE164,
      loopDetected: tucsonVoiceRoute.loopDetected,
      statusCallbackUrl,
      configurationReady: tucsonVoiceRoute.configurationReady,
    },
    businessNumbers,
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

function getTwilioWebhookUrl(
  publicBaseUrl: string | null,
  path: string,
) {
  if (!publicBaseUrl) {
    return null;
  }

  try {
    return new URL(path, `${publicBaseUrl}/`).toString();
  } catch {
    return null;
  }
}

function getTwilioVoiceRouteNextAction(
  route: TwilioVoiceRouteServerConfig,
  routeExact: boolean,
  config: TwilioServerConfig,
) {
  if (!route.ingressPresent || !route.ingressNumberE164) {
    return `Configure the exact ${route.label} Twilio ingress in protected server configuration.`;
  }
  if (
    route.publicSourceRequired &&
    (!route.publicSourcePresent || !route.publicSourceE164)
  ) {
    return `Configure the existing ${route.label} public carrier source in protected server configuration.`;
  }
  if (!route.destinationPresent || !route.destinationE164) {
    return `Configure the ${route.label} terminal destination in protected server configuration.`;
  }
  if (!config.voiceForwarding.graphValid || route.loopDetected) {
    return "Correct the protected routing graph so no destination or carrier source can re-enter a Twilio ingress.";
  }
  if (
    route.terminalForwardingAttestationRequired &&
    !route.terminalForwardingDisabledConfirmed
  ) {
    return `Verify every forwarding path on the ${route.label} terminal line is disabled, then record that route's protected owner attestation.`;
  }
  if (config.outboundSmsEnabled) {
    return "Disable outbound SMS before enabling inbound voice forwarding.";
  }
  if (!routeExact) {
    return `Verify the exact active ${route.label} database route has sms_voice capability.`;
  }
  if (!route.enabled) {
    return `Keep the ${route.label} forwarding gate false until the owner-controlled provider and carrier activation step.`;
  }
  if (!config.voiceForwarding.webhookUrl || !config.voiceForwarding.statusCallbackUrl) {
    return "Configure the canonical HTTPS Twilio public base URL.";
  }
  if (route.configurationReady) {
    return `The ${route.label} application route is ready for owner-controlled Twilio and carrier setup.`;
  }
  return `Complete the protected ${route.label} voice configuration before activation.`;
}

export function getTwilioVoiceForwardingCheckResult({
  routeExactByKey,
  config = getTwilioServerConfig(),
}: {
  routeExactByKey: Partial<Record<TwilioBusinessRouteKey, boolean>>;
  config?: TwilioServerConfig;
}): TwilioVoiceForwardingCheckResult {
  return {
    webhookUrl: config.voiceForwarding.webhookUrl,
    statusCallbackUrl: config.voiceForwarding.statusCallbackUrl,
    graphValid: config.voiceForwarding.graphValid,
    sharedDestination: config.voiceForwarding.sharedDestination,
    terminalForwardingDisabledConfirmed:
      config.voiceForwarding.terminalForwardingDisabledConfirmed,
    routes: config.voiceForwarding.routes.map((route) => {
      const routeExact = routeExactByKey[route.routeKey] === true;
      const ready = route.configurationReady && routeExact;

      return {
        routeKey: route.routeKey,
        label: route.label,
        enabled: route.enabled,
        ingressConfigured: Boolean(route.ingressNumberE164),
        maskedIngressNumber: maskPhoneNumber(route.ingressNumberE164),
        publicSourceRequired: route.publicSourceRequired,
        publicSourceConfigured: route.publicSourcePresent,
        publicSourceValid: Boolean(route.publicSourceE164),
        maskedPublicSource: maskPhoneNumber(route.publicSourceE164),
        destinationConfigured: route.destinationPresent,
        destinationValid: Boolean(route.destinationE164),
        maskedDestination: maskPhoneNumber(route.destinationE164),
        loopDetected: route.loopDetected,
        terminalForwardingAttestationRequired:
          route.terminalForwardingAttestationRequired,
        terminalForwardingDisabledConfirmed:
          route.terminalForwardingDisabledConfirmed,
        routeExact,
        ready,
        nextAction: getTwilioVoiceRouteNextAction(route, routeExact, config),
      };
    }),
  };
}

export function getTwilioTucsonVoiceForwardingCheckResult({
  routeExact,
  config = getTwilioServerConfig(),
}: {
  routeExact: boolean;
  config?: TwilioServerConfig;
}): TwilioTucsonVoiceForwardingCheckResult {
  const voiceReadiness = getTwilioVoiceForwardingCheckResult({
    routeExactByKey: { "weathertech-tucson": routeExact },
    config,
  });
  const tucson = voiceReadiness.routes.find(
    (route) => route.routeKey === "weathertech-tucson",
  );
  if (!tucson) {
    throw new Error("Missing WeatherTech Tucson voice readiness result.");
  }

  return {
    enabled: tucson.enabled,
    destinationConfigured: tucson.destinationConfigured,
    destinationValid: tucson.destinationValid,
    maskedDestination: tucson.maskedDestination,
    loopDetected: tucson.loopDetected,
    routeExact: tucson.routeExact,
    ready: tucson.ready,
    webhookUrl: voiceReadiness.webhookUrl,
  };
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
