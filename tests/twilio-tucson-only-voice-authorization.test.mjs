import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-twilio-tucson-only-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");
const envNames = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PUBLIC_BASE_URL",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_NUMBER",
  "TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER",
  "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO",
  "TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_WEATHERTECH_TUCSON_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
  "TWILIO_IHC_NUMBER",
  "TWILIO_IHC_PUBLIC_NUMBER",
  "TWILIO_IHC_VOICE_FORWARDING_ENABLED",
  "TWILIO_IHC_VOICE_FORWARD_TO",
  "TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
];
const envSnapshot = new Map(envNames.map((name) => [name, process.env[name]]));
let assertionCount = 0;

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function restoreEnvironment() {
  for (const [name, value] of envSnapshot) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function exactRouteFor(template, communicationChannel = template.communicationChannel) {
  return {
    routing_key: template.key,
    business_location: template.businessLocation,
    team_queue: template.teamQueue,
    lead_source: template.leadSource,
    communication_channel: communicationChannel,
    time_zone: template.timeZone,
  };
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/twilio/foundation.ts",
      "lib/twilio/serverClient.ts",
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
    { cwd, encoding: "utf8" },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Twilio Tucson-only modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const foundation = await import(
    pathToFileURL(join(outDir, "twilio", "foundation.js"))
  );
  const serverClient = await import(
    pathToFileURL(join(outDir, "twilio", "serverClient.js"))
  );

  const phoenixTemplate = foundation.getTwilioBusinessNumberRouteTemplate(
    "weathertech-phoenix",
  );
  const tucsonTemplate = foundation.getTwilioBusinessNumberRouteTemplate(
    "weathertech-tucson",
  );
  const ihcTemplate = foundation.getTwilioBusinessNumberRouteTemplate("ihc-primary");
  check(phoenixTemplate && tucsonTemplate && ihcTemplate, "All SMS routing identities remain declared");
  equal(phoenixTemplate.voiceHandling, "direct_carrier", "Phoenix voice stays with Verizon");
  equal(tucsonTemplate.voiceHandling, "twilio_forwarding", "Tucson is the sole Twilio voice route");
  equal(ihcTemplate.voiceHandling, "direct_carrier", "IHC voice stays with AT&T");

  equal(
    foundation.matchesTwilioBusinessRouteTemplate(
      exactRouteFor(phoenixTemplate, "sms_voice"),
      phoenixTemplate,
      "voice",
    ),
    false,
    "Phoenix database sms_voice drift cannot authorize Twilio Voice",
  );
  equal(
    foundation.matchesTwilioBusinessRouteTemplate(
      exactRouteFor(ihcTemplate, "sms_voice"),
      ihcTemplate,
      "voice",
    ),
    false,
    "IHC database sms_voice drift cannot authorize Twilio Voice",
  );
  equal(
    foundation.matchesTwilioBusinessRouteTemplate(
      exactRouteFor(tucsonTemplate, "sms_voice"),
      tucsonTemplate,
      "voice",
    ),
    true,
    "Only an exact Tucson sms_voice identity can authorize Twilio Voice",
  );
  equal(
    foundation.matchesTwilioBusinessRouteTemplate(
      exactRouteFor(phoenixTemplate, "sms_voice"),
      phoenixTemplate,
      "sms",
    ),
    false,
    "Phoenix sms_voice database drift must fail SMS readiness until restored to sms",
  );
  equal(
    foundation.matchesTwilioBusinessRouteTemplate(
      exactRouteFor(tucsonTemplate, "sms_voice"),
      tucsonTemplate,
      "sms",
    ),
    true,
    "Tucson inbound SMS remains valid on its reviewed sms_voice route",
  );
  equal(
    foundation.matchesTwilioBusinessRouteTemplate(
      exactRouteFor(ihcTemplate, "sms"),
      ihcTemplate,
      "sms",
    ),
    true,
    "IHC SMS routing remains unchanged",
  );

  process.env.TWILIO_ACCOUNT_SID = "AC11111111111111111111111111111111";
  process.env.TWILIO_AUTH_TOKEN = "test-only-auth-token";
  process.env.TWILIO_MESSAGING_SERVICE_SID =
    "MG11111111111111111111111111111111";
  process.env.TWILIO_PUBLIC_BASE_URL = "https://weathertech.example.test";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER = "+12025550101";
  process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER = "+12025550103";
  process.env.TWILIO_IHC_NUMBER = "+12025550104";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "+12025550112";
  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";

  // These retired values deliberately remain populated to prove stale Production
  // configuration cannot recreate a Phoenix or IHC Voice route.
  process.env.TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER = "+12025550102";
  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO = "+12025550111";
  process.env.TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED =
    "true";
  process.env.TWILIO_IHC_PUBLIC_NUMBER = "+12025550105";
  process.env.TWILIO_IHC_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_IHC_VOICE_FORWARD_TO = "+12025550113";
  process.env.TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";

  const expectedNumbers = serverClient.getTwilioExpectedBusinessNumbers();
  assert.deepEqual(
    expectedNumbers.map(({ routeKey, communicationChannel, voiceHandling }) => ({
      routeKey,
      communicationChannel,
      voiceHandling,
    })),
    [
      {
        routeKey: "weathertech-phoenix",
        communicationChannel: "sms",
        voiceHandling: "direct_carrier",
      },
      {
        routeKey: "weathertech-tucson",
        communicationChannel: "sms_voice",
        voiceHandling: "twilio_forwarding",
      },
      {
        routeKey: "ihc-primary",
        communicationChannel: "sms",
        voiceHandling: "direct_carrier",
      },
    ],
    "Expected business numbers preserve three SMS identities and one Voice identity",
  );
  assertionCount += 1;

  const config = serverClient.getTwilioServerConfig();
  equal(config.voiceForwarding.routes.length, 1, "Runtime exposes exactly one Twilio Voice route");
  equal(
    config.voiceForwarding.routes[0]?.routeKey,
    "weathertech-tucson",
    "The only runtime Voice route is WeatherTech Tucson",
  );
  equal(config.voiceForwarding.graphValid, true, "The Tucson terminal graph is acyclic");
  equal(config.voiceForwarding.sharedDestination, false, "No multi-route terminal topology remains");

  const readiness = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey: {
      "weathertech-phoenix": true,
      "weathertech-tucson": true,
      "ihc-primary": true,
    },
  });
  equal(readiness.routes.length, 1, "Voice readiness returns one Tucson route");
  equal(readiness.routes[0]?.routeKey, "weathertech-tucson", "Voice readiness cannot expose Phoenix or IHC");
  equal(readiness.routes[0]?.ready, true, "Exact protected Tucson configuration is ready");
  check(
    !readiness.routes.some(
      (route) => route.routeKey === "weathertech-phoenix" || route.routeKey === "ihc-primary",
    ),
    "Stale legacy environment values cannot recreate retired Voice readiness routes",
  );

  for (const [protectedIngress, label] of [
    [process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER, "Phoenix"],
    [process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER, "Tucson"],
    [process.env.TWILIO_IHC_NUMBER, "IHC"],
  ]) {
    process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = protectedIngress;
    const collision = serverClient.getTwilioVoiceForwardingCheckResult({
      routeExactByKey: { "weathertech-tucson": true },
    });
    equal(collision.graphValid, false, `${label} Twilio ingress remains a protected graph node`);
    equal(collision.routes[0]?.loopDetected, true, `${label} ingress collision is attributed to Tucson`);
    equal(collision.routes[0]?.ready, false, `${label} ingress collision blocks Tucson Voice`);
  }

  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "+12025550112";
  process.env.TWILIO_IHC_NUMBER = process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER;
  const duplicateIngress = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey: { "weathertech-tucson": true },
  });
  equal(duplicateIngress.graphValid, false, "Duplicate SMS ingress identity invalidates the Tucson graph");
  equal(duplicateIngress.routes[0]?.ready, false, "A duplicate ingress fails Tucson closed");

  console.log(`Twilio Tucson-only Voice authorization assertions passed: ${assertionCount}`);
} finally {
  restoreEnvironment();
  rmSync(outDir, { recursive: true, force: true });
}
