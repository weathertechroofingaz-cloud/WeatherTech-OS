import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const migrationPattern = /^([0-9]+)_[a-z0-9][a-z0-9_]*\.sql$/;
const expectedMigrations = [
  ["0001_weathertech_crm.sql", "9d5f3978dbda49757ad67d9f4f97a780f07ef95fd7fcfcc900a165b1351a49eb"],
  ["0002_estimates_scopes.sql", "c2de0277a9a89eec5a8a816944aa1fb0ba94f2277942693b4dbc7494bac004f4"],
  ["0003_operations_crm.sql", "02722f0e0d63fb1f04da709b8af4fd200f477ca92ea65cd8ff0f8f818c5a5f65"],
  [
    "0004_portals_documents_workflows.sql",
    "6290237429b2818769142f88f91a90dafeb660503d26094ad5ffaa93547c9735",
  ],
  [
    "0005_google_calendar_integration.sql",
    "b022debdbb09018c72b631d0ce9e88955f1d65b47a7c07a5493998f361776124",
  ],
  ["0006_gmail_outbox.sql", "914c97d59023d102784ca96368fa7fec5144bd6934348aedd6a5a3dbb5b64e21"],
  [
    "0007_google_maps_routing.sql",
    "464f7776f037009bd1030d9c7c197394b13adde3c2c7a91803024c3fbea9da3c",
  ],
  [
    "0008_twilio_sms_integration.sql",
    "a9ecdb666111a0e9fbaf55df7aad9ad6cc271dfc105434c8f4f2b7fe7f2bda56",
  ],
  ["0009_document_center.sql", "dc271b8de49c8453b22d16aa8b3f96faf9b39160a9d40c3f01344c7fd0827458"],
  [
    "0010_multi_company_architecture.sql",
    "381c692e8e5f8441b7d14847e85d9aff56cc420b412720eb5f17c44a70ef1ee1",
  ],
  [
    "0011_ihc_painting_workflows.sql",
    "fd48ea46540b7ba90fd61220e731e52513539e06f116b3f6000c5b18d5ef7167",
  ],
  [
    "0012_integration_sync_logs.sql",
    "807f2b0d0321330f5b8acac1e34dc4dc852833b321d754b4d9672fa231d95f88",
  ],
  [
    "0013_job_production_details.sql",
    "49529318b462b3e5ab132aa87fe7890a72705d3f3e7f85aeeb7a73ae02a0eda8",
  ],
  [
    "0014_website_lead_intake_provider.sql",
    "e89e0517eb37e71c899c71ec0e215e2a9df3a989dc4ddebcec61ff3b991b6a19",
  ],
  [
    "0015_expand_integration_provider_checks.sql",
    "e89e0517eb37e71c899c71ec0e215e2a9df3a989dc4ddebcec61ff3b991b6a19",
  ],
  [
    "0016_lead_source_mappings.sql",
    "4becfc759bdf0c43406b1bb8d8eaccccbe36b75613eef3aaaf468e5415120cfb",
  ],
  ["0017_lead_pipeline_stage.sql", "0652878340a476132d090d8b6dc730c9732f79f1263c3112120cb6bea7384008"],
  [
    "0018_estimate_builder_foundation.sql",
    "d7e1a516c400acb4a57b131203d84d04c0aff4d0af02da1709a2f4e9bc8a96c0",
  ],
  [
    "0019_jobs_projects_foundation.sql",
    "a32db91497c1c319dc25af39333e0b46a68db802e8d412e1fed70a0615432181",
  ],
  [
    "0020_inspections_foundation.sql",
    "2f274db49f4dcf808a7f024b0a0452a07d36265e614f1492faf90835baa1ef4e",
  ],
  [
    "0021_twilio_live_integration_foundation.sql",
    "549c07af949ca3241ce2edb2238bfb5c3c06c5de4d345019636198bed7c41faa",
  ],
  [
    "0022_gohighlevel_sync_foundation.sql",
    "cbfe922c8624690ab9aca0ad2994104437db875d94ca2cf13a73540daab19ad7",
  ],
  [
    "0023_unified_lead_intake_routing_engine.sql",
    "a36c11e09a121ece56c15cba2a84ee2b180c26dc9e852f9da08dc8170170b8b7",
  ],
  [
    "0024_security_company_access_hardening.sql",
    "61bc67becf0743df18ff78a57af8966e2b94de4b7d2e9b25f74ecef9dd96e7df",
  ],
  [
    "0025_document_storage_signature_workflow.sql",
    "8e8af7442520c1c3542da82320423ff93e3060e0538f8230f14fe119f22b2412",
  ],
  [
    "0026_property_intelligence_foundation.sql",
    "38d70de853c3fff13a41fcc3d8810dc9b9ced78d6fc64a7e73a5cd606cf0862a",
  ],
  [
    "0027_gmail_workspace_email_foundation.sql",
    "ac5dc160e5e6ee717588546f7c36d360646f79abdd716ae587006206fbbdaf85",
  ],
];

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const failures = [];
const versions = new Map();
const expectedFiles = expectedMigrations.map(([file]) => file);
const expectedHashes = new Map(expectedMigrations);
const supportedIntegrationProviders = [
  "google_calendar",
  "gmail",
  "google_maps",
  "gohighlevel",
  "twilio",
  "twilio_sms",
  "website",
  "yelp",
];

for (const file of files) {
  const match = migrationPattern.exec(file);

  if (!match) {
    failures.push(`${file} does not use the expected numeric migration prefix.`);
    continue;
  }

  const version = match[1];
  const duplicate = versions.get(version);

  if (duplicate) {
    failures.push(`Duplicate migration version ${version}: ${duplicate}, ${file}`);
  } else {
    versions.set(version, file);
  }
}

const orderedByVersion = [...files].sort((left, right) => {
  const leftVersion = migrationPattern.exec(left)?.[1] ?? "";
  const rightVersion = migrationPattern.exec(right)?.[1] ?? "";
  const byVersion = Number.parseInt(leftVersion, 10) - Number.parseInt(rightVersion, 10);
  return byVersion === 0 ? left.localeCompare(right) : byVersion;
});

if (JSON.stringify(files) !== JSON.stringify(orderedByVersion)) {
  failures.push("Raw filename sorting and numeric migration order do not agree.");
}

if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
  failures.push("Migration files must be sequential from 0001 through 0027 with expected names.");
}

for (let index = 0; index < expectedFiles.length; index += 1) {
  const expectedVersion = String(index + 1).padStart(4, "0");
  const version = migrationPattern.exec(expectedFiles[index])?.[1];

  if (version !== expectedVersion) {
    failures.push(`${expectedFiles[index]} must use version ${expectedVersion}.`);
  }
}

const integrationSyncIndex = files.indexOf("0012_integration_sync_logs.sql");
const jobProductionIndex = files.indexOf("0013_job_production_details.sql");
const websiteLeadIntakeIndex = files.indexOf("0014_website_lead_intake_provider.sql");
const securityHardeningIndex = files.indexOf("0024_security_company_access_hardening.sql");
const documentStorageIndex = files.indexOf("0025_document_storage_signature_workflow.sql");
const propertyIntelligenceIndex = files.indexOf("0026_property_intelligence_foundation.sql");
const gmailWorkspaceIndex = files.indexOf("0027_gmail_workspace_email_foundation.sql");

if (
  integrationSyncIndex === -1 ||
  jobProductionIndex === -1 ||
  websiteLeadIntakeIndex === -1 ||
  !(integrationSyncIndex < jobProductionIndex && jobProductionIndex < websiteLeadIntakeIndex)
) {
  failures.push(
    "Job production migration must order after integration sync logs and before website lead intake.",
  );
}

if (
  securityHardeningIndex === -1 ||
  documentStorageIndex === -1 ||
  !(securityHardeningIndex < documentStorageIndex)
) {
  failures.push("Document storage migration must order after security company access hardening.");
}

if (
  documentStorageIndex === -1 ||
  propertyIntelligenceIndex === -1 ||
  !(documentStorageIndex < propertyIntelligenceIndex)
) {
  failures.push("Property intelligence migration must order after document storage.");
}

if (
  propertyIntelligenceIndex === -1 ||
  gmailWorkspaceIndex === -1 ||
  !(propertyIntelligenceIndex < gmailWorkspaceIndex)
) {
  failures.push("Gmail Workspace migration must order after property intelligence.");
}

if (gmailWorkspaceIndex !== files.length - 1) {
  failures.push("Gmail Workspace foundation migration must remain last.");
}

for (const file of files) {
  const expectedHash = expectedHashes.get(file);

  if (!expectedHash) {
    failures.push(`${file} is missing an expected SQL hash.`);
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, file));
  const sha256 = createHash("sha256").update(sql).digest("hex");

  if (sha256 !== expectedHash) {
    failures.push(`${file} SQL hash changed: expected ${expectedHash}, received ${sha256}.`);
  }
}

const websiteLeadIntakeMigration = fs.readFileSync(
  path.join(migrationsDir, "0014_website_lead_intake_provider.sql"),
  "utf8",
);

function readProviderCheckValues(constraintName) {
  const constraintStart = websiteLeadIntakeMigration.indexOf(`add constraint ${constraintName}`);

  if (constraintStart === -1) {
    failures.push(`0014 is missing ${constraintName}.`);
    return [];
  }

  const constraintEnd = websiteLeadIntakeMigration.indexOf(");", constraintStart);

  if (constraintEnd === -1) {
    failures.push(`0014 ${constraintName} block is not terminated.`);
    return [];
  }

  const constraintBlock = websiteLeadIntakeMigration.slice(constraintStart, constraintEnd);
  return [...constraintBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

for (const constraintName of [
  "integration_connections_provider_check",
  "integration_sync_logs_provider_check",
]) {
  const providers = readProviderCheckValues(constraintName);

  if (JSON.stringify(providers) !== JSON.stringify([...supportedIntegrationProviders].sort())) {
    failures.push(
      `0014 ${constraintName} must allow exactly ${supportedIntegrationProviders.join(", ")}.`,
    );
  }

  for (const requiredProvider of ["yelp", "website", "twilio", "twilio_sms"]) {
    if (!providers.includes(requiredProvider)) {
      failures.push(`0014 ${constraintName} must allow ${requiredProvider}.`);
    }
  }

  if (providers.includes("unknown_provider")) {
    failures.push(`0014 ${constraintName} must reject unknown_provider.`);
  }
}

const documentStorageMigration = fs.readFileSync(
  path.join(migrationsDir, "0025_document_storage_signature_workflow.sql"),
  "utf8",
);

for (const requiredCategory of [
  "signed_agreement",
  "insurance",
  "permit",
  "material_order",
  "manufacturer_warranty",
  "workmanship_warranty",
  "inspection_report",
  "photo_set",
]) {
  if (!documentStorageMigration.includes(`'${requiredCategory}'`)) {
    failures.push(`0025 document category check must allow ${requiredCategory}.`);
  }
}

for (const requiredSignatureStatus of [
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
]) {
  if (!documentStorageMigration.includes(`'${requiredSignatureStatus}'`)) {
    failures.push(`0025 signature status check must allow ${requiredSignatureStatus}.`);
  }
}

for (const requiredStoragePolicy of [
  "WTOS users read customer documents",
  "WTOS users upload customer documents",
  "WTOS users update customer documents",
]) {
  if (!documentStorageMigration.includes(requiredStoragePolicy)) {
    failures.push(`0025 must include the ${requiredStoragePolicy} storage policy.`);
  }
}

if (documentStorageMigration.includes("WTOS users remove customer documents")) {
  failures.push("0025 must not grant authenticated users document storage delete access.");
}

if (!documentStorageMigration.includes("customer-documents")) {
  failures.push("0025 must create and use the private customer-documents storage bucket.");
}

const propertyIntelligenceMigration = fs.readFileSync(
  path.join(migrationsDir, "0026_property_intelligence_foundation.sql"),
  "utf8",
);

for (const requiredPropertyColumn of [
  "property_type",
  "year_built",
  "square_feet",
  "stories",
  "occupancy",
  "hoa_name",
  "gate_code",
  "access_instructions",
  "latitude",
  "longitude",
  "parcel_number",
  "roof_age_years",
  "roof_manufacturer",
  "roof_system",
  "roof_pitch",
  "roof_layers",
  "roofing_material",
  "flat_roof_sections",
  "tile_information",
  "has_solar",
  "has_skylights",
  "hvac_penetrations",
  "chimneys",
  "paint_system",
  "exterior_finish",
  "exterior_paint_colors",
  "last_inspection_at",
  "next_recommended_inspection_at",
  "roof_condition",
  "paint_condition",
  "warranty_status",
  "document_status",
  "maintenance_status",
  "health_score",
  "ai_summary",
]) {
  if (!propertyIntelligenceMigration.includes(requiredPropertyColumn)) {
    failures.push(`0026 properties table must include ${requiredPropertyColumn}.`);
  }
}

for (const propertyLinkedTable of [
  "leads",
  "estimates",
  "jobs",
  "schedule_events",
  "job_photos",
  "invoices",
  "material_orders",
  "inspections",
  "change_orders",
  "documents",
  "payments",
]) {
  if (!propertyIntelligenceMigration.includes(`('${propertyLinkedTable}', '${propertyLinkedTable}_property_id_fkey')`)) {
    failures.push(`0026 must add a property_id foreign key for ${propertyLinkedTable}.`);
  }

  if (!propertyIntelligenceMigration.includes(`${propertyLinkedTable}_property_id_idx`)) {
    failures.push(`0026 must index ${propertyLinkedTable}.property_id.`);
  }
}

for (const requiredPolicy of [
  "WTOS users read properties",
  "WTOS users insert properties",
  "WTOS users update properties",
]) {
  if (!propertyIntelligenceMigration.includes(requiredPolicy)) {
    failures.push(`0026 must include the ${requiredPolicy} policy.`);
  }
}

if (propertyIntelligenceMigration.includes("WTOS users delete properties")) {
  failures.push("0026 must not create an authenticated property delete policy.");
}

if (!propertyIntelligenceMigration.includes("revoke delete on table public.properties from authenticated")) {
  failures.push("0026 must explicitly revoke authenticated property delete access.");
}

if (!propertyIntelligenceMigration.trim().startsWith("begin;") ||
    !propertyIntelligenceMigration.trim().endsWith("commit;")) {
  failures.push("0026 must remain transactionally wrapped.");
}

const gmailWorkspaceMigration = fs.readFileSync(
  path.join(migrationsDir, "0027_gmail_workspace_email_foundation.sql"),
  "utf8",
);

for (const requiredEmailColumn of [
  "lead_id",
  "job_id",
  "property_id",
  "direction",
  "from_email",
  "to_emails",
  "gmail_thread_id",
  "provider_account_id",
  "message_preview",
  "has_attachments",
  "attachment_count",
  "sync_status",
  "provider_payload_hash",
]) {
  if (!gmailWorkspaceMigration.includes(requiredEmailColumn)) {
    failures.push(`0027 email_messages table must include ${requiredEmailColumn}.`);
  }
}

for (const requiredTable of [
  "gmail_oauth_states",
  "gmail_mailbox_credentials",
  "gmail_email_threads",
  "gmail_email_attachments",
]) {
  if (!gmailWorkspaceMigration.includes(`public.${requiredTable}`)) {
    failures.push(`0027 must create or configure ${requiredTable}.`);
  }
}

for (const serviceOnlyTable of ["gmail_oauth_states", "gmail_mailbox_credentials"]) {
  for (const revokedRole of ["anon", "public", "authenticated"]) {
    if (
      !gmailWorkspaceMigration.includes(
        `revoke all on table public.${serviceOnlyTable} from ${revokedRole}`,
      )
    ) {
      failures.push(`0027 must revoke ${revokedRole} access to ${serviceOnlyTable}.`);
    }
  }

  if (
    !gmailWorkspaceMigration.includes(
      `grant select, insert, update, delete on table public.${serviceOnlyTable} to service_role`,
    )
  ) {
    failures.push(`0027 must grant service_role full access to ${serviceOnlyTable}.`);
  }
}

for (const metadataTable of ["gmail_email_threads", "gmail_email_attachments"]) {
  if (
    !gmailWorkspaceMigration.includes(
      `revoke delete on table public.${metadataTable} from authenticated`,
    )
  ) {
    failures.push(`0027 must revoke authenticated delete access to ${metadataTable}.`);
  }

  if (
    !gmailWorkspaceMigration.includes(
      `grant select, insert, update on table public.${metadataTable} to authenticated`,
    )
  ) {
    failures.push(`0027 must only grant authenticated read/write metadata access to ${metadataTable}.`);
  }
}

for (const requiredConstraint of [
  "email_messages_direction_check",
  "email_messages_sync_status_check",
  "email_messages_attachment_count_check",
  "gmail_email_threads_match_status_check",
  "gmail_email_attachments_size_check",
]) {
  if (!gmailWorkspaceMigration.includes(requiredConstraint)) {
    failures.push(`0027 must include ${requiredConstraint}.`);
  }
}

if (!gmailWorkspaceMigration.includes("email_messages_gmail_message_unique_idx")) {
  failures.push("0027 must prevent duplicate Gmail message imports per mailbox.");
}

if (/using\s*\(\s*true\s*\)/i.test(gmailWorkspaceMigration)) {
  failures.push("0027 must not use broad USING (true) RLS policies.");
}

if (!gmailWorkspaceMigration.trim().startsWith("begin;") ||
    !gmailWorkspaceMigration.trim().endsWith("commit;")) {
  failures.push("0027 must remain transactionally wrapped.");
}

if (failures.length > 0) {
  console.error("Supabase migration integrity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Supabase migration integrity check passed.");
console.log(`Checked ${files.length} migrations with unique numeric versions.`);
console.log(
  "Verified raw filename order matches numeric order from 0001 through 0027.",
);
console.log(
  "Verified 0012_integration_sync_logs.sql -> 0013_job_production_details.sql -> 0014_website_lead_intake_provider.sql.",
);
console.log(
  "Verified 0024_security_company_access_hardening.sql precedes 0025_document_storage_signature_workflow.sql.",
);
console.log(
  "Verified 0025_document_storage_signature_workflow.sql precedes 0026_property_intelligence_foundation.sql.",
);
console.log(
  "Verified 0026_property_intelligence_foundation.sql precedes 0027_gmail_workspace_email_foundation.sql.",
);
console.log("Verified all migration SQL SHA-256 hashes match expected values.");
console.log(
  "Verified 0014 accepts yelp, website, twilio, and twilio_sms while rejecting unknown providers.",
);
console.log(
  "Verified 0025 document categories, signature statuses, and storage policies.",
);
console.log(
  "Verified 0026 property intelligence schema, property links, RLS policies, and transactional wrapper.",
);
console.log(
  "Verified 0027 Gmail Workspace schema, service-only credentials, company-scoped metadata, duplicate prevention, and transactional wrapper.",
);
