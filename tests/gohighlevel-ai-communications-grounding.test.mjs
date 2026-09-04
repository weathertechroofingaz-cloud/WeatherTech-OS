import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-ghl-grounding-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/crm/communications.ts",
      "lib/crm/aiTools.ts",
      "lib/crm/aiProvider.ts",
      "lib/crm/demoSnapshot.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--strict",
      "--skipLibCheck",
      "--esModuleInterop",
      "--jsx",
      "react-jsx",
      "--outDir",
      outDir,
    ],
    { cwd, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    throw new Error(
      `Could not compile GHL communications grounding modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const communications = await import(
    pathToFileURL(join(outDir, "communications.js"))
  );
  const aiTools = await import(pathToFileURL(join(outDir, "aiTools.js")));
  const aiProvider = await import(pathToFileURL(join(outDir, "aiProvider.js")));
  const demo = await import(pathToFileURL(join(outDir, "demoSnapshot.js")));

  const snapshot = demo.createDemoCrmSnapshot();
  const [weatherTech, ihc] = snapshot.companies;
  assert(weatherTech && ihc, "Demo snapshot must include both companies");

  const baseTimestamp = "2026-09-04T18:00:00.000Z";
  const makeSnapshot = ({
    id,
    companyId,
    connectionId,
    externalId,
    body,
    messageType = "SMS",
  }) => ({
    id,
    company_id: companyId,
    integration_connection_id: connectionId,
    resource_type: "message",
    external_id: externalId,
    external_parent_id: `conversation-${externalId}`,
    external_contact_id: `contact-${externalId}`,
    customer_id: null,
    lead_id: null,
    direction: "inbound",
    status: "received",
    body_preview: body,
    occurred_at: baseTimestamp,
    provider_updated_at: baseTimestamp,
    payload_summary: {
      messageType,
      direction: "inbound",
      from: "+16025550101",
      to: "+16025550102",
      matchStatus: "unmatched",
    },
    last_synced_at: baseTimestamp,
    created_at: baseTimestamp,
    updated_at: baseTimestamp,
  });

  const weatherConnectionId = "00000000-0000-4000-8000-000000000101";
  const ihcConnectionId = "00000000-0000-4000-8000-000000000202";
  snapshot.integrationConnections.push(
    {
      id: weatherConnectionId,
      company_id: weatherTech.id,
      provider: "gohighlevel",
      status: "connected",
      external_account_id: "weather-location",
    },
    {
      id: ihcConnectionId,
      company_id: ihc.id,
      provider: "gohighlevel",
      status: "connected",
      external_account_id: "ihc-location",
    },
  );
  snapshot.goHighLevelResourceSnapshots = [
    makeSnapshot({
      id: "00000000-0000-4000-8000-000000000111",
      companyId: weatherTech.id,
      connectionId: weatherConnectionId,
      externalId: "shared-provider-id",
      body: "WeatherTech customer asked about an inspection.",
    }),
    makeSnapshot({
      id: "00000000-0000-4000-8000-000000000222",
      companyId: ihc.id,
      connectionId: ihcConnectionId,
      externalId: "shared-provider-id",
      body: "IHC customer asked about paint colors.",
    }),
  ];

  const companyMap = new Map(snapshot.companies.map((company) => [company.id, company]));
  const inbox = communications.buildUnifiedInboxItems(snapshot, companyMap);
  const ghlItems = inbox.filter(
    (item) => item.relatedTable === "gohighlevel_resource_snapshots",
  );
  assertEqual(ghlItems.length, 2, "Same provider ID in different companies remains isolated");
  assert(
    ghlItems.some(
      (item) =>
        item.companyId === weatherTech.id &&
        item.summary.includes("WeatherTech customer"),
    ),
    "WeatherTech timeline includes its sanitized GHL communication",
  );
  assert(
    ghlItems.some(
      (item) => item.companyId === ihc.id && item.summary.includes("IHC customer"),
    ),
    "IHC timeline includes its sanitized GHL communication",
  );

  const weatherAi = aiTools.buildAiWorkspaceModel(snapshot, {
    companyId: weatherTech.id,
    now: baseTimestamp,
  });
  assertEqual(
    weatherAi.contextSummary.goHighLevelRecords,
    1,
    "AI workspace counts only authorized company GHL records",
  );
  assert(
    weatherAi.communicationsAssistant[0].sourceRecords.some(
      (record) =>
        record.table === "gohighlevel_resource_snapshots" &&
        record.companyId === weatherTech.id,
    ),
    "AI communications assistant cites authorized GHL context",
  );
  assert(
    !weatherAi.communicationsAssistant[0].sourceRecords.some(
      (record) => record.companyId === ihc.id,
    ),
    "AI communications assistant excludes the other company",
  );

  const retrieved = aiProvider.retrieveAuthorizedAiContext(snapshot, {
    companyId: weatherTech.id,
    prompt: "What did the latest customer ask about?",
    now: baseTimestamp,
    recordLimit: 50,
  });
  const retrievedGhl = retrieved.records.filter(
    (record) => record.table === "gohighlevel_resource_snapshots",
  );
  assertEqual(retrievedGhl.length, 1, "Live AI retrieval receives one scoped GHL record");
  assertEqual(
    retrievedGhl[0].companyId,
    weatherTech.id,
    "Live AI retrieval preserves exact company ownership",
  );
  assert(
    retrievedGhl[0].snippet.includes("WeatherTech customer"),
    "Live AI retrieval includes sanitized communication context",
  );
  assert(
    !retrievedGhl[0].snippet.includes("IHC customer"),
    "Live AI retrieval never crosses company boundaries",
  );

  const crossChannelExternalId = "provider-id-reused-across-sms-and-email";
  const crossChannelSmsSnapshot = makeSnapshot({
    id: "00000000-0000-4000-8000-000000000311",
    companyId: weatherTech.id,
    connectionId: weatherConnectionId,
    externalId: crossChannelExternalId,
    body: "SMS copy already represented by its durable provider event.",
    messageType: "SMS",
  });
  const crossChannelEmailSnapshot = makeSnapshot({
    id: "00000000-0000-4000-8000-000000000312",
    companyId: weatherTech.id,
    connectionId: weatherConnectionId,
    externalId: crossChannelExternalId,
    body: "Email copy must remain visible despite the reused provider ID.",
    messageType: "Email",
  });
  snapshot.goHighLevelResourceSnapshots = [
    crossChannelSmsSnapshot,
    crossChannelEmailSnapshot,
  ];
  snapshot.communicationProviderEvents = [
    {
      id: "00000000-0000-4000-8000-000000000313",
      company_id: weatherTech.id,
      business_phone_number_id: null,
      integration_connection_id: weatherConnectionId,
      customer_id: null,
      lead_id: null,
      job_id: null,
      sms_message_id: "00000000-0000-4000-8000-000000000314",
      provider: "gohighlevel",
      provider_account_sid: null,
      provider_event_sid: crossChannelExternalId,
      provider_parent_sid: `conversation-${crossChannelExternalId}`,
      event_type: "message.received",
      channel: "sms",
      direction: "inbound",
      status: "received",
      from_phone: "+16025550101",
      to_phone: "+16025550102",
      business_phone: "+16025550102",
      customer_phone: "+16025550101",
      routing_status: "matched",
      correlation_id: "00000000-0000-4000-8000-000000000315",
      request_fingerprint: null,
      payload_summary: {},
      response_summary: {},
      error_code: null,
      error_message: null,
      occurred_at: baseTimestamp,
      provider_updated_at: baseTimestamp,
      provider_version_source: "updated_at",
      provider_status_rank: 30,
      provider_content_sha256: "a".repeat(64),
      received_at: baseTimestamp,
      created_at: baseTimestamp,
      updated_at: baseTimestamp,
    },
  ];

  const crossChannelInbox = communications
    .buildUnifiedInboxItems(snapshot, companyMap)
    .filter((item) => item.relatedTable === "gohighlevel_resource_snapshots");
  assertEqual(
    crossChannelInbox.length,
    1,
    "A persisted SMS identity suppresses only its SMS snapshot",
  );
  assertEqual(
    crossChannelInbox[0].relatedRecordId,
    crossChannelEmailSnapshot.id,
    "The same provider ID on Email remains visible in the unified inbox",
  );
  assertEqual(
    crossChannelInbox[0].channel,
    "email",
    "Cross-channel provider ID reuse preserves the Email channel",
  );

  const crossChannelPriorities = aiTools
    .buildAiPriorityItems(snapshot, {
      companyId: weatherTech.id,
      now: baseTimestamp,
    })
    .filter((item) => item.source.table === "gohighlevel_resource_snapshots");
  assertEqual(
    crossChannelPriorities.length,
    1,
    "A persisted SMS identity suppresses only its SMS AI priority",
  );
  assertEqual(
    crossChannelPriorities[0].source.id,
    crossChannelEmailSnapshot.id,
    "The same provider ID on Email remains available to AI priorities",
  );

  snapshot.communicationProviderEvents = [];
  snapshot.goHighLevelResourceSnapshots = [
    ...Array.from({ length: 20 }, (_, index) =>
      makeSnapshot({
        id: `00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`,
        companyId: weatherTech.id,
        connectionId: weatherConnectionId,
        externalId: `decoy-${index}`,
        body: `Routine provider message ${index}`,
      }),
    ),
    makeSnapshot({
      id: "00000000-0000-4000-8000-000000000999",
      companyId: weatherTech.id,
      connectionId: weatherConnectionId,
      externalId: "older-exact-match",
      body: "Customer specifically asked about Desert Willow appointment timing.",
    }),
  ];
  const exactOlderMatch = aiProvider.retrieveAuthorizedAiContext(snapshot, {
    companyId: weatherTech.id,
    prompt: "What happened with the Desert Willow appointment?",
    now: baseTimestamp,
    recordLimit: 8,
  });
  assert(
    exactOlderMatch.records.some(
      (record) =>
        record.table === "gohighlevel_resource_snapshots" &&
        record.id === "00000000-0000-4000-8000-000000000999",
    ),
    "Prompt relevance is scored before the GHL context result cap",
  );

  console.log("GoHighLevel AI and communications grounding regression passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
