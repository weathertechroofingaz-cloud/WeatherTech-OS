import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-twilio-distinct-terminals-"));
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
      `Could not compile Twilio distinct-terminal modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const serverClient = await import(
    pathToFileURL(join(outDir, "twilio", "serverClient.js"))
  );

  process.env.TWILIO_ACCOUNT_SID = "AC11111111111111111111111111111111";
  process.env.TWILIO_AUTH_TOKEN = "test-only-auth-token";
  process.env.TWILIO_MESSAGING_SERVICE_SID =
    "MG11111111111111111111111111111111";
  process.env.TWILIO_PUBLIC_BASE_URL = "https://weathertech.example.test";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER = "+12025550101";
  process.env.TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER = "+12025550102";
  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO = "+12025550111";
  process.env.TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED =
    "true";
  process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER = "+12025550103";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "+12025550112";
  process.env.TWILIO_IHC_NUMBER = "+12025550104";
  process.env.TWILIO_IHC_PUBLIC_NUMBER = "+12025550105";
  process.env.TWILIO_IHC_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_IHC_VOICE_FORWARD_TO = "+12025550113";
  process.env.TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";
  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";

  const routeExactByKey = {
    "weathertech-phoenix": true,
    "weathertech-tucson": true,
    "ihc-primary": true,
  };
  const distinctCheck = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey,
  });

  equal(distinctCheck.graphValid, true, "Distinct protected terminals keep the graph acyclic");
  equal(
    distinctCheck.sharedDestination,
    false,
    "Shared-destination state remains informational for distinct terminals",
  );
  equal(
    distinctCheck.terminalForwardingDisabledConfirmed,
    true,
    "The aggregate attestation passes when every configured terminal is valid and independently attested",
  );
  for (const route of distinctCheck.routes) {
    equal(route.loopDetected, false, `${route.label} has no protected-node collision`);
    equal(route.destinationValid, true, `${route.label} has a strict E.164 terminal`);
    equal(route.ready, true, `${route.label} can activate with its own terminal`);
  }
  assert.deepEqual(
    distinctCheck.routes.map((route) => route.maskedDestination),
    ["****0111", "****0112", "****0113"],
    "Each route reports only its own masked terminal",
  );
  assertionCount += 1;

  const attestationScenarios = [
    {
      envName: "TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
      routeKey: "weathertech-phoenix",
      label: "WeatherTech Phoenix",
    },
    {
      envName: "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
      routeKey: "weathertech-tucson",
      label: "WeatherTech Tucson",
    },
    {
      envName: "TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
      routeKey: "ihc-primary",
      label: "IHC",
    },
  ];
  for (const scenario of attestationScenarios) {
    process.env[scenario.envName] = "false";
    const unattestedCheck = serverClient.getTwilioVoiceForwardingCheckResult({
      routeExactByKey,
    });
    const targetRoute = unattestedCheck.routes.find(
      (route) => route.routeKey === scenario.routeKey,
    );
    equal(
      targetRoute?.ready,
      false,
      `${scenario.label} fails closed without its own terminal attestation`,
    );
    equal(
      targetRoute?.terminalForwardingDisabledConfirmed,
      false,
      `${scenario.label} reports only its own attestation state`,
    );
    check(
      targetRoute?.nextAction.includes(`${scenario.label} terminal line`),
      `${scenario.label} readiness requests only its route-specific attestation`,
    );
    check(
      unattestedCheck.routes
        .filter((route) => route.routeKey !== scenario.routeKey)
        .every(
          (route) => route.ready && route.terminalForwardingDisabledConfirmed,
        ),
      `${scenario.label} attestation cannot block another route`,
    );
    equal(
      unattestedCheck.terminalForwardingDisabledConfirmed,
      false,
      "The compatibility aggregate fails when any configured terminal is unattested",
    );
    process.env[scenario.envName] = "true";
  }

  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO = "+12025550105";
  const collisionCheck = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey,
  });
  equal(
    collisionCheck.graphValid,
    false,
    "A destination matching another route's public source invalidates the graph",
  );
  check(
    collisionCheck.routes.every((route) => !route.ready),
    "A cross-route protected-node collision fails every route closed",
  );

  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO = "+12025550111";
  process.env.TWILIO_IHC_VOICE_FORWARD_TO = "+12025550111";
  const sharedCheck = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey,
  });
  equal(
    sharedCheck.sharedDestination,
    true,
    "An explicit Phoenix/IHC shared sink is reported without reusing Tucson",
  );
  check(
    sharedCheck.routes.every((route) => route.ready),
    "A verified Phoenix/IHC shared terminal remains supported",
  );

  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO = "+12025550112";
  const tucsonReuseCheck = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey,
  });
  equal(
    tucsonReuseCheck.sharedDestination,
    false,
    "Reusing Tucson does not qualify as an approved Phoenix/IHC shared sink",
  );
  equal(
    tucsonReuseCheck.graphValid,
    false,
    "A Phoenix destination cannot reuse the Tucson-only terminal",
  );
  check(
    tucsonReuseCheck.routes.every((route) => !route.ready),
    "A Tucson terminal identity collision fails every route closed",
  );

  process.env.TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO = "+12025550111";
  process.env.TWILIO_IHC_VOICE_FORWARD_TO = "+12025550112";
  const ihcTucsonReuseCheck = serverClient.getTwilioVoiceForwardingCheckResult({
    routeExactByKey,
  });
  equal(
    ihcTucsonReuseCheck.graphValid,
    false,
    "The IHC destination also cannot reuse the Tucson-only terminal",
  );
  check(
    ihcTucsonReuseCheck.routes.every((route) => !route.ready),
    "An IHC/Tucson terminal identity collision fails every route closed",
  );

  console.log(`Twilio distinct terminal assertions passed: ${assertionCount}`);
} finally {
  restoreEnvironment();
  rmSync(outDir, { recursive: true, force: true });
}
