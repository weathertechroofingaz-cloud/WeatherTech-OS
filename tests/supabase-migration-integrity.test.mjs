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
    "caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e",
  ],
  [
    "0027_gmail_workspace_email_foundation.sql",
    "ac5dc160e5e6ee717588546f7c36d360646f79abdd716ae587006206fbbdaf85",
  ],
  [
    "0028_google_calendar_scheduling_foundation.sql",
    "7fd989e897cbe98a16bf58edcd53a0a537c5cac026a241329015000849740b74",
  ],
  [
    "0029_google_business_profile_foundation.sql",
    "cd53500ead34d1a26ffb6189ff10204bf6f5bbb99f69225d8005bbbdc792e5a3",
  ],
  [
    "0030_quickbooks_online_foundation.sql",
    "36c7d26eac4c2ae8a470b5540df4684c6f19fb2166bf8890ac3aa1dc56aeaaaa",
  ],
  [
    "0031_electronic_signatures_foundation.sql",
    "d3d12e6c5f407481a728c8c05524f8738655a8bb1cad6299dc9937eb76f0f313",
  ],
  [
    "0032_estimate_proposal_builder_v2.sql",
    "25021ad2b0d22441c259d520b85dfa8ec53f5ff2ff1327783741366869626a51",
  ],
  [
    "0033_ai_tools_operating_brain.sql",
    "f73eab951eaa4229314391f1eb5d49711c8dcbfce0f4ed3af4fabfb2ecfed73e",
  ],
  [
    "0034_office_operations_daily_task_queue.sql",
    "e4fa070552f16aa92dabd8ffe15ecbdad0f7b5fa9a671f2091bf989ad81c68cd",
  ],
  [
    "0035_office_task_source_delete_cascade.sql",
    "768bb6177263ee5a217a1c732e66a77f85a5e7c6330013c91e28d0af970ce277",
  ],
  [
    "0036_gohighlevel_oauth_communications_bridge.sql",
    "8fbbc0cc1df6f2d02af5989d6e62d9b91a40e1f4db17aa9f9ad5ed9ca11a6f38",
  ],
  [
    "20260808222141_stripe_company_isolation.sql",
    "83f9309b9409e5f5b268a587790846cb563dce645962562a1e833d2ef1d77d67",
  ],
  [
    "20260810225320_stripe_refund_reconciliation.sql",
    "c8fd0509a40c7848e2b7f34793889fb9747568db5e3af2b2d524474ca6ea0a11",
  ],
  [
    "20260814051533_crm_identity_reconciliation.sql",
    "c145d0d7551132d9f384720969b74d68c600c87991b8377049b11ba80893aca3",
  ],
  [
    "20260814053339_crm_identity_reconciliation_runtime_hardening.sql",
    "c6e1fd59cb44e9e463028fc4cbcde5d3587f6b243b0221890e78d5a306693f04",
  ],
  [
    "20260814054250_crm_identity_reconciliation_invariant_hardening.sql",
    "df8de08f7214ee9326b5a671f06547b261da3c8cbb5ef403bbb4c4c8f811d890",
  ],
  [
    "20260814061253_crm_identity_reconciliation_stale_version_error_hardening.sql",
    "b26e3601a762297030a8be3d3e6c46720ed49b30a9c0a40185a6c269edb88b40",
  ],
  [
    "20260814063407_crm_identity_reconciliation_release_hardening.sql",
    "38c16883b9f9be5976f09ceca0989f3d902e9e8e5e8abd77300c9fac45448afd",
  ],
  [
    "20260815033229_mighty_apes_yelp_lead_intake.sql",
    "b1c95ee1ed92d76bdb71cea8e339b797282b2e07ca7dc6eb8153de58f1eb1ece",
  ],
  [
    "20260815040010_mighty_apes_yelp_audit_lock_privilege.sql",
    "b4fdd7850e78bd8a31118a65ff84a67db07dc569ca74912dc01a3ff4c0955ead",
  ],
  [
    "20260816122114_lead_attribution_marketing_accountability_phase_1.sql",
    "1cd4051f320fdb82253a92d3b440dbc307a72b8dba78d170f6592ca4545b8622",
  ],
  [
    "20260816143152_lead_accountability_nonretryable_stale_errors.sql",
    "618cf2b2d7976758edd24a07f531221ea56686fb3d53dbd6c2598851ed02af6a",
  ],
  [
    "20260816164202_lead_accountability_idempotency_integrity_hardening.sql",
    "8c976c8cd21f123e5abca4e5987e4a67301091a108044698ed610e99faea2250",
  ],
  [
    "20260818030913_secure_company_scoped_job_photos.sql",
    "eb886e55277c87893d9aaed6affc54f43680235dd6f35e3230d84b47150ed0e3",
  ],
  [
    "20260822054433_job_photo_storage_rollback_retry_correction.sql",
    "74a3a130c17e0e8a84f9a1b5dcc544b0c8ea348a98b0f287cc10ca6e7aeeafdb",
  ],
  [
    "20260824044610_native_proposal_esign_sold_job_gate.sql",
    "703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7",
  ],
  [
    "20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql",
    "32a9a852aeb32144d9af6ee43711ad7824bb0847bac969a47ec61300232b4d77",
  ],
  [
    "20260902024804_automation_engine_foundation.sql",
    "bfddf783fe462e7c1258c3a3df90f9302c45c7c6830745308097de2c09d8a868",
  ],
  [
    "20260902042428_gohighlevel_webhook_durable_state_machine.sql",
    "e19f6f9fce96c4453ffe813b6c7844ce9d27328fe43b5b9a200f86cea1f28047",
  ],
  [
    "20260902043624_mighty_apes_legacy_service_routing_correction.sql",
    "94805469418f37a39a341702ac830ce9edea5cdb9af5defe734aa65403064822",
  ],
  [
    "20260902044154_gohighlevel_webhook_uninstall_guardrails.sql",
    "0b151badd6f5e7955a3c55f4c419d821706a50478480d745fc28e03d313e5225",
  ],
  [
    "20260902044714_legacy_lead_dynamic_insert_lint_correction.sql",
    "3ad35b6d2f1a63cee44bf9277d39de2ba88d8926688ab048aaaaa0c51df24c41",
  ],
  [
    "20260902045112_canonical_lead_dynamic_insert_lint_correction.sql",
    "bfb671b09d0b445e30cc44b5d1d875e3afac1437eaac4b48d4fff3a8bfb546ed",
  ],
  [
    "20260902053037_automation_synthetic_regression_cleanup.sql",
    "ceeedc66abab9df291bc67aaf97a2da43494918810e9ca9d918d30719a79585e",
  ],
  [
    "20260902054334_automation_synthetic_cleanup_lead_source_correction.sql",
    "a46b3c8e608251cedbdc99a5c9839847bb32f1d6d6b10b0453db8de88cb24c15",
  ],
  [
    "20260902061135_gohighlevel_inbound_automation_bridge.sql",
    "812d841ef3918a1d09674d23c5ad227242d5c534fe2cc0d42edf54e46d10fab2",
  ],
  [
    "20260902065509_legacy_twilio_synthetic_automation_orphan_cleanup.sql",
    "2f76c73fdb1108f67a92ad143429108c37cac59cedcca0b1dcfaa25e58540dca",
  ],
  [
    "20260902071651_legacy_twilio_browser_voice_orphan_cleanup.sql",
    "9dc35dfc395f2761344a21f88094cb999d7cc92796c6e0e2204f47caacfb527b",
  ],
  [
    "20260902102714_lead_automation_event_legacy_schema_compatibility.sql",
    "eb1de6aeb9c994530b0c0c92adad0688c3e30809d068eed574325463a423fe64",
  ],
  [
    "20260902134526_gohighlevel_reconciliation_automation_transition_fix.sql",
    "1b6a3dc81b3dd3881b5cebc5e466f19a625a928b0c529d1bd631f2b666533e9d",
  ],
  [
    "20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql",
    "0bdf73eb47ff56b0a302043be45607879561b6dd6d13cc54d8060c3b6b2f811f",
  ],
  [
    "20260904060243_ai_quota_status_read_model.sql",
    "4e0ec9cdbf7c8264c2d2781f10a87a82fa2069a963e5948feee58357e9425079",
  ],
  [
    "20260904104733_ai_quota_probe_refresh_cooldown.sql",
    "a139c0628f8dc84c9297e40dc1e7e38ea64b3580e313d7df5a1badf448003b7b",
  ],
  [
    "20260904140401_gohighlevel_bridge_observability_hardening.sql",
    "22ab89e771fb374b205c71a1937742582077685ca56bae5f4eb13c0897af33e6",
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
  failures.push(
    "Migration files must be sequential from 0001 through 0036 followed by the registered timestamped migrations.",
  );
}

for (let index = 0; index < 36; index += 1) {
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
const googleCalendarIndex = files.indexOf("0028_google_calendar_scheduling_foundation.sql");
const googleBusinessProfileIndex = files.indexOf("0029_google_business_profile_foundation.sql");
const quickBooksOnlineIndex = files.indexOf("0030_quickbooks_online_foundation.sql");
const electronicSignaturesIndex = files.indexOf("0031_electronic_signatures_foundation.sql");
const proposalBuilderIndex = files.indexOf("0032_estimate_proposal_builder_v2.sql");
const aiToolsIndex = files.indexOf("0033_ai_tools_operating_brain.sql");
const officeTasksIndex = files.indexOf("0034_office_operations_daily_task_queue.sql");
const officeTaskCascadeIndex = files.indexOf("0035_office_task_source_delete_cascade.sql");
const goHighLevelOAuthIndex = files.indexOf("0036_gohighlevel_oauth_communications_bridge.sql");
const stripeCompanyIsolationIndex = files.indexOf(
  "20260808222141_stripe_company_isolation.sql",
);
const stripeRefundReconciliationIndex = files.indexOf(
  "20260810225320_stripe_refund_reconciliation.sql",
);
const crmIdentityReconciliationIndex = files.indexOf(
  "20260814051533_crm_identity_reconciliation.sql",
);
const crmIdentityReconciliationHardeningIndex = files.indexOf(
  "20260814053339_crm_identity_reconciliation_runtime_hardening.sql",
);
const crmIdentityReconciliationInvariantHardeningIndex = files.indexOf(
  "20260814054250_crm_identity_reconciliation_invariant_hardening.sql",
);
const crmIdentityReconciliationStaleVersionHardeningIndex = files.indexOf(
  "20260814061253_crm_identity_reconciliation_stale_version_error_hardening.sql",
);
const crmIdentityReconciliationReleaseHardeningIndex = files.indexOf(
  "20260814063407_crm_identity_reconciliation_release_hardening.sql",
);
const mightyApesYelpLeadIntakeIndex = files.indexOf(
  "20260815033229_mighty_apes_yelp_lead_intake.sql",
);
const mightyApesYelpAuditLockPrivilegeIndex = files.indexOf(
  "20260815040010_mighty_apes_yelp_audit_lock_privilege.sql",
);
const leadAttributionAccountabilityIndex = files.indexOf(
  "20260816122114_lead_attribution_marketing_accountability_phase_1.sql",
);
const leadAccountabilityStaleErrorHardeningIndex = files.indexOf(
  "20260816143152_lead_accountability_nonretryable_stale_errors.sql",
);
const leadAccountabilityIdempotencyIntegrityHardeningIndex = files.indexOf(
  "20260816164202_lead_accountability_idempotency_integrity_hardening.sql",
);
const secureCompanyScopedJobPhotosIndex = files.indexOf(
  "20260818030913_secure_company_scoped_job_photos.sql",
);
const jobPhotoStorageRollbackRetryCorrectionIndex = files.indexOf(
  "20260822054433_job_photo_storage_rollback_retry_correction.sql",
);
const nativeProposalEsignSoldJobGateIndex = files.indexOf(
  "20260824044610_native_proposal_esign_sold_job_gate.sql",
);
const deferredInvariantTriggerScopeIndex = files.indexOf(
  "20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql",
);
const automationEngineFoundationIndex = files.indexOf(
  "20260902024804_automation_engine_foundation.sql",
);
const goHighLevelWebhookStateMachineIndex = files.indexOf(
  "20260902042428_gohighlevel_webhook_durable_state_machine.sql",
);
const mightyApesLegacyServiceCorrectionIndex = files.indexOf(
  "20260902043624_mighty_apes_legacy_service_routing_correction.sql",
);
const goHighLevelWebhookGuardrailsIndex = files.indexOf(
  "20260902044154_gohighlevel_webhook_uninstall_guardrails.sql",
);
const legacyLeadDynamicInsertLintCorrectionIndex = files.indexOf(
  "20260902044714_legacy_lead_dynamic_insert_lint_correction.sql",
);
const canonicalLeadDynamicInsertLintCorrectionIndex = files.indexOf(
  "20260902045112_canonical_lead_dynamic_insert_lint_correction.sql",
);
const automationSyntheticRegressionCleanupIndex = files.indexOf(
  "20260902053037_automation_synthetic_regression_cleanup.sql",
);
const automationSyntheticLeadSourceCorrectionIndex = files.indexOf(
  "20260902054334_automation_synthetic_cleanup_lead_source_correction.sql",
);
const goHighLevelInboundAutomationBridgeIndex = files.indexOf(
  "20260902061135_gohighlevel_inbound_automation_bridge.sql",
);
const legacyTwilioSyntheticOrphanCleanupIndex = files.indexOf(
  "20260902065509_legacy_twilio_synthetic_automation_orphan_cleanup.sql",
);
const legacyTwilioBrowserVoiceOrphanCleanupIndex = files.indexOf(
  "20260902071651_legacy_twilio_browser_voice_orphan_cleanup.sql",
);
const leadAutomationEventLegacySchemaCompatibilityIndex = files.indexOf(
  "20260902102714_lead_automation_event_legacy_schema_compatibility.sql",
);
const goHighLevelReconciliationAutomationTransitionFixIndex = files.indexOf(
  "20260902134526_gohighlevel_reconciliation_automation_transition_fix.sql",
);
const goHighLevelReconciliationEventRecoveryIndex = files.indexOf(
  "20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql",
);
const aiQuotaStatusReadModelIndex = files.indexOf(
  "20260904060243_ai_quota_status_read_model.sql",
);
const aiQuotaProbeRefreshCooldownIndex = files.indexOf(
  "20260904104733_ai_quota_probe_refresh_cooldown.sql",
);
const goHighLevelBridgeObservabilityHardeningIndex = files.indexOf(
  "20260904140401_gohighlevel_bridge_observability_hardening.sql",
);

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

if (
  gmailWorkspaceIndex === -1 ||
  googleCalendarIndex === -1 ||
  !(gmailWorkspaceIndex < googleCalendarIndex)
) {
  failures.push("Google Calendar migration must order after Gmail Workspace foundation.");
}

if (
  googleCalendarIndex === -1 ||
  googleBusinessProfileIndex === -1 ||
  !(googleCalendarIndex < googleBusinessProfileIndex)
) {
  failures.push(
    "Google Business Profile migration must order after Google Calendar scheduling foundation.",
  );
}

if (
  googleBusinessProfileIndex === -1 ||
  quickBooksOnlineIndex === -1 ||
  !(googleBusinessProfileIndex < quickBooksOnlineIndex)
) {
  failures.push("QuickBooks Online migration must order after Google Business Profile foundation.");
}

if (
  quickBooksOnlineIndex === -1 ||
  electronicSignaturesIndex === -1 ||
  !(quickBooksOnlineIndex < electronicSignaturesIndex)
) {
  failures.push("Electronic Signatures migration must order after QuickBooks Online foundation.");
}

if (
  electronicSignaturesIndex === -1 ||
  proposalBuilderIndex === -1 ||
  !(electronicSignaturesIndex < proposalBuilderIndex)
) {
  failures.push("Estimate Proposal Builder 2.0 migration must order after Electronic Signatures.");
}

if (
  proposalBuilderIndex === -1 ||
  aiToolsIndex === -1 ||
  !(proposalBuilderIndex < aiToolsIndex)
) {
  failures.push("AI Tools 2.0 migration must order after Estimate Proposal Builder 2.0.");
}

if (
  aiToolsIndex === -1 ||
  officeTasksIndex === -1 ||
  officeTaskCascadeIndex === -1 ||
  goHighLevelOAuthIndex === -1 ||
  stripeCompanyIsolationIndex === -1 ||
  stripeRefundReconciliationIndex === -1 ||
  crmIdentityReconciliationIndex === -1 ||
  crmIdentityReconciliationHardeningIndex === -1 ||
  crmIdentityReconciliationInvariantHardeningIndex === -1 ||
  crmIdentityReconciliationStaleVersionHardeningIndex === -1 ||
  crmIdentityReconciliationReleaseHardeningIndex === -1 ||
  mightyApesYelpLeadIntakeIndex === -1 ||
  mightyApesYelpAuditLockPrivilegeIndex === -1 ||
  leadAttributionAccountabilityIndex === -1 ||
  leadAccountabilityStaleErrorHardeningIndex === -1 ||
  leadAccountabilityIdempotencyIntegrityHardeningIndex === -1 ||
  secureCompanyScopedJobPhotosIndex === -1 ||
  jobPhotoStorageRollbackRetryCorrectionIndex === -1 ||
  nativeProposalEsignSoldJobGateIndex === -1 ||
  deferredInvariantTriggerScopeIndex === -1 ||
  automationEngineFoundationIndex === -1 ||
  goHighLevelWebhookStateMachineIndex === -1 ||
  mightyApesLegacyServiceCorrectionIndex === -1 ||
  goHighLevelWebhookGuardrailsIndex === -1 ||
  legacyLeadDynamicInsertLintCorrectionIndex === -1 ||
  canonicalLeadDynamicInsertLintCorrectionIndex === -1 ||
  automationSyntheticRegressionCleanupIndex === -1 ||
  automationSyntheticLeadSourceCorrectionIndex === -1 ||
  goHighLevelInboundAutomationBridgeIndex === -1 ||
  legacyTwilioSyntheticOrphanCleanupIndex === -1 ||
  legacyTwilioBrowserVoiceOrphanCleanupIndex === -1 ||
  leadAutomationEventLegacySchemaCompatibilityIndex === -1 ||
  goHighLevelReconciliationAutomationTransitionFixIndex === -1 ||
  goHighLevelReconciliationEventRecoveryIndex === -1 ||
  aiQuotaStatusReadModelIndex === -1 ||
  aiQuotaProbeRefreshCooldownIndex === -1 ||
  !(
    aiToolsIndex < officeTasksIndex &&
    officeTasksIndex < officeTaskCascadeIndex &&
    officeTaskCascadeIndex < goHighLevelOAuthIndex &&
    goHighLevelOAuthIndex < stripeCompanyIsolationIndex &&
    stripeCompanyIsolationIndex < stripeRefundReconciliationIndex &&
    stripeRefundReconciliationIndex < crmIdentityReconciliationIndex &&
    crmIdentityReconciliationIndex < crmIdentityReconciliationHardeningIndex &&
    crmIdentityReconciliationHardeningIndex <
      crmIdentityReconciliationInvariantHardeningIndex &&
    crmIdentityReconciliationInvariantHardeningIndex <
      crmIdentityReconciliationStaleVersionHardeningIndex &&
    crmIdentityReconciliationStaleVersionHardeningIndex <
      crmIdentityReconciliationReleaseHardeningIndex &&
    crmIdentityReconciliationReleaseHardeningIndex < mightyApesYelpLeadIntakeIndex &&
    mightyApesYelpLeadIntakeIndex < mightyApesYelpAuditLockPrivilegeIndex &&
    mightyApesYelpAuditLockPrivilegeIndex < leadAttributionAccountabilityIndex &&
    leadAttributionAccountabilityIndex < leadAccountabilityStaleErrorHardeningIndex &&
    leadAccountabilityStaleErrorHardeningIndex <
      leadAccountabilityIdempotencyIntegrityHardeningIndex &&
    leadAccountabilityIdempotencyIntegrityHardeningIndex <
      secureCompanyScopedJobPhotosIndex &&
    secureCompanyScopedJobPhotosIndex <
      jobPhotoStorageRollbackRetryCorrectionIndex &&
    jobPhotoStorageRollbackRetryCorrectionIndex < nativeProposalEsignSoldJobGateIndex &&
    nativeProposalEsignSoldJobGateIndex < deferredInvariantTriggerScopeIndex &&
    deferredInvariantTriggerScopeIndex < automationEngineFoundationIndex &&
    automationEngineFoundationIndex < goHighLevelWebhookStateMachineIndex &&
    goHighLevelWebhookStateMachineIndex < mightyApesLegacyServiceCorrectionIndex &&
    mightyApesLegacyServiceCorrectionIndex < goHighLevelWebhookGuardrailsIndex &&
    goHighLevelWebhookGuardrailsIndex < legacyLeadDynamicInsertLintCorrectionIndex &&
    legacyLeadDynamicInsertLintCorrectionIndex < canonicalLeadDynamicInsertLintCorrectionIndex &&
    canonicalLeadDynamicInsertLintCorrectionIndex <
      automationSyntheticRegressionCleanupIndex &&
    automationSyntheticRegressionCleanupIndex <
      automationSyntheticLeadSourceCorrectionIndex &&
    automationSyntheticLeadSourceCorrectionIndex <
      goHighLevelInboundAutomationBridgeIndex &&
    goHighLevelInboundAutomationBridgeIndex <
      legacyTwilioSyntheticOrphanCleanupIndex &&
    legacyTwilioSyntheticOrphanCleanupIndex <
      legacyTwilioBrowserVoiceOrphanCleanupIndex &&
    legacyTwilioBrowserVoiceOrphanCleanupIndex <
      leadAutomationEventLegacySchemaCompatibilityIndex &&
    leadAutomationEventLegacySchemaCompatibilityIndex <
      goHighLevelReconciliationAutomationTransitionFixIndex &&
    goHighLevelReconciliationAutomationTransitionFixIndex <
      goHighLevelReconciliationEventRecoveryIndex &&
    goHighLevelReconciliationEventRecoveryIndex < aiQuotaStatusReadModelIndex &&
    aiQuotaStatusReadModelIndex < aiQuotaProbeRefreshCooldownIndex &&
    aiQuotaProbeRefreshCooldownIndex < goHighLevelBridgeObservabilityHardeningIndex
  ) ||
  goHighLevelBridgeObservabilityHardeningIndex !== files.length - 1
) {
  failures.push(
    "CRM identity reconciliation, lead accountability, job-photo hardening, native proposal, deferred-invariant trigger compatibility, automation engine, GHL state machine, Mighty Apes correction, GHL guardrails, cross-schema lint corrections, guarded synthetic cleanup, GHL inbound automation bridge, legacy Twilio orphan cleanup, its Browser Voice correction, lead-trigger schema compatibility, GHL reconciliation transition fix, forward-only event-recovery/Twilio compatibility, the AI quota read model and cooldown, and GHL bridge hardening must remain in reviewed order.",
  );
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

const secureCompanyScopedJobPhotosMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260818030913_secure_company_scoped_job_photos.sql",
  ),
  "utf8",
);
const jobPhotoStorageRollbackRetryCorrectionMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260822054433_job_photo_storage_rollback_retry_correction.sql",
  ),
  "utf8",
);
const normalizedJobPhotoStorageRollbackRetryCorrection =
  jobPhotoStorageRollbackRetryCorrectionMigration
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

if (
  !normalizedJobPhotoStorageRollbackRetryCorrection.startsWith("begin;") ||
  !normalizedJobPhotoStorageRollbackRetryCorrection.endsWith("commit;")
) {
  failures.push(
    "Job-photo Storage rollback/retry correction must execute as one transaction.",
  );
}

if (
  /\b(?:create|alter|drop)\s+table\b/i.test(
    jobPhotoStorageRollbackRetryCorrectionMigration,
  ) ||
  /\b(?:add|drop|alter)\s+column\b/i.test(
    jobPhotoStorageRollbackRetryCorrectionMigration,
  ) ||
  /\b(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.|storage\.)/i.test(
    jobPhotoStorageRollbackRetryCorrectionMigration,
  )
) {
  failures.push(
    "Job-photo Storage rollback/retry correction must not change schema or mutate business/Storage data.",
  );
}

for (const correctionContract of [
  'create policy "wtos users select own rollback job photo deletes" on storage.objects for select to authenticated',
  "bucket_id = 'job-photos'",
  "storage.allow_any_operation( array[ 'storage.object.delete', 'storage.object.delete_many' ] )",
  "public.wtos_can_rollback_job_photo_object(name, owner_id)",
]) {
  if (!normalizedJobPhotoStorageRollbackRetryCorrection.includes(correctionContract)) {
    failures.push(
      `Job-photo Storage rollback/retry correction must retain ${correctionContract}.`,
    );
  }
}

if (
  normalizedJobPhotoStorageRollbackRetryCorrection.includes(
    "storage.object.list",
  ) ||
  normalizedJobPhotoStorageRollbackRetryCorrection.includes(
    "storage.object.get",
  ) ||
  normalizedJobPhotoStorageRollbackRetryCorrection.includes(
    "object.get_authenticated",
  )
) {
  failures.push(
    "Job-photo rollback SELECT policy must not authorize ordinary list/read/download operations.",
  );
}

for (const wrapperName of [
  "wtos_begin_job_photo_upload",
  "wtos_confirm_job_photo_upload_abort",
  "wtos_claim_job_photo_upload_recovery",
  "wtos_confirm_job_photo_upload_recovery_abort",
  "wtos_expire_job_photo_upload_recovery_lease",
]) {
  if (
    !normalizedJobPhotoStorageRollbackRetryCorrection.includes(
      `rename to ${wrapperName}_phase1_base`,
    ) ||
    !normalizedJobPhotoStorageRollbackRetryCorrection.includes(
      `revoke all on function public.${wrapperName}_phase1_base`,
    ) ||
    !normalizedJobPhotoStorageRollbackRetryCorrection.includes(
      `create function public.${wrapperName}`,
    )
  ) {
    failures.push(
      `Job-photo correction must preserve ${wrapperName} under a revoked private base and recreate its public wrapper.`,
    );
  }
}

if (
  (jobPhotoStorageRollbackRetryCorrectionMigration.match(
    /when\s+serialization_failure\s+then/gi,
  ) ?? []).length !== 5 ||
  (jobPhotoStorageRollbackRetryCorrectionMigration.match(
    /errcode\s*=\s*'P0001'/gi,
  ) ?? []).length !== 5 ||
  (jobPhotoStorageRollbackRetryCorrectionMigration.match(/^\s*raise;\s*$/gim) ?? [])
    .length !== 5 ||
  /errcode\s*=\s*'40001'/i.test(
    jobPhotoStorageRollbackRetryCorrectionMigration,
  ) ||
  /when\s+others/i.test(jobPhotoStorageRollbackRetryCorrectionMigration)
) {
  failures.push(
    "Job-photo wrappers must translate only exact semantic 40001 messages to P0001 and bare-rethrow genuine serialization failures.",
  );
}

if (
  /pg_catalog\.substring\([^)]*\bfrom\b/i.test(
    secureCompanyScopedJobPhotosMigration,
  ) ||
  /pg_catalog\.(?:coalesce|nullif|trim|overlay|position|extract)\b/i.test(
    secureCompanyScopedJobPhotosMigration,
  )
) {
  failures.push(
    "Secure job-photo SQL must not schema-qualify PostgreSQL special-expression syntax.",
  );
}

for (const parserSafeSubstring of [
  "pg_catalog.substring(object_filename, 37, 1)",
  "pg_catalog.substring(object_filename, 1, 36)::uuid",
]) {
  if (!secureCompanyScopedJobPhotosMigration.includes(parserSafeSubstring)) {
    failures.push(
      `Secure job-photo SQL must retain parser-safe ${parserSafeSubstring}.`,
    );
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

for (const requiredLeadCompatibilityColumn of [
  "add column if not exists customer_id uuid references public.customers(id) on delete set null",
  "add column if not exists city text",
  "add column if not exists state text",
  "add column if not exists postal_code text",
  "add column if not exists service_type text",
  "add column if not exists service_needed text",
  "leads_customer_id_idx",
]) {
  if (!propertyIntelligenceMigration.includes(requiredLeadCompatibilityColumn)) {
    failures.push(`0026 must include legacy lead compatibility for ${requiredLeadCompatibilityColumn}.`);
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

const googleCalendarMigration = fs.readFileSync(
  path.join(migrationsDir, "0028_google_calendar_scheduling_foundation.sql"),
  "utf8",
);

if (!googleCalendarMigration.trim().startsWith("begin;") ||
    !googleCalendarMigration.trim().endsWith("commit;")) {
  failures.push("0028 must remain transactionally wrapped.");
}

for (const requiredTable of [
  "google_calendar_credentials",
  "google_calendar_connected_calendars",
  "google_calendar_unmatched_events",
]) {
  if (!googleCalendarMigration.includes(`public.${requiredTable}`)) {
    failures.push(`0028 must create or configure ${requiredTable}.`);
  }
}

for (const requiredCalendarColumn of [
  "google_recurring_event_id",
  "google_event_etag",
  "google_event_status",
  "provider_updated_at",
  "deleted_at",
  "conflict_status",
  "conflict_reason",
  "sync_attempt_count",
  "last_synced_direction",
  "metadata",
]) {
  if (!googleCalendarMigration.includes(requiredCalendarColumn)) {
    failures.push(`0028 calendar_event_syncs must include ${requiredCalendarColumn}.`);
  }
}

if (
  !googleCalendarMigration.includes("alter table public.gmail_oauth_states") ||
  !googleCalendarMigration.includes("add column if not exists provider text") ||
  !googleCalendarMigration.includes("check (provider in ('gmail', 'google_calendar'))")
) {
  failures.push("0028 must make OAuth state provider-aware for Gmail and Google Calendar.");
}

for (const serviceOnlyExpectation of [
  "revoke all on table public.google_calendar_credentials from anon",
  "revoke all on table public.google_calendar_credentials from public",
  "revoke all on table public.google_calendar_credentials from authenticated",
  "grant select, insert, update, delete on table public.google_calendar_credentials to service_role",
]) {
  if (!googleCalendarMigration.includes(serviceOnlyExpectation)) {
    failures.push(`0028 must include credential protection: ${serviceOnlyExpectation}.`);
  }
}

for (const metadataTable of [
  "google_calendar_connected_calendars",
  "google_calendar_unmatched_events",
]) {
  if (
    !googleCalendarMigration.includes(
      `revoke delete on table public.${metadataTable} from authenticated`,
    )
  ) {
    failures.push(`0028 must revoke authenticated delete access to ${metadataTable}.`);
  }

  if (
    !googleCalendarMigration.includes(
      `grant select, insert, update on table public.${metadataTable} to authenticated`,
    )
  ) {
    failures.push(`0028 must only grant authenticated read/write metadata access to ${metadataTable}.`);
  }
}

for (const requiredConstraint of [
  "calendar_event_syncs_google_event_status_check",
  "calendar_event_syncs_conflict_status_check",
  "calendar_event_syncs_sync_attempt_count_check",
  "calendar_event_syncs_last_synced_direction_check",
  "google_calendar_connected_calendars_access_role_check",
  "google_calendar_connected_calendars_purpose_check",
  "google_calendar_connected_calendars_sync_mode_check",
  "google_calendar_connected_calendars_status_check",
  "google_calendar_unmatched_events_event_status_check",
  "google_calendar_unmatched_events_review_status_check",
]) {
  if (!googleCalendarMigration.includes(requiredConstraint)) {
    failures.push(`0028 must include ${requiredConstraint}.`);
  }
}

for (const requiredIndex of [
  "calendar_event_syncs_google_event_idx",
  "calendar_event_syncs_recurring_event_idx",
  "google_calendar_connected_calendars_connection_idx",
  "google_calendar_unmatched_events_connection_idx",
]) {
  if (!googleCalendarMigration.includes(requiredIndex)) {
    failures.push(`0028 must include ${requiredIndex}.`);
  }
}

if (/using\s*\(\s*true\s*\)/i.test(googleCalendarMigration) ||
    /with\s+check\s*\(\s*true\s*\)/i.test(googleCalendarMigration)) {
  failures.push("0028 must not use broad USING/WITH CHECK (true) RLS policies.");
}

const googleBusinessProfileMigration = fs.readFileSync(
  path.join(migrationsDir, "0029_google_business_profile_foundation.sql"),
  "utf8",
);

function readProviderCheckValuesFromMigration({
  migration,
  migrationLabel,
  constraintName,
}) {
  const constraintStart = migration.indexOf(`add constraint ${constraintName}`);

  if (constraintStart === -1) {
    failures.push(`${migrationLabel} is missing ${constraintName}.`);
    return [];
  }

  const constraintEnd = migration.indexOf(");", constraintStart);

  if (constraintEnd === -1) {
    failures.push(`${migrationLabel} ${constraintName} block is not terminated.`);
    return [];
  }

  const constraintBlock = migration.slice(constraintStart, constraintEnd);

  return [...constraintBlock.matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .sort();
}

const integrationProvidersWithGbp = [
  "google_business_profile",
  ...supportedIntegrationProviders,
].sort();
const integrationProvidersWithQuickBooks = [
  "quickbooks_online",
  ...integrationProvidersWithGbp,
].sort();
const integrationProvidersWithElectronicSignatures = [
  "docusign",
  "dropbox_sign",
  ...integrationProvidersWithQuickBooks,
].sort();
const leadSourceMappingProvidersWithGbp = [
  "google_business_profile",
  "gohighlevel",
  "twilio",
  "twilio_sms",
  "website",
  "yelp",
].sort();
const leadIntakeRecordProvidersWithGbp = [
  "email",
  "gmail",
  "gohighlevel",
  "google_business_profile",
  "manual",
  "referral",
  "twilio",
  "twilio_sms",
  "website",
  "yelp",
].sort();

for (const constraintName of [
  "integration_connections_provider_check",
  "integration_sync_logs_provider_check",
]) {
  const providers = readProviderCheckValuesFromMigration({
    migration: googleBusinessProfileMigration,
    migrationLabel: "0029",
    constraintName,
  });

  if (JSON.stringify(providers) !== JSON.stringify(integrationProvidersWithGbp)) {
    failures.push(
      `0029 ${constraintName} must allow exactly ${integrationProvidersWithGbp.join(", ")}.`,
    );
  }
}

const leadSourceProviders = readProviderCheckValuesFromMigration({
  migration: googleBusinessProfileMigration,
  migrationLabel: "0029",
  constraintName: "lead_source_mappings_provider_check",
});

if (
  JSON.stringify(leadSourceProviders) !==
  JSON.stringify(leadSourceMappingProvidersWithGbp)
) {
  failures.push(
    `0029 lead_source_mappings_provider_check must allow exactly ${leadSourceMappingProvidersWithGbp.join(", ")}.`,
  );
}

const leadIntakeProviders = readProviderCheckValuesFromMigration({
  migration: googleBusinessProfileMigration,
  migrationLabel: "0029",
  constraintName: "lead_intake_records_provider_check",
});

if (
  JSON.stringify(leadIntakeProviders) !==
  JSON.stringify(leadIntakeRecordProvidersWithGbp)
) {
  failures.push(
    `0029 lead_intake_records_provider_check must allow exactly ${leadIntakeRecordProvidersWithGbp.join(", ")}.`,
  );
}

if (!googleBusinessProfileMigration.trim().startsWith("begin;") ||
    !googleBusinessProfileMigration.trim().endsWith("commit;")) {
  failures.push("0029 must be wrapped in an explicit transaction.");
}

if (/using\s*\(\s*true\s*\)/i.test(googleBusinessProfileMigration) ||
    /with\s+check\s*\(\s*true\s*\)/i.test(googleBusinessProfileMigration)) {
  failures.push("0029 must not add broad USING/WITH CHECK (true) RLS policies.");
}

if (googleBusinessProfileMigration.includes("unknown_provider")) {
  failures.push("0029 must not allow unknown_provider.");
}

const quickBooksOnlineMigration = fs.readFileSync(
  path.join(migrationsDir, "0030_quickbooks_online_foundation.sql"),
  "utf8",
);

for (const constraintName of [
  "integration_connections_provider_check",
  "integration_sync_logs_provider_check",
]) {
  const providers = readProviderCheckValuesFromMigration({
    migration: quickBooksOnlineMigration,
    migrationLabel: "0030",
    constraintName,
  });

  if (JSON.stringify(providers) !== JSON.stringify(integrationProvidersWithQuickBooks)) {
    failures.push(
      `0030 ${constraintName} must allow exactly ${integrationProvidersWithQuickBooks.join(", ")}.`,
    );
  }

  for (const requiredProvider of [
    "google_business_profile",
    "quickbooks_online",
    "twilio",
    "twilio_sms",
    "website",
    "yelp",
  ]) {
    if (!providers.includes(requiredProvider)) {
      failures.push(`0030 ${constraintName} must allow ${requiredProvider}.`);
    }
  }

  if (providers.includes("unknown_provider")) {
    failures.push(`0030 ${constraintName} must reject unknown_provider.`);
  }
}

if (!quickBooksOnlineMigration.trim().startsWith("begin;") ||
    !quickBooksOnlineMigration.trim().endsWith("commit;")) {
  failures.push("0030 must be wrapped in an explicit transaction.");
}

if (/using\s*\(\s*true\s*\)/i.test(quickBooksOnlineMigration) ||
    /with\s+check\s*\(\s*true\s*\)/i.test(quickBooksOnlineMigration)) {
  failures.push("0030 must not add broad USING/WITH CHECK (true) RLS policies.");
}

if (!quickBooksOnlineMigration.includes("quickbooks_online")) {
  failures.push("0030 must add the QuickBooks Online provider key.");
}

const electronicSignaturesMigration = fs.readFileSync(
  path.join(migrationsDir, "0031_electronic_signatures_foundation.sql"),
  "utf8",
);

for (const constraintName of [
  "integration_connections_provider_check",
  "integration_sync_logs_provider_check",
]) {
  const providers = readProviderCheckValuesFromMigration({
    migration: electronicSignaturesMigration,
    migrationLabel: "0031",
    constraintName,
  });

  if (
    JSON.stringify(providers) !==
    JSON.stringify(integrationProvidersWithElectronicSignatures)
  ) {
    failures.push(
      `0031 ${constraintName} must allow exactly ${integrationProvidersWithElectronicSignatures.join(", ")}.`,
    );
  }

  for (const requiredProvider of ["docusign", "dropbox_sign", "quickbooks_online"]) {
    if (!providers.includes(requiredProvider)) {
      failures.push(`0031 ${constraintName} must allow ${requiredProvider}.`);
    }
  }

  if (providers.includes("unknown_provider")) {
    failures.push(`0031 ${constraintName} must reject unknown_provider.`);
  }
}

if (!electronicSignaturesMigration.trim().startsWith("begin;") ||
    !electronicSignaturesMigration.trim().endsWith("commit;")) {
  failures.push("0031 must be wrapped in an explicit transaction.");
}

if (/using\s*\(\s*true\s*\)/i.test(electronicSignaturesMigration) ||
    /with\s+check\s*\(\s*true\s*\)/i.test(electronicSignaturesMigration)) {
  failures.push("0031 must not add broad USING/WITH CHECK (true) RLS policies.");
}

if (!electronicSignaturesMigration.includes("docusign") ||
    !electronicSignaturesMigration.includes("dropbox_sign")) {
  failures.push("0031 must add DocuSign and Dropbox Sign provider keys.");
}

const proposalBuilderMigration = fs.readFileSync(
  path.join(migrationsDir, "0032_estimate_proposal_builder_v2.sql"),
  "utf8",
);

if (!proposalBuilderMigration.trim().startsWith("begin;") ||
    !proposalBuilderMigration.trim().endsWith("commit;")) {
  failures.push("0032 must be wrapped in an explicit transaction.");
}

for (const requiredTable of [
  "proposal_templates",
  "estimate_proposal_revisions",
  "estimate_proposal_sections",
  "estimate_proposal_options",
  "estimate_proposal_acceptances",
  "proposal_payment_schedules",
  "proposal_audit_events",
]) {
  if (!proposalBuilderMigration.includes(`public.${requiredTable}`)) {
    failures.push(`0032 must create or configure ${requiredTable}.`);
  }
}

for (const requiredDocumentCategory of ["proposal", "signed_proposal"]) {
  if (!proposalBuilderMigration.includes(`'${requiredDocumentCategory}'`)) {
    failures.push(`0032 documents category check must allow ${requiredDocumentCategory}.`);
  }
}

for (const requiredProposalStatus of [
  "ready_for_review",
  "ready_to_send",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "superseded",
  "converted_to_job",
]) {
  if (!proposalBuilderMigration.includes(`'${requiredProposalStatus}'`)) {
    failures.push(`0032 proposal revision status check must allow ${requiredProposalStatus}.`);
  }
}

for (const requiredOptionValue of [
  "add_on_upgrade",
  "replacement_alternative",
  "required_choice",
  "optional_choice",
  "additive",
  "replace_base_amount",
  "full_alternate_total",
]) {
  if (!proposalBuilderMigration.includes(`'${requiredOptionValue}'`)) {
    failures.push(`0032 proposal options must include ${requiredOptionValue}.`);
  }
}

for (const requiredColumn of [
  "customer_visible_notes",
  "internal_notes",
  "requires_signature",
  "requires_deposit_before_job",
  "quickbooks_sync_status",
  "source_snapshot",
  "selected_option_ids",
  "terms_accepted",
  "idempotency_key",
]) {
  if (!proposalBuilderMigration.includes(requiredColumn)) {
    failures.push(`0032 must include proposal column ${requiredColumn}.`);
  }
}

for (const requiredPolicyHelper of [
  "public.wtos_can_read_company",
  "public.wtos_can_manage_sales",
  "public.wtos_can_manage_financials",
  "public.wtos_can_manage_settings",
]) {
  if (!proposalBuilderMigration.includes(requiredPolicyHelper)) {
    failures.push(`0032 must use scoped RLS helper ${requiredPolicyHelper}.`);
  }
}

if (/using\s*\(\s*true\s*\)/i.test(proposalBuilderMigration) ||
    /with\s+check\s*\(\s*true\s*\)/i.test(proposalBuilderMigration)) {
  failures.push("0032 must not add broad USING/WITH CHECK (true) RLS policies.");
}

if (/grant\s+[^;]*delete[^;]*to\s+authenticated/i.test(proposalBuilderMigration)) {
  failures.push("0032 must not grant DELETE privileges to authenticated users.");
}

if (proposalBuilderMigration.includes("public.inspection_findings")) {
  failures.push("0032 must not reference a non-existent inspection_findings table.");
}

if (!proposalBuilderMigration.includes("check (accepted_total >= base_total)")) {
  failures.push("0032 must keep accepted proposal totals compatible with base totals.");
}

if (!proposalBuilderMigration.includes("proposal_templates") ||
    !proposalBuilderMigration.includes("WeatherTech Roofing LLC") ||
    !proposalBuilderMigration.includes("IHC Painting")) {
  failures.push("0032 must seed company-aware WeatherTech and IHC proposal templates.");
}

const aiToolsMigration = fs.readFileSync(
  path.join(migrationsDir, "0033_ai_tools_operating_brain.sql"),
  "utf8",
);

if (!aiToolsMigration.trim().startsWith("begin;") ||
    !aiToolsMigration.trim().endsWith("commit;")) {
  failures.push("0033 must be wrapped in an explicit transaction.");
}

for (const requiredTable of [
  "ai_saved_analyses",
  "ai_audit_events",
  "ai_usage_limits",
]) {
  if (!aiToolsMigration.includes(`public.${requiredTable}`)) {
    failures.push(`0033 must create or configure ${requiredTable}.`);
  }

  if (!aiToolsMigration.includes(`alter table public.${requiredTable} enable row level security`)) {
    failures.push(`0033 must enable RLS for ${requiredTable}.`);
  }
}

for (const requiredProvider of ["disabled", "openai", "anthropic", "owner_approved"]) {
  if (!aiToolsMigration.includes(`'${requiredProvider}'`)) {
    failures.push(`0033 AI provider checks must allow ${requiredProvider}.`);
  }
}

for (const requiredAiTask of [
  "daily_brief",
  "command",
  "scope_writer",
  "estimate_assistant",
  "proposal_review",
  "inspection_analysis",
  "sales_analysis",
  "operations_analysis",
  "financial_analysis",
  "communication_draft",
  "marketing_analysis",
  "weather_analysis",
  "document_analysis",
  "saved_analysis",
]) {
  if (!aiToolsMigration.includes(`'${requiredAiTask}'`)) {
    failures.push(`0033 task_type checks must allow ${requiredAiTask}.`);
  }
}

for (const requiredPolicyHelper of [
  "public.wtos_can_read_company",
  "public.wtos_can_manage_sales",
  "public.wtos_can_manage_production",
  "public.wtos_can_manage_financials",
  "public.wtos_can_manage_documents",
  "public.wtos_can_manage_settings",
]) {
  if (!aiToolsMigration.includes(requiredPolicyHelper)) {
    failures.push(`0033 must use scoped RLS helper ${requiredPolicyHelper}.`);
  }
}

if (/using\s*\(\s*true\s*\)/i.test(aiToolsMigration) ||
    /with\s+check\s*\(\s*true\s*\)/i.test(aiToolsMigration)) {
  failures.push("0033 must not add broad USING/WITH CHECK (true) RLS policies.");
}

if (/grant\s+[^;]*delete[^;]*to\s+authenticated/i.test(aiToolsMigration)) {
  failures.push("0033 must not grant DELETE privileges to authenticated users.");
}

if (!aiToolsMigration.includes("default false") ||
    !aiToolsMigration.includes("daily_request_limit integer not null default 0") ||
    !aiToolsMigration.includes("per_company_monthly_budget_cents integer not null default 0")) {
  failures.push("0033 must keep live AI disabled and budget/request limits at zero by default.");
}

if (!aiToolsMigration.includes("revoke all on") ||
    !aiToolsMigration.includes("from anon")) {
  failures.push("0033 must revoke anon access to AI persistence tables.");
}

if (/api[_ -]?key|access[_ -]?token|refresh[_ -]?token|sk-[a-z0-9]/i.test(aiToolsMigration)) {
  failures.push("0033 must not contain secret material or credential placeholders.");
}

const crmIdentityReconciliationMigration = fs.readFileSync(
  path.join(migrationsDir, "20260814051533_crm_identity_reconciliation.sql"),
  "utf8",
);
const crmIdentityReconciliationHardeningMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260814053339_crm_identity_reconciliation_runtime_hardening.sql",
  ),
  "utf8",
);
const crmIdentityReconciliationInvariantHardeningMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260814054250_crm_identity_reconciliation_invariant_hardening.sql",
  ),
  "utf8",
);
const crmIdentityReconciliationStaleVersionHardeningMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260814061253_crm_identity_reconciliation_stale_version_error_hardening.sql",
  ),
  "utf8",
);
const crmIdentityReconciliationReleaseHardeningMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260814063407_crm_identity_reconciliation_release_hardening.sql",
  ),
  "utf8",
);
const mightyApesYelpLeadIntakeMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260815033229_mighty_apes_yelp_lead_intake.sql",
  ),
  "utf8",
);
const mightyApesYelpAuditLockPrivilegeMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260815040010_mighty_apes_yelp_audit_lock_privilege.sql",
  ),
  "utf8",
);
const leadAttributionAccountabilityMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260816122114_lead_attribution_marketing_accountability_phase_1.sql",
  ),
  "utf8",
);
const leadAccountabilityStaleErrorHardeningMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260816143152_lead_accountability_nonretryable_stale_errors.sql",
  ),
  "utf8",
);
const leadAccountabilityIdempotencyIntegrityHardeningMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260816164202_lead_accountability_idempotency_integrity_hardening.sql",
  ),
  "utf8",
);
const automationEngineFoundationMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260902024804_automation_engine_foundation.sql",
  ),
  "utf8",
);
const aiQuotaStatusReadModelMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260904060243_ai_quota_status_read_model.sql",
  ),
  "utf8",
);
const normalizedAiQuotaStatusReadModelMigration = aiQuotaStatusReadModelMigration
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const aiQuotaProbeRefreshCooldownMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260904104733_ai_quota_probe_refresh_cooldown.sql",
  ),
  "utf8",
);
const normalizedAiQuotaProbeRefreshCooldownMigration =
  aiQuotaProbeRefreshCooldownMigration.replace(/\s+/g, " ").trim().toLowerCase();
const goHighLevelWebhookStateMachineMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260902042428_gohighlevel_webhook_durable_state_machine.sql",
  ),
  "utf8",
);
const goHighLevelWebhookGuardrailsMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260902044154_gohighlevel_webhook_uninstall_guardrails.sql",
  ),
  "utf8",
);
const legacyLeadDynamicInsertLintCorrectionMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260902044714_legacy_lead_dynamic_insert_lint_correction.sql",
  ),
  "utf8",
);
const canonicalLeadDynamicInsertLintCorrectionMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260902045112_canonical_lead_dynamic_insert_lint_correction.sql",
  ),
  "utf8",
);
const goHighLevelInboundAutomationBridgeMigration = fs.readFileSync(
  path.join(
    migrationsDir,
    "20260902061135_gohighlevel_inbound_automation_bridge.sql",
  ),
  "utf8",
);

for (const requiredContract of [
  "begin;",
  "commit;",
  "create table public.crm_identity_reconciliation_events",
  "unique (company_id, operation_key)",
  "alter table public.crm_identity_reconciliation_events enable row level security",
  "crm_identity_reconciliation_events_immutable",
  "audit events are immutable",
  "security definer",
  "set search_path = ''",
  "public.wtos_can_reconcile_customer_property(request_company_id)",
  "profile.role in ('owner', 'admin')",
  "membership.role in ('owner', 'admin')",
  "create or replace function public.wtos_reconcile_customer_property",
  "reconciliation_request jsonb",
  "pg_advisory_xact_lock",
  "for update",
  "expected_updated_at",
  "changed after review",
  "ambiguous within the selected company",
  "conflicting customer link",
  "outside the reviewed lead/property graph",
  "Existing CRM graph contains a cross-company relationship",
  "before update of company_id",
  "update public.leads",
  "update public.properties",
  "update public.estimates",
  "update public.inspections",
  "update public.jobs",
  "update public.schedule_events",
  "update public.office_tasks",
  "revoke all on function public.wtos_reconcile_customer_property(jsonb)",
  "from public, anon, authenticated, service_role",
  "grant execute on function public.wtos_reconcile_customer_property(jsonb)",
  "to authenticated",
  "like 'TEST WTOS REGRESSION%'",
]) {
  if (!crmIdentityReconciliationMigration.includes(requiredContract)) {
    failures.push(
      `CRM identity reconciliation migration is missing required contract: ${requiredContract}.`,
    );
  }
}

if (!crmIdentityReconciliationMigration.trimStart().startsWith("begin;") ||
    !crmIdentityReconciliationMigration.trimEnd().endsWith("commit;")) {
  failures.push("CRM identity reconciliation migration must use one explicit transaction wrapper.");
}

if (/\bset\s+(?:status|pipeline_stage)\s*=/i.test(crmIdentityReconciliationMigration)) {
  failures.push("CRM identity reconciliation must not mutate lead status or pipeline stage.");
}

for (const forbiddenMutationTarget of [
  "public.invoices",
  "public.invoice_line_items",
  "public.payments",
  "public.stripe_company_accounts",
  "public.stripe_object_mappings",
  "public.stripe_webhook_events",
  "public.sms_messages",
  "public.communication_provider_events",
  "public.integration_connections",
  "public.email_messages",
]) {
  if (crmIdentityReconciliationMigration.includes(forbiddenMutationTarget)) {
    failures.push(
      `CRM identity reconciliation must not reference out-of-scope table ${forbiddenMutationTarget}.`,
    );
  }
}

if (/\busing\s*\(\s*true\s*\)|\bwith\s+check\s*\(\s*true\s*\)/i.test(
  crmIdentityReconciliationMigration,
)) {
  failures.push("CRM identity reconciliation must not add broad true RLS policies.");
}

for (const requiredHardeningContract of [
  "begin;",
  "commit;",
  "create or replace function public.wtos_reconcile_customer_property",
  "set search_path = ''",
  "extensions.digest(reconciliation_request::text, 'sha256')",
  "to_jsonb(source_lead) ->> 'contact_name'",
  "to_jsonb(source_lead) ->> 'customer_name'",
  "revoke insert on table public.crm_identity_reconciliation_events from service_role",
  "(select auth.jwt() ->> 'role') = 'service_role'",
  "get diagnostics linked_property = row_count",
  "get diagnostics linked_lead = row_count",
  "get diagnostics affected_rows = row_count",
  "'customer', reconciliation_request -> 'customer'",
  "revoke all on function public.wtos_reconcile_customer_property(jsonb)",
  "grant execute on function public.wtos_reconcile_customer_property(jsonb)",
]) {
  if (!crmIdentityReconciliationHardeningMigration.includes(requiredHardeningContract)) {
    failures.push(
      `CRM identity runtime hardening is missing required contract: ${requiredHardeningContract}.`,
    );
  }
}

if (!crmIdentityReconciliationHardeningMigration.trimStart().startsWith("begin;") ||
    !crmIdentityReconciliationHardeningMigration.trimEnd().endsWith("commit;")) {
  failures.push("CRM identity runtime hardening must use one explicit transaction wrapper.");
}

if (crmIdentityReconciliationHardeningMigration.includes("source_lead.contact_name")) {
  failures.push("CRM identity runtime hardening must preserve legacy production lead-name compatibility.");
}

if (/\bset\s+(?:status|pipeline_stage)\s*=/i.test(crmIdentityReconciliationHardeningMigration)) {
  failures.push("CRM identity runtime hardening must not mutate lead status or pipeline stage.");
}

for (const forbiddenHardeningTarget of [
  "public.invoices",
  "public.invoice_line_items",
  "public.payments",
  "public.stripe_company_accounts",
  "public.stripe_object_mappings",
  "public.stripe_webhook_events",
  "public.sms_messages",
  "public.communication_provider_events",
  "public.integration_connections",
  "public.email_messages",
]) {
  if (crmIdentityReconciliationHardeningMigration.includes(forbiddenHardeningTarget)) {
    failures.push(
      `CRM identity runtime hardening must not reference out-of-scope table ${forbiddenHardeningTarget}.`,
    );
  }
}

for (const requiredInvariantHardeningContract of [
  "begin;",
  "commit;",
  "revoke all on table public.crm_identity_reconciliation_events from service_role",
  "grant select, delete on table public.crm_identity_reconciliation_events to service_role",
  "set local lock_timeout = '5s'",
  "lock table",
  "in share row exclusive mode",
  "Existing CRM graph contains a property/customer mismatch; invariant hardening aborted.",
  "create or replace function public.wtos_enforce_crm_identity_property_customer_invariant()",
  "security definer",
  "set search_path = ''",
  "create or replace function public.wtos_acquire_crm_identity_invariant_lock()",
  "pg_try_advisory_xact_lock",
  "pg_advisory_xact_lock",
  "wtos:crm-identity-property-invariant:coordinator",
  "Concurrent CRM identity mutation completed; retry with fresh versions.",
  "using errcode = '40001'",
  "create or replace function public.wtos_serialize_crm_identity_link_statement()",
  "rename to wtos_reconcile_customer_property_serialized_core",
  "revoke all on function public.wtos_reconcile_customer_property_serialized_core(jsonb)",
  "return public.wtos_reconcile_customer_property_serialized_core(reconciliation_request)",
  "grant execute on function public.wtos_reconcile_customer_property(jsonb)",
  "before update of company_id, customer_id on public.properties",
  "before update of company_id, customer_id, property_id on public.leads",
  "before update of company_id, customer_id, property_id on public.estimates",
  "before update of company_id, customer_id, property_id on public.inspections",
  "before update of company_id, customer_id, property_id on public.jobs",
  "before update of company_id, customer_id, property_id on public.schedule_events",
  "before update of company_id, customer_id, property_id on public.office_tasks",
  "unnest(array[current_property_id, prior_property_id])",
  "join public.leads as child on child.property_id = property.id",
  "join public.estimates as child on child.property_id = property.id",
  "join public.inspections as child on child.property_id = property.id",
  "join public.jobs as child on child.property_id = property.id",
  "join public.schedule_events as child on child.property_id = property.id",
  "join public.office_tasks as child on child.property_id = property.id",
  "Property customer assignment conflicts with an existing CRM graph row.",
  "create constraint trigger properties_enforce_crm_identity_property_customer",
  "create constraint trigger leads_enforce_crm_identity_property_customer",
  "create constraint trigger estimates_enforce_crm_identity_property_customer",
  "create constraint trigger inspections_enforce_crm_identity_property_customer",
  "create constraint trigger jobs_enforce_crm_identity_property_customer",
  "create constraint trigger schedule_events_enforce_crm_identity_property_customer",
  "create constraint trigger office_tasks_enforce_crm_identity_property_customer",
  "deferrable initially deferred",
  "revoke all on function public.wtos_enforce_crm_identity_property_customer_invariant()",
  "from public, anon, authenticated, service_role",
]) {
  if (!crmIdentityReconciliationInvariantHardeningMigration.includes(
    requiredInvariantHardeningContract,
  )) {
    failures.push(
      `CRM identity invariant hardening is missing required contract: ${requiredInvariantHardeningContract}.`,
    );
  }
}

if (!crmIdentityReconciliationInvariantHardeningMigration.trimStart().startsWith("begin;") ||
    !crmIdentityReconciliationInvariantHardeningMigration.trimEnd().endsWith("commit;")) {
  failures.push("CRM identity invariant hardening must use one explicit transaction wrapper.");
}

if (/grant\s+[^;]*(?:insert|update|truncate)[^;]*on\s+table\s+public\.crm_identity_reconciliation_events[^;]*to\s+service_role/i.test(
  crmIdentityReconciliationInvariantHardeningMigration,
)) {
  failures.push(
    "CRM identity invariant hardening must not grant service_role insert, update, or truncate access to the audit ledger.",
  );
}

if (/\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:leads|customers|properties|estimates|inspections|jobs|schedule_events|office_tasks)\b/i.test(
  crmIdentityReconciliationInvariantHardeningMigration,
)) {
  failures.push("CRM identity invariant hardening must not backfill or mutate CRM business rows.");
}

if (/\bfor\s+(?:share|update)\b/i.test(
  crmIdentityReconciliationInvariantHardeningMigration,
)) {
  failures.push(
    "CRM identity invariant hardening must not introduce a property/child tuple-lock inversion.",
  );
}

for (const requiredStaleVersionHardeningContract of [
  "begin;",
  "commit;",
  "create or replace function public.wtos_reconcile_customer_property",
  "security definer",
  "set search_path = ''",
  "perform public.wtos_acquire_crm_identity_invariant_lock()",
  "return public.wtos_reconcile_customer_property_serialized_core(",
  "when serialization_failure then",
  "message = sqlerrm",
  "errcode = 'P0001'",
  "revoke all on function public.wtos_reconcile_customer_property(jsonb)",
  "from public, anon, authenticated, service_role",
  "grant execute on function public.wtos_reconcile_customer_property(jsonb)",
  "to authenticated",
]) {
  if (!crmIdentityReconciliationStaleVersionHardeningMigration.includes(
    requiredStaleVersionHardeningContract,
  )) {
    failures.push(
      `CRM identity stale-version hardening is missing required contract: ${requiredStaleVersionHardeningContract}.`,
    );
  }
}

if (!crmIdentityReconciliationStaleVersionHardeningMigration.trimStart().startsWith("begin;") ||
    !crmIdentityReconciliationStaleVersionHardeningMigration.trimEnd().endsWith("commit;")) {
  failures.push("CRM identity stale-version hardening must use one explicit transaction wrapper.");
}

if (!/perform public\.wtos_acquire_crm_identity_invariant_lock\(\);\s*begin\s*return public\.wtos_reconcile_customer_property_serialized_core\(/s.test(
  crmIdentityReconciliationStaleVersionHardeningMigration,
)) {
  failures.push(
    "CRM identity stale-version hardening must acquire the coordinator outside the core exception block.",
  );
}

if (/when\s+others/i.test(crmIdentityReconciliationStaleVersionHardeningMigration)) {
  failures.push("CRM identity stale-version hardening must catch only serialization_failure.");
}

if (/\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:leads|customers|properties|estimates|inspections|jobs|schedule_events|office_tasks)\b/i.test(
  crmIdentityReconciliationStaleVersionHardeningMigration,
)) {
  failures.push("CRM identity stale-version hardening must not mutate CRM business rows.");
}

for (const requiredReleaseHardeningContract of [
  "begin;",
  "commit;",
  "set local lock_timeout = '5s'",
  "create or replace function public.wtos_reconcile_customer_property_serialized_core(",
  "security definer",
  "set search_path = ''",
  "extensions.digest(reconciliation_request::text, 'sha256')",
  "to_jsonb(source_lead) ->> 'contact_name'",
  "to_jsonb(source_lead) ->> 'customer_name'",
  "Creating a customer requires reviewed name, address, and phone or email evidence.",
  "when normalized_name is null or normalized_address is null then null",
  "normalized_address is not null",
  "normalized_name is not null",
  "or office_task_record.property_id is distinct from target_property.id",
  "revoke all on function public.wtos_reconcile_customer_property_serialized_core(jsonb)",
  "create trigger customers_serialize_crm_identity_insert",
  "before insert on public.customers",
  "create trigger customers_serialize_crm_identity_update",
  "before update of company_id, display_name, contact_name, phone, email, property_address",
  "drop trigger properties_serialize_crm_identity_update on public.properties",
  "before update of company_id, customer_id, address, postal_code on public.properties",
  "revoke update on table public.leads, public.properties from authenticated",
  "revoke update (customer_id, property_id) on table public.leads from authenticated",
  "revoke update (customer_id) on table public.properties from authenticated",
  "column_name not in ('customer_id', 'property_id')",
  "column_name <> 'customer_id'",
  "grant update (%s) on table public.leads to authenticated",
  "grant update (%s) on table public.properties to authenticated",
  "lock table",
  "in share row exclusive mode",
  "Existing CRM graph contains a cross-company relationship; reconciliation migration aborted.",
  "Existing CRM graph contains a property/customer mismatch; release hardening aborted.",
  "create or replace function public.wtos_protect_crm_identity_reconciliation_event()",
  "(select auth.jwt() ->> 'role') = 'service_role'",
  "source_lead.id = old.source_lead_id",
  "to_jsonb(source_lead) ->> 'contact_name'",
  "to_jsonb(source_lead) ->> 'customer_name'",
  "like 'TEST WTOS REGRESSION%'",
  "revoke all on function public.wtos_protect_crm_identity_reconciliation_event()",
  "create index crm_identity_reconciliation_events_source_lead_fk_idx",
  "create index crm_identity_reconciliation_events_actor_user_fk_idx",
  "create index crm_identity_reconciliation_events_customer_fk_idx",
  "create index crm_identity_reconciliation_events_property_fk_idx",
]) {
  if (!crmIdentityReconciliationReleaseHardeningMigration.includes(
    requiredReleaseHardeningContract,
  )) {
    failures.push(
      `CRM identity release hardening is missing required contract: ${requiredReleaseHardeningContract}.`,
    );
  }
}

for (const requiredCrossCompanySourceTable of [
  "from public.leads as row_record",
  "from public.properties as row_record",
  "from public.estimates as row_record",
  "from public.inspections as row_record",
  "from public.jobs as row_record",
  "from public.schedule_events as row_record",
  "from public.office_tasks as row_record",
  "left join public.customers as customer",
  "left join public.properties as property",
  "left join public.leads as lead",
  "left join public.estimates as estimate",
  "left join public.inspections as inspection",
  "left join public.jobs as job",
  "left join public.schedule_events as schedule_event",
]) {
  if (!crmIdentityReconciliationReleaseHardeningMigration.includes(
    requiredCrossCompanySourceTable,
  )) {
    failures.push(
      `CRM identity release hardening cross-company preflight is incomplete: ${requiredCrossCompanySourceTable}.`,
    );
  }
}

for (const requiredReverseInvariantTable of [
  "join public.leads as child on child.property_id = property.id",
  "join public.estimates as child on child.property_id = property.id",
  "join public.inspections as child on child.property_id = property.id",
  "join public.jobs as child on child.property_id = property.id",
  "join public.schedule_events as child on child.property_id = property.id",
  "join public.office_tasks as child on child.property_id = property.id",
]) {
  if (!crmIdentityReconciliationReleaseHardeningMigration.includes(
    requiredReverseInvariantTable,
  )) {
    failures.push(
      `CRM identity release hardening reverse preflight is incomplete: ${requiredReverseInvariantTable}.`,
    );
  }
}

if (!crmIdentityReconciliationReleaseHardeningMigration.trimStart().startsWith("begin;") ||
    !crmIdentityReconciliationReleaseHardeningMigration.trimEnd().endsWith("commit;")) {
  failures.push("CRM identity release hardening must use one explicit transaction wrapper.");
}

if (/create\s+or\s+replace\s+function\s+public\.wtos_reconcile_customer_property\s*\(/i.test(
  crmIdentityReconciliationReleaseHardeningMigration,
)) {
  failures.push("CRM identity release hardening must preserve the fourth migration's public wrapper.");
}

if (/old\.operation_key/i.test(crmIdentityReconciliationReleaseHardeningMigration)) {
  failures.push("CRM identity release hardening cleanup must not trust the operation key marker.");
}

if (/\bset\s+(?:status|pipeline_stage)\s*=/i.test(
  crmIdentityReconciliationReleaseHardeningMigration,
)) {
  failures.push("CRM identity release hardening must not mutate lead status or pipeline stage.");
}

for (const requiredMightyApesContract of [
  "begin;",
  "commit;",
  "create table public.mighty_apes_yelp_webhook_events",
  "delivery_id text not null unique",
  "event_type in ('lead.created', 'lead.test')",
  "outcome in ('created', 'duplicate', 'test_accepted')",
  "alter table public.mighty_apes_yelp_webhook_events enable row level security",
  "using (public.wtos_can_read_company(company_id))",
  "revoke all on table public.mighty_apes_yelp_webhook_events from public",
  "revoke all on table public.mighty_apes_yelp_webhook_events from anon",
  "revoke all on table public.mighty_apes_yelp_webhook_events from authenticated",
  "revoke all on table public.mighty_apes_yelp_webhook_events from service_role",
  "grant select on table public.mighty_apes_yelp_webhook_events to authenticated",
  "grant select, insert, delete on table public.mighty_apes_yelp_webhook_events to service_role",
  "create trigger mighty_apes_yelp_webhook_events_immutable",
  "Mighty Apes Yelp webhook audit events are immutable.",
  "old.delivery_id like 'TEST WTOS MIGHTY APES REGRESSION:%'",
  "old.provider_lead_id like 'TEST WTOS MIGHTY APES REGRESSION:%'",
  "create or replace function public.wtos_ingest_mighty_apes_yelp(intake_request jsonb)",
  "security invoker",
  "set search_path = ''",
  "'mighty-apes:yelp:delivery:' || request_delivery_id",
  "'mighty-apes:yelp:lead:' || request_lead_id",
  "MIGHTY_APES_YELP_DELIVERY_CONFLICT",
  "MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT",
  "request_campaign_id <> '00LZA1SuPKX0yUnsdthgLg'",
  "company.name = 'WeatherTech Roofing LLC'",
  "company.trade = 'roofing'",
  "request_event = 'lead.test'",
  "'status', 'test_accepted'",
  "where intake.provider = 'yelp'",
  "and intake.provider_event_id = request_lead_id",
  "existing_intake.company_id is distinct from target_company.id",
  "existing_sync_provider is distinct from 'yelp'",
  "column_name = 'customer_name'",
  "column_name = 'contact_name'",
  "source,\n    source_detail,",
  "'Yelp',\n    'Mighty Apes',",
  "'weathertech_roofing'",
  "'weathertech_phoenix'",
  "request_message",
  "request_received_at",
  "request_created_at",
  "revoke all on function public.wtos_ingest_mighty_apes_yelp(jsonb)",
  "from public, anon, authenticated",
  "grant execute on function public.wtos_ingest_mighty_apes_yelp(jsonb)",
  "to service_role",
]) {
  if (!mightyApesYelpLeadIntakeMigration.includes(requiredMightyApesContract)) {
    failures.push(
      `Mighty Apes Yelp lead intake is missing required contract: ${requiredMightyApesContract}.`,
    );
  }
}

if (!mightyApesYelpLeadIntakeMigration.trimStart().startsWith("begin;") ||
    !mightyApesYelpLeadIntakeMigration.trimEnd().endsWith("commit;")) {
  failures.push("Mighty Apes Yelp lead intake must use one explicit transaction wrapper.");
}

const mightyApesDeliveryLockIndex = mightyApesYelpLeadIntakeMigration.indexOf(
  "'mighty-apes:yelp:delivery:' || request_delivery_id",
);
const mightyApesLeadLockIndex = mightyApesYelpLeadIntakeMigration.indexOf(
  "'mighty-apes:yelp:lead:' || request_lead_id",
);

if (mightyApesDeliveryLockIndex === -1 ||
    mightyApesLeadLockIndex === -1 ||
    mightyApesDeliveryLockIndex >= mightyApesLeadLockIndex) {
  failures.push("Mighty Apes Yelp intake must lock the delivery ID before the provider lead ID.");
}

if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(
  mightyApesYelpLeadIntakeMigration,
)) {
  failures.push("Mighty Apes Yelp lead intake must not add broad true RLS policies.");
}

if (/\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:customers|properties|estimates|inspections|jobs|schedule_events|invoices|payments|sms_messages|email_messages)\b/i.test(
  mightyApesYelpLeadIntakeMigration,
)) {
  failures.push("Mighty Apes Yelp intake must not mutate customer, job, financial, or communication records.");
}

if (/\b(?:raw_body|signature|webhook_secret)\b/i.test(
  mightyApesYelpLeadIntakeMigration.slice(
    0,
    mightyApesYelpLeadIntakeMigration.indexOf("create index mighty_apes_yelp_webhook_events_company_received_idx"),
  ),
)) {
  failures.push("Mighty Apes Yelp audit schema must not persist raw bodies, signatures, or secrets.");
}

for (const requiredAuditLockPrivilegeContract of [
  "begin;",
  "grant update (id)",
  "on table public.mighty_apes_yelp_webhook_events",
  "to service_role",
  "commit;",
]) {
  if (!mightyApesYelpAuditLockPrivilegeMigration.includes(
    requiredAuditLockPrivilegeContract,
  )) {
    failures.push(
      `Mighty Apes Yelp audit-lock privilege hardening is missing required contract: ${requiredAuditLockPrivilegeContract}.`,
    );
  }
}

if (!mightyApesYelpAuditLockPrivilegeMigration.trimStart().startsWith("begin;") ||
    !mightyApesYelpAuditLockPrivilegeMigration.trimEnd().endsWith("commit;")) {
  failures.push("Mighty Apes Yelp audit-lock privilege hardening must use one explicit transaction wrapper.");
}

if (/grant\s+update\s+on\s+table/i.test(mightyApesYelpAuditLockPrivilegeMigration) ||
    /grant\s+(?:all|insert|delete|truncate|references|trigger)/i.test(
      mightyApesYelpAuditLockPrivilegeMigration,
    )) {
  failures.push("Mighty Apes Yelp audit-lock hardening must grant only column-level UPDATE(id).");
}

for (const requiredLeadAttributionContract of [
  "begin;",
  "commit;",
  "create table public.marketing_campaigns",
  "create table public.lead_accountability",
  "create table public.lead_accountability_events",
  "create table public.marketing_spend_months",
  "attribution_model text not null default 'first_touch'",
  "unique (lead_id)",
  "lead_accountability_events_workflow_evidence_uidx",
  "on delete restrict",
  "lead_accountability_owner_user_id_idx",
  "source_key <> 'other' or source_detail is not null",
  "source_key = 'unknown'",
  "review_status in ('needs_review', 'unattributed')",
  "review_status = 'verified'",
  "attribution_locked_at is not null",
  "and won_contract_value is not null",
  "lead_accountability_events_outcome_consistency_check",
  "outcome is not distinct from 'won'",
  "outcome is not distinct from 'lost'",
  "current_accountability.reviewed_at is not null",
  "current_accountability.intake_record_id is not null",
  "current_accountability.record_version <> 1",
  "public.wtos_is_service_role_request()",
  "Provider attribution evidence may only be recorded by a trusted provider pathway.",
  "Provider evidence may only be asserted by a trusted provider pathway.",
  "public.wtos_is_deterministic_attribution_evidence",
  "create or replace function public.wtos_create_accountable_lead_core",
  "create or replace function public.wtos_create_accountable_lead",
  "create or replace function public.wtos_apply_lead_accountability_action",
  "create or replace function public.wtos_upsert_marketing_campaign",
  "create or replace function public.wtos_upsert_marketing_spend",
  "create or replace function public.wtos_create_repeat_opportunity",
  "create or replace function public.wtos_get_marketing_accountability_dashboard",
  "customer_expected_updated_at",
  "property_expected_updated_at",
  "'contract', 'repeat_opportunity_v1'",
  "'customer_id', request_customer_id",
  "'customer_expected_updated_at', request_customer_expected_updated_at",
  "'property_id', request_property_id",
  "'property_expected_updated_at', request_property_expected_updated_at",
  "'repeat_request_fingerprint', request_fingerprint",
  "Operation key was already used with different repeat-opportunity review input.",
  "'source_key', 'repeat_customer'",
  "'source_detail', null",
  "'intake_provider', 'manual'",
  "perform public.wtos_acquire_crm_identity_invariant_lock()",
  "schedule_events_serialize_accountability_milestone_update",
  "inspections_serialize_accountability_milestone_update",
  "estimates_serialize_accountability_milestone_update",
  "proposal_acceptances_serialize_accountability_milestone_insert",
  "proposal_acceptances_serialize_accountability_scope_update",
  "create or replace function public.wtos_validate_proposal_acceptance_scope",
  "estimate_proposal_acceptances_validate_scope_insert",
  "estimate_proposal_acceptances_validate_scope_update",
  "Proposal acceptance revision, estimate, customer, and company scope must match exactly.",
  "revoke all on function public.wtos_validate_proposal_acceptance_scope()",
  "revision.customer_id is not distinct from acceptance.customer_id",
  "estimate.customer_id is not distinct from acceptance.customer_id",
  "perform public.wtos_lock_accountability_operation",
  "perform public.wtos_lock_marketing_identity",
  "current_campaign.record_version <> request_expected_version",
  "current_spend.record_version <> request_expected_version",
  "Referenced campaign attribution identity is immutable",
  "Marketing campaign semantics do not exactly match lead attribution.",
  "Marketing campaign semantics do not exactly match marketing spend.",
  "for share;",
  "request_owner_key_present := action_request ? 'owner_user_id'",
  "Accountability event time must be between lead receipt and the current time.",
  "pg_catalog.max(event.occurred_at)",
  "inspection.status in ('completed', 'passed', 'failed', 'no_work_needed')",
  "new.acceptance_method = 'signature_provider'",
  "new.signature_status <> 'signed'",
  "pipeline_stage not in ('approved', 'job_scheduled', 'completed', 'paid')",
  "create constraint trigger leads_enforce_accountable_funnel_linkage",
  "workflow_linkage_gap_count",
  "'untracked_legacy_lead_scope', 'company_month_unallocatable'",
  "'untracked_legacy_lead_source_allocatable', false",
  "America/Phoenix",
  "when lead_count_value = 0 then null",
  "when booked_count = 0 then null",
  "when inspection_count = 0 then null",
  "when won_count = 0 then null",
  "when spend_value = 0 then null",
  "alter table public.marketing_campaigns enable row level security",
  "alter table public.lead_accountability enable row level security",
  "alter table public.lead_accountability_events enable row level security",
  "alter table public.marketing_spend_months enable row level security",
  "using (public.wtos_can_read_company(company_id))",
  "revoke all on table public.marketing_campaigns from public, anon, authenticated, service_role",
  "revoke all on table public.lead_accountability from public, anon, authenticated, service_role",
  "revoke all on table public.lead_accountability_events from public, anon, authenticated, service_role",
  "revoke all on table public.marketing_spend_months from public, anon, authenticated, service_role",
  "grant delete on table public.lead_accountability_events to service_role",
  "Only exact isolated-test accountability records may be removed.",
  "TEST WTOS REGRESSION %",
  "TEST WTOS LEAD ACCOUNTABILITY REGRESSION:%",
  "event_operation_key := requested_operation_key || ':lead_created'",
  "Repeat-customer attribution requires the reviewed Customer 360 workflow.",
  "revoke all on function public.wtos_create_accountable_lead_core(jsonb, boolean)",
  "leads_estimated_value_not_nan_check",
  "estimate_proposal_acceptances_accepted_total_not_nan_check",
  "spend_amount <> 'NaN'::numeric",
  "request_spend_amount = 'NaN'::numeric",
  "request_estimated_value = 'NaN'::numeric",
  "acceptance_value = 'NaN'::numeric",
  "request_won_value = 'NaN'::numeric",
]) {
  if (!leadAttributionAccountabilityMigration.includes(requiredLeadAttributionContract)) {
    failures.push(
      `Lead attribution and marketing accountability migration is missing required contract: ${requiredLeadAttributionContract}.`,
    );
  }
}

const leadAttributionFunctionSource = (functionName) => {
  const start = leadAttributionAccountabilityMigration.indexOf(
    `create or replace function public.${functionName}`,
  );
  if (start === -1) return "";
  const next = leadAttributionAccountabilityMigration.indexOf(
    "\ncreate or replace function public.",
    start + 1,
  );
  return leadAttributionAccountabilityMigration.slice(
    start,
    next === -1 ? undefined : next,
  );
};

for (const campaignReferenceFunction of [
  "wtos_upsert_marketing_spend",
  "wtos_validate_lead_accountability_scope",
  "wtos_validate_marketing_spend_scope",
  "wtos_validate_accountability_event_scope",
  "wtos_apply_verified_intake_attribution",
  "wtos_create_accountable_lead_core",
  "wtos_apply_lead_accountability_action",
]) {
  const functionSource = leadAttributionFunctionSource(campaignReferenceFunction);
  if (!/from public\.marketing_campaigns as campaign[\s\S]*?for share;/i.test(
    functionSource,
  )) {
    failures.push(
      `Lead attribution campaign reference path ${campaignReferenceFunction} must lock the exact campaign row FOR SHARE.`,
    );
  }
}

const campaignMutationSource = leadAttributionFunctionSource(
  "wtos_upsert_marketing_campaign",
);
if (!/where campaign\.id = request_campaign_id[\s\S]*?for update;/i.test(
  campaignMutationSource,
)) {
  failures.push(
    "Marketing campaign updates must retain an exact campaign-row FOR UPDATE lock.",
  );
}

for (const exactCampaignSemanticContract of [
  "campaign_detail is distinct from new.source_detail",
  "campaign_provider is distinct from new.intake_provider",
  "campaign_vendor_key is distinct from new.vendor_key",
  "campaign_vendor_name is distinct from new.vendor_name",
  "selected_campaign.source_detail is distinct from request_source_detail",
  "selected_campaign.intake_provider is distinct from request_intake_provider",
  "selected_campaign.vendor_key is distinct from request_vendor_key",
  "selected_campaign.vendor_name is distinct from request_vendor_name",
]) {
  if (!leadAttributionAccountabilityMigration.includes(
    exactCampaignSemanticContract,
  )) {
    failures.push(
      `Campaign references must preserve exact null-safe semantic equality: ${exactCampaignSemanticContract}.`,
    );
  }
}

const publicOperationKeyValidator =
  "request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";
for (const publicMutationFunction of [
  "wtos_upsert_marketing_campaign",
  "wtos_upsert_marketing_spend",
  "wtos_create_accountable_lead_core",
  "wtos_apply_lead_accountability_action",
  "wtos_create_repeat_opportunity",
]) {
  if (!leadAttributionFunctionSource(publicMutationFunction).includes(
    publicOperationKeyValidator,
  )) {
    failures.push(
      `Public mutation boundary ${publicMutationFunction} must require an opaque UUID operation key.`,
    );
  }

  const functionSource = leadAttributionFunctionSource(publicMutationFunction);
  const canonicalizationContract =
    "request_operation_key := request_operation_key::uuid::text;";
  const canonicalizationMatches = functionSource.match(
    /request_operation_key := request_operation_key::uuid::text;/g,
  ) ?? [];
  const canonicalizationIndex = functionSource.indexOf(canonicalizationContract);
  const fingerprintIndex = functionSource.indexOf("request_fingerprint :=");
  const operationLockIndex = functionSource.indexOf(
    "perform public.wtos_lock_accountability_operation(",
  );
  if (canonicalizationMatches.length !== 1 || fingerprintIndex === -1 ||
      operationLockIndex === -1 || canonicalizationIndex > fingerprintIndex ||
      canonicalizationIndex > operationLockIndex) {
    failures.push(
      `Public mutation boundary ${publicMutationFunction} must canonicalize its UUID operation key exactly once before fingerprinting, locking, lookup, and persistence.`,
    );
  }
}

const proposalAcceptanceScopeSource = leadAttributionFunctionSource(
  "wtos_validate_proposal_acceptance_scope",
);
for (const proposalAcceptanceScopeContract of [
  "from public.estimate_proposal_revisions as revision",
  "where revision.id = new.proposal_revision_id",
  "from public.estimates as estimate",
  "where estimate.id = new.estimate_id",
  "selected_revision.company_id is distinct from new.company_id",
  "selected_revision.estimate_id is distinct from new.estimate_id",
  "selected_estimate.company_id is distinct from new.company_id",
  "selected_revision.customer_id is distinct from new.customer_id",
  "selected_estimate.customer_id is distinct from new.customer_id",
  "selected_customer.company_id is distinct from new.company_id",
  "for share;",
]) {
  if (!proposalAcceptanceScopeSource.includes(proposalAcceptanceScopeContract)) {
    failures.push(
      `Proposal acceptance scope validation must fail closed on its linked company graph: ${proposalAcceptanceScopeContract}.`,
    );
  }
}

for (const proposalEvidenceReader of [
  "wtos_apply_lead_accountability_action",
  "wtos_marketing_metrics_for_scope",
]) {
  const functionSource = leadAttributionFunctionSource(proposalEvidenceReader);
  for (const proposalEvidenceContract of [
    "join public.estimate_proposal_revisions as revision",
    "revision.estimate_id = acceptance.estimate_id",
    "revision.customer_id is not distinct from acceptance.customer_id",
    "estimate.customer_id is not distinct from acceptance.customer_id",
    "customer.company_id = acceptance.company_id",
  ]) {
    if (!functionSource.includes(proposalEvidenceContract)) {
      failures.push(
        `Proposal acceptance evidence reader ${proposalEvidenceReader} must reject legacy cross-scope proposal graphs: ${proposalEvidenceContract}.`,
      );
    }
  }
}

if (/\^\[A-Za-z0-9\]\[A-Za-z0-9:_-\]/.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push(
    "Lead accountability operation keys must not accept arbitrary alphanumeric PII-like tokens.",
  );
}

if (/operation_key[^\n]*TEST|TEST[^\n]*operation_key/i.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push(
    "Lead accountability operation keys must not embed synthetic lead labels or other display text.",
  );
}

if (/grant\s+execute\s+on\s+function\s+public\.wtos_create_accountable_lead_core/i.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push(
    "The repeat-capable accountable-lead core must remain private and non-executable by API roles.",
  );
}

if ((leadAttributionAccountabilityMigration.match(/\bnot valid;/gi) ?? []).length < 2) {
  failures.push(
    "NaN hardening on existing lead and proposal tables must remain additive and unvalidated at migration time.",
  );
}

for (const [leadMutator, laterLockContract] of [
  ["wtos_create_accountable_lead_core", "perform public.wtos_lock_accountability_operation("],
  ["wtos_apply_lead_accountability_action", "perform public.wtos_lock_accountability_operation("],
  ["wtos_create_repeat_opportunity", "perform public.wtos_lock_accountability_operation("],
  ["wtos_record_automatic_lead_milestone", "select accountability.*"],
]) {
  const functionSource = leadAttributionFunctionSource(leadMutator);
  const coordinatorIndex = functionSource.indexOf(
    "perform public.wtos_acquire_crm_identity_invariant_lock();",
  );
  const laterLockIndex = functionSource.indexOf(laterLockContract);
  if (coordinatorIndex === -1 || laterLockIndex === -1 || coordinatorIndex > laterLockIndex) {
    failures.push(
      `Lead-mutating boundary ${leadMutator} must acquire the CRM identity coordinator before operation or tuple locks.`,
    );
  }
}

for (const workflowCoordinatorContract of [
  "before update of status, start_at on public.schedule_events\nfor each statement execute function public.wtos_serialize_crm_identity_link_statement();",
  "before update of status, completed_at on public.inspections\nfor each statement execute function public.wtos_serialize_crm_identity_link_statement();",
  "before update of status on public.estimates\nfor each statement execute function public.wtos_serialize_crm_identity_link_statement();",
  "before insert on public.estimate_proposal_acceptances\nfor each statement execute function public.wtos_serialize_crm_identity_link_statement();",
  "before update of company_id, proposal_revision_id, estimate_id, customer_id\non public.estimate_proposal_acceptances\nfor each statement execute function public.wtos_serialize_crm_identity_link_statement();",
]) {
  if (!leadAttributionAccountabilityMigration.includes(workflowCoordinatorContract)) {
    failures.push(
      `Milestone-driving workflow statements must acquire the CRM identity coordinator before tuple locks: ${workflowCoordinatorContract}.`,
    );
  }
}

for (const existingInsertCoordinator of [
  "before insert on public.schedule_events",
  "before insert on public.inspections",
  "before insert on public.estimates",
]) {
  if (!crmIdentityReconciliationInvariantHardeningMigration.includes(
    existingInsertCoordinator,
  )) {
    failures.push(
      `CRM identity hardening must retain its existing workflow INSERT serializer: ${existingInsertCoordinator}.`,
    );
  }
}

const repeatOpportunitySource = leadAttributionFunctionSource(
  "wtos_create_repeat_opportunity",
);
const repeatIdempotencyLookupIndex = repeatOpportunitySource.indexOf(
  "select event.*",
);
const repeatCustomerLockIndex = repeatOpportunitySource.indexOf(
  "select customer.*",
);
if (repeatIdempotencyLookupIndex === -1 || repeatCustomerLockIndex === -1 ||
    repeatIdempotencyLookupIndex > repeatCustomerLockIndex) {
  failures.push(
    "Repeat-opportunity exact idempotency must resolve or conflict before customer/property row locks and any lead update.",
  );
}

for (const repeatGraphFingerprintField of [
  "'customer_id', request_customer_id",
  "'customer_expected_updated_at', request_customer_expected_updated_at",
  "'property_id', request_property_id",
  "'property_expected_updated_at', request_property_expected_updated_at",
]) {
  if (!repeatOpportunitySource.includes(repeatGraphFingerprintField)) {
    failures.push(
      `Repeat-opportunity idempotency fingerprint must bind reviewed graph input: ${repeatGraphFingerprintField}.`,
    );
  }
}

const repeatCoreSource = leadAttributionFunctionSource(
  "wtos_create_accountable_lead_core",
);
if (!repeatCoreSource.includes("or request_source_detail is not null") ||
    !repeatCoreSource.includes("or request_intake_provider is distinct from 'manual'")) {
  failures.push(
    "The private repeat core must require canonical repeat_customer/null/manual attribution.",
  );
}

const metricsScopeSource = leadAttributionFunctionSource(
  "wtos_marketing_metrics_for_scope",
);
const untrackedLegacyBlockStart = metricsScopeSource.indexOf(
  "-- Legacy rows have no defensible source allocation.",
);
const untrackedLegacyBlockEnd = metricsScopeSource.indexOf(
  "select pg_catalog.count(*)\n  into workflow_linkage_gap_count",
  untrackedLegacyBlockStart,
);
const untrackedLegacyBlock = metricsScopeSource.slice(
  untrackedLegacyBlockStart,
  untrackedLegacyBlockEnd,
);
if (untrackedLegacyBlockStart === -1 || untrackedLegacyBlockEnd === -1 ||
    untrackedLegacyBlock.includes("target_source_key") ||
    metricsScopeSource.includes("untracked_legacy_count := 0")) {
  failures.push(
    "Untracked legacy leads must remain the company/month total and explicitly non-source-allocatable under source filters.",
  );
}

if (!leadAttributionAccountabilityMigration.trimStart().startsWith("begin;") ||
    !leadAttributionAccountabilityMigration.trimEnd().endsWith("commit;")) {
  failures.push(
    "Lead attribution and marketing accountability migration must use one explicit transaction wrapper.",
  );
}

if (/\b[a-z_][a-z0-9_$]*\.(?:coalesce|nullif|greatest|least)\s*\(/i.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push(
    "Lead attribution migration must not schema-qualify SQL conditional expressions such as COALESCE, NULLIF, GREATEST, or LEAST.",
  );
}

if ((leadAttributionAccountabilityMigration.match(
  /errcode\s*=\s*'40001'/gi,
) ?? []).length !== 8) {
  failures.push(
    "The applied lead-attribution base migration must retain its eight original semantic SQLSTATE 40001 sites byte-for-byte.",
  );
}

if (!leadAccountabilityStaleErrorHardeningMigration.trimStart().startsWith("begin;") ||
    !leadAccountabilityStaleErrorHardeningMigration.trimEnd().endsWith("commit;")) {
  failures.push(
    "Lead-accountability stale-error hardening must use one explicit transaction wrapper.",
  );
}

if (/errcode\s*=\s*'40001'/i.test(
  leadAccountabilityStaleErrorHardeningMigration,
)) {
  failures.push(
    "Lead-accountability stale-error hardening must not explicitly raise retryable SQLSTATE 40001.",
  );
}

if (/\bwhen\s+others\b/i.test(leadAccountabilityStaleErrorHardeningMigration)) {
  failures.push(
    "Lead-accountability stale-error hardening must not catch unrelated errors.",
  );
}

if (/\b(?:insert\s+into|update|delete\s+from)\s+public\./i.test(
  leadAccountabilityStaleErrorHardeningMigration,
)) {
  failures.push(
    "Lead-accountability stale-error hardening must not mutate or backfill business data.",
  );
}

if (/\b[a-z_][a-z0-9_$]*\.(?:coalesce|nullif|greatest|least)\s*\(/i.test(
  leadAccountabilityStaleErrorHardeningMigration,
)) {
  failures.push(
    "Lead-accountability stale-error hardening must not schema-qualify SQL conditional expressions.",
  );
}

const staleErrorWrapperSource = (functionName) => {
  const start = leadAccountabilityStaleErrorHardeningMigration.indexOf(
    `create function public.${functionName}`,
  );
  if (start === -1) return "";
  const next = leadAccountabilityStaleErrorHardeningMigration.indexOf(
    "\ncreate function public.",
    start + 1,
  );
  return leadAccountabilityStaleErrorHardeningMigration.slice(
    start,
    next === -1 ? undefined : next,
  );
};

for (const [wrapperName, baseName, semanticMessages] of [
  [
    "wtos_upsert_marketing_campaign",
    "wtos_upsert_marketing_campaign_phase1_base",
    [
      "New marketing campaign requires expected_version 0.",
      "Marketing campaign changed after review.",
    ],
  ],
  [
    "wtos_upsert_marketing_spend",
    "wtos_upsert_marketing_spend_phase1_base",
    [
      "New marketing spend requires expected_version 0.",
      "Marketing spend changed after review.",
    ],
  ],
  [
    "wtos_apply_lead_accountability_action",
    "wtos_apply_lead_accountability_action_phase1_base",
    [
      "Lead accountability record changed during the action.",
      "Lead accountability record changed after review.",
    ],
  ],
  [
    "wtos_create_repeat_opportunity",
    "wtos_create_repeat_opportunity_phase1_base",
    [
      "Repeat-opportunity customer changed after review.",
      "Repeat-opportunity property changed after review.",
    ],
  ],
]) {
  const wrapperSource = staleErrorWrapperSource(wrapperName);
  for (const wrapperContract of [
    `return public.${baseName}`,
    "when serialization_failure then",
    "errcode = 'P0001'",
    "message = sqlerrm",
    "raise;",
    ...semanticMessages,
  ]) {
    if (!wrapperSource.includes(wrapperContract)) {
      failures.push(
        `Non-retryable stale-error wrapper ${wrapperName} is missing contract: ${wrapperContract}.`,
      );
    }
  }

  for (const basePrivilegeContract of [
    `alter function public.${wrapperName}(jsonb)\nrename to ${baseName};`,
    `revoke all on function public.${baseName}(jsonb)\nfrom public, anon, authenticated, service_role;`,
    `revoke all on function public.${wrapperName}(jsonb)\nfrom public, anon, authenticated, service_role;`,
    `grant execute on function public.${wrapperName}(jsonb)\nto authenticated, service_role;`,
  ]) {
    if (!leadAccountabilityStaleErrorHardeningMigration.includes(
      basePrivilegeContract,
    )) {
      failures.push(
        `Applied Phase 1 RPC base must remain private behind its stale-error wrapper: ${basePrivilegeContract}.`,
      );
    }
  }
}

const staleErrorWrapperCount = (
  leadAccountabilityStaleErrorHardeningMigration.match(
    /create function public\./gi,
  ) ?? []
).length;
const staleErrorFixedSearchPathCount = (
  leadAccountabilityStaleErrorHardeningMigration.match(
    /set search_path = ''/gi,
  ) ?? []
).length;
if (staleErrorWrapperCount !== 4 ||
    staleErrorFixedSearchPathCount !== staleErrorWrapperCount) {
  failures.push(
    "Every stale-error compatibility wrapper must use a fixed empty search_path.",
  );
}

if ((leadAccountabilityStaleErrorHardeningMigration.match(
  /\bwhen\s+serialization_failure\b/gi,
) ?? []).length !== 4 ||
    (leadAccountabilityStaleErrorHardeningMigration.match(
      /errcode\s*=\s*'P0001'/gi,
    ) ?? []).length !== 4 ||
    (leadAccountabilityStaleErrorHardeningMigration.match(
      /^\s*raise;\s*$/gim,
    ) ?? []).length !== 4) {
  failures.push(
    "Each stale-error wrapper must translate its exact semantic allowlist once and bare-rethrow every other serialization failure.",
  );
}

if (!leadAccountabilityIdempotencyIntegrityHardeningMigration.trimStart().startsWith("begin;") ||
    !leadAccountabilityIdempotencyIntegrityHardeningMigration.trimEnd().endsWith("commit;")) {
  failures.push(
    "Lead-accountability idempotency/integrity hardening must use one explicit transaction wrapper.",
  );
}

for (const hardeningContract of [
  "create table public.marketing_accountability_operation_receipts",
  "operation_kind in ('campaign_upsert', 'spend_upsert')",
  "unique (company_id, operation_key)",
  "foreign key (campaign_id, company_id)",
  "references public.marketing_campaigns(id, company_id)",
  "foreign key (spend_id, company_id)",
  "references public.marketing_spend_months(id, company_id)",
  "marketing_operation_receipts_target_check",
  "marketing_operation_receipts_immutable",
  "Marketing operation receipts are immutable.",
  "alter table public.marketing_accountability_operation_receipts\nenable row level security;",
  "revoke all on table public.marketing_accountability_operation_receipts\nfrom public, anon, authenticated, service_role;",
  "grant select on table public.marketing_accountability_operation_receipts\nto authenticated, service_role;",
  "grant delete on table public.marketing_accountability_operation_receipts\nto service_role;",
  "using (public.wtos_can_read_company(company_id))",
  "alter function public.wtos_upsert_marketing_campaign(jsonb)\nrename to wtos_upsert_marketing_campaign_phase1_nonretryable;",
  "alter function public.wtos_upsert_marketing_spend(jsonb)\nrename to wtos_upsert_marketing_spend_phase1_nonretryable;",
  "existing_receipt.request_fingerprint is distinct from request_fingerprint",
  "insert into public.marketing_accountability_operation_receipts",
  "when tg_op = 'UPDATE' then coalesce(new.updated_at, pg_catalog.now())",
  "else coalesce(new.created_at, pg_catalog.now())",
  "create constraint trigger leads_enforce_accountable_outcome_insert\nafter insert on public.leads\ndeferrable initially deferred",
  "alter function public.wtos_enforce_accountable_lead_outcome()\nsecurity definer;",
]) {
  if (!leadAccountabilityIdempotencyIntegrityHardeningMigration.includes(
    hardeningContract,
  )) {
    failures.push(
      `Lead-accountability idempotency/integrity hardening is missing required contract: ${hardeningContract}.`,
    );
  }
}

if (/\b(?:drop\s+table|drop\s+column|truncate)\b/i.test(
  leadAccountabilityIdempotencyIntegrityHardeningMigration,
)) {
  failures.push(
    "Lead-accountability idempotency/integrity hardening must remain additive and non-destructive.",
  );
}

const idempotencyHardeningOutsideFunctionBodies = [];
let insideIdempotencyHardeningFunction = false;
for (const line of leadAccountabilityIdempotencyIntegrityHardeningMigration.split("\n")) {
  if (!insideIdempotencyHardeningFunction && /\bas \$\$\s*$/i.test(line)) {
    insideIdempotencyHardeningFunction = true;
    continue;
  }
  if (insideIdempotencyHardeningFunction && line.trim() === "$$;") {
    insideIdempotencyHardeningFunction = false;
    continue;
  }
  if (!insideIdempotencyHardeningFunction) {
    idempotencyHardeningOutsideFunctionBodies.push(line);
  }
}

if (/\b(?:insert\s+into|update\s+public\.|delete\s+from)\b/i.test(
  idempotencyHardeningOutsideFunctionBodies.join("\n"),
)) {
  failures.push(
    "Lead-accountability idempotency/integrity hardening must not mutate or backfill business data at migration time.",
  );
}

if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(
  leadAccountabilityIdempotencyIntegrityHardeningMigration,
)) {
  failures.push(
    "Marketing operation receipts must not use broad true RLS policies.",
  );
}

if (/grant\s+(?:all|insert|update|truncate)[^;]*on\s+table\s+public\.marketing_accountability_operation_receipts\s+to\s+(?:anon|authenticated|service_role)/i.test(
  leadAccountabilityIdempotencyIntegrityHardeningMigration,
)) {
  failures.push(
    "Marketing operation receipts must remain RPC-only for writes with narrow service-role test deletion.",
  );
}

const marketingOperationReceiptSchema =
  leadAccountabilityIdempotencyIntegrityHardeningMigration.slice(
    leadAccountabilityIdempotencyIntegrityHardeningMigration.indexOf(
      "create table public.marketing_accountability_operation_receipts",
    ),
    leadAccountabilityIdempotencyIntegrityHardeningMigration.indexOf(
      "create index marketing_operation_receipts_company_created_idx",
    ),
  );
if (/\b(?:phone|email|property_address|message_body|raw_payload|provider_payload|notes)\s+(?:text|jsonb)/i.test(
  marketingOperationReceiptSchema,
)) {
  failures.push(
    "Marketing operation receipt history must not persist PII, notes, or raw provider payloads.",
  );
}

const idempotencyHardeningFunctionSource = (functionName) => {
  const createMarkers = [
    `create function public.${functionName}`,
    `create or replace function public.${functionName}`,
  ];
  const start = createMarkers
    .map((marker) => leadAccountabilityIdempotencyIntegrityHardeningMigration.indexOf(marker))
    .filter((index) => index !== -1)
    .sort((left, right) => left - right)[0] ?? -1;
  if (start === -1) return "";
  const remainder = leadAccountabilityIdempotencyIntegrityHardeningMigration.slice(start + 1);
  const nextMatch = remainder.match(/\ncreate (?:or replace )?function public\./i);
  const end = nextMatch
    ? start + 1 + nextMatch.index
    : leadAccountabilityIdempotencyIntegrityHardeningMigration.length;
  return leadAccountabilityIdempotencyIntegrityHardeningMigration.slice(start, end);
};

for (const [wrapperName, privateName, operationKind, targetField] of [
  [
    "wtos_upsert_marketing_campaign",
    "wtos_upsert_marketing_campaign_phase1_nonretryable",
    "campaign_upsert",
    "campaign_id",
  ],
  [
    "wtos_upsert_marketing_spend",
    "wtos_upsert_marketing_spend_phase1_nonretryable",
    "spend_upsert",
    "spend_id",
  ],
]) {
  const wrapperSource = idempotencyHardeningFunctionSource(wrapperName);
  const operationLockIndex = wrapperSource.indexOf(
    "perform public.wtos_lock_accountability_operation(",
  );
  const receiptLookupIndex = wrapperSource.indexOf(
    "from public.marketing_accountability_operation_receipts as receipt",
  );
  const privateMutationIndex = wrapperSource.indexOf(
    `mutation_result := public.${privateName}`,
  );
  const receiptInsertIndex = wrapperSource.indexOf(
    "insert into public.marketing_accountability_operation_receipts",
  );
  if (operationLockIndex === -1 || receiptLookupIndex === -1 ||
      privateMutationIndex === -1 || receiptInsertIndex === -1 ||
      !(operationLockIndex < receiptLookupIndex &&
        receiptLookupIndex < privateMutationIndex &&
        privateMutationIndex < receiptInsertIndex)) {
    failures.push(
      `${wrapperName} must lock, resolve immutable receipt, mutate privately, then atomically persist the receipt in that order.`,
    );
  }
  for (const wrapperContract of [
    `existing_receipt.operation_kind is distinct from '${operationKind}'`,
    `existing_receipt.${targetField} is distinct from request_${targetField}`,
    `existing_receipt.${targetField}`,
    "existing_receipt.resulting_record_version",
    `revoke all on function public.${privateName}(jsonb)`,
    `revoke all on function public.${wrapperName}(jsonb)`,
    `grant execute on function public.${wrapperName}(jsonb)`,
  ]) {
    if (!leadAccountabilityIdempotencyIntegrityHardeningMigration.includes(
      wrapperContract,
    )) {
      failures.push(
        `Durable operation wrapper ${wrapperName} is missing contract: ${wrapperContract}.`,
      );
    }
  }
}

const idempotencyHardeningFunctionCount = (
  leadAccountabilityIdempotencyIntegrityHardeningMigration.match(
    /create (?:or replace )?function/gi,
  ) ?? []
).length;
const idempotencyHardeningFixedSearchPathCount = (
  leadAccountabilityIdempotencyIntegrityHardeningMigration.match(
    /set search_path = ''/gi,
  ) ?? []
).length;
if (idempotencyHardeningFunctionCount === 0 ||
    idempotencyHardeningFixedSearchPathCount !== idempotencyHardeningFunctionCount) {
  failures.push(
    "Every idempotency/integrity hardening function must use a fixed empty search_path.",
  );
}

const leadAttributionFunctionCount = (
  leadAttributionAccountabilityMigration.match(/create or replace function/gi) ?? []
).length;
const leadAttributionFixedSearchPathCount = (
  leadAttributionAccountabilityMigration.match(/set search_path = ''/gi) ?? []
).length;

if (leadAttributionFunctionCount === 0 ||
    leadAttributionFixedSearchPathCount !== leadAttributionFunctionCount) {
  failures.push(
    "Every lead attribution and marketing accountability function must use a fixed empty search_path.",
  );
}

const leadAttributionOutsideFunctionBodies = [];
let insideLeadAttributionFunction = false;
for (const line of leadAttributionAccountabilityMigration.split("\n")) {
  if (!insideLeadAttributionFunction && /\bas \$\$\s*$/i.test(line)) {
    insideLeadAttributionFunction = true;
    continue;
  }
  if (insideLeadAttributionFunction && line.trim() === "$$;") {
    insideLeadAttributionFunction = false;
    continue;
  }
  if (!insideLeadAttributionFunction) {
    leadAttributionOutsideFunctionBodies.push(line);
  }
}

const leadAttributionMigrationTimeSql = leadAttributionOutsideFunctionBodies.join("\n");
if (/\b(?:insert\s+into|update|delete\s+from)\s+public\./i.test(
  leadAttributionMigrationTimeSql,
)) {
  failures.push(
    "Lead attribution migration must not insert, update, backfill, or delete business data at migration time.",
  );
}

if (/\b(?:drop\s+table|drop\s+column|truncate)\b/i.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push("Lead attribution migration must remain additive and non-destructive.");
}

if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push("Lead attribution migration must not add broad true RLS policies.");
}

if (/grant\s+(?:all|insert|update|truncate)\s+on\s+table\s+public\.(?:marketing_campaigns|lead_accountability|lead_accountability_events|marketing_spend_months)\s+to\s+(?:anon|authenticated|service_role)/i.test(
  leadAttributionAccountabilityMigration,
)) {
  failures.push(
    "Lead attribution tables must remain RPC-only for writes with narrow service-role test deletion.",
  );
}

const leadAccountabilityEventSchema = leadAttributionAccountabilityMigration.slice(
  leadAttributionAccountabilityMigration.indexOf(
    "create table public.lead_accountability_events",
  ),
  leadAttributionAccountabilityMigration.indexOf(
    "create table public.marketing_spend_months",
  ),
);
if (/\b(?:phone|email|property_address|message_body|raw_payload|provider_payload|notes)\s+(?:text|jsonb)/i.test(
  leadAccountabilityEventSchema,
)) {
  failures.push("Lead accountability event ledger must not persist PII or raw provider payloads.");
}

for (const automationContract of [
  "begin;",
  "set local lock_timeout = '5s'",
  "create table public.automation_rules",
  "create table public.automation_events",
  "create table public.automation_executions",
  "create table public.automation_attempts",
  "create table public.automation_audit_events",
  "alter table public.automation_rules enable row level security",
  "constraint automation_events_company_idempotency_key unique (company_id, idempotency_key)",
  "constraint automation_executions_event_rule_version_key unique (event_id, rule_id, rule_version)",
  "Rule disabled or version changed before execution.",
  "revoke execute on function public.wtos_run_automation_worker_v1(timestamptz, integer)",
  "grant execute on function public.wtos_run_automation_worker_v1(timestamptz, integer)",
  "revoke execute on function public.wtos_reserve_ai_request_v1(uuid, uuid, uuid, jsonb)",
  "grant execute on function public.wtos_reserve_ai_request_v1(uuid, uuid, uuid, jsonb)",
  "create table public.mighty_apes_campaign_routes",
  "Mighty Apes campaign is not authorized for ingestion.",
  "commit;",
]) {
  if (!automationEngineFoundationMigration.includes(automationContract)) {
    failures.push(`Automation engine migration is missing ${automationContract}.`);
  }
}
if (/errcode\s*=\s*'40001'/i.test(automationEngineFoundationMigration)) {
  failures.push(
    "Automation expected-version and replay refusals must not use PostgREST-retried SQLSTATE 40001.",
  );
}
if (/action_type\s+in\s*\([^)]*(?:send_email|send_sms|place_call|provider_write)/i.test(
  automationEngineFoundationMigration,
)) {
  failures.push("Automation action allowlists must remain internal-task-only.");
}

if (
  !normalizedAiQuotaStatusReadModelMigration.startsWith("begin;") ||
  !normalizedAiQuotaStatusReadModelMigration.endsWith("commit;")
) {
  failures.push("AI quota status read model must execute as one transaction.");
}

for (const quotaStatusContract of [
  "create or replace function public.wtos_get_ai_quota_status_v1( p_company_id uuid, p_actor_user_id uuid, p_request jsonb )",
  "returns jsonb language plpgsql stable security invoker set search_path = ''",
  "if (select auth.role()) is distinct from 'service_role'",
  "from public.company_memberships as membership where membership.company_id = p_company_id and membership.user_id = p_actor_user_id and membership.role not in ('customer_portal', 'employee_portal')",
  "utc_day_key date := (now() at time zone 'utc')::date",
  "utc_day_start := utc_day_key::timestamp at time zone 'utc'",
  "utc_day_end := utc_day_start + interval '1 day'",
  "utc_month_start := date_trunc('month', utc_day_start)",
  "utc_month_end := utc_month_start + interval '1 month'",
  "from public.ai_audit_events as audit where audit.event_type = 'request_initiated'",
  "reserved_cost_cents_today + estimated_cost_cents > daily_budget_cents",
  "company_reserved_cost_cents_this_month + estimated_cost_cents > company_monthly_budget_cents",
  "'requestcapacityavailable', blocking_reason = 'none'",
  "revoke execute on function public.wtos_get_ai_quota_status_v1(uuid, uuid, jsonb) from public, anon, authenticated",
  "grant execute on function public.wtos_get_ai_quota_status_v1(uuid, uuid, jsonb) to service_role",
]) {
  if (!normalizedAiQuotaStatusReadModelMigration.includes(quotaStatusContract)) {
    failures.push(`AI quota status read model is missing ${quotaStatusContract}.`);
  }
}

for (const requestKey of [
  "contractVersion",
  "estimatedCostCents",
  "globalDailyRequestLimit",
  "companyDailyRequestLimit",
  "userDailyRequestLimit",
  "dailyBudgetCents",
  "companyMonthlyBudgetCents",
]) {
  if (!aiQuotaStatusReadModelMigration.includes(`'${requestKey}'`)) {
    failures.push(`AI quota status request contract is missing ${requestKey}.`);
  }
}

for (const receiptKey of [
  "contractVersion",
  "companyId",
  "actorUserId",
  "requestCapacityAvailable",
  "blockingReason",
  "checkedAt",
  "globalRequestsToday",
  "companyRequestsToday",
  "userRequestsToday",
  "reservedCostCentsToday",
  "companyReservedCostCentsThisMonth",
]) {
  if (!aiQuotaStatusReadModelMigration.includes(`'${receiptKey}'`)) {
    failures.push(`AI quota status receipt contract is missing ${receiptKey}.`);
  }
}

if (
  !normalizedAiQuotaStatusReadModelMigration.includes(
    "not p_request ?& array[ 'contractversion', 'estimatedcostcents', 'globaldailyrequestlimit', 'companydailyrequestlimit', 'userdailyrequestlimit', 'dailybudgetcents', 'companymonthlybudgetcents' ]",
  ) ||
  !normalizedAiQuotaStatusReadModelMigration.includes(
    "from jsonb_object_keys(p_request) as request_key where request_key not in ( 'contractversion', 'estimatedcostcents', 'globaldailyrequestlimit', 'companydailyrequestlimit', 'userdailyrequestlimit', 'dailybudgetcents', 'companymonthlybudgetcents' )",
  )
) {
  failures.push("AI quota status request must require exactly its seven bounded keys.");
}

for (const boundedValueContract of [
  "estimated_cost_cents not between 1 and 100000000",
  "global_daily_request_limit not between 1 and 100000",
  "company_daily_request_limit not between 1 and 100000",
  "user_daily_request_limit not between 1 and 100000",
  "daily_budget_cents not between 1 and 100000000",
  "company_monthly_budget_cents not between 1 and 1000000000",
  "estimated_cost_cents > daily_budget_cents",
  "estimated_cost_cents > company_monthly_budget_cents",
  "100000001::bigint",
  "1000000001::bigint",
]) {
  if (!normalizedAiQuotaStatusReadModelMigration.includes(boundedValueContract)) {
    failures.push(`AI quota status bounds are missing ${boundedValueContract}.`);
  }
}

if (
  (normalizedAiQuotaStatusReadModelMigration.match(/100001::bigint/g) ?? []).length !== 3
) {
  failures.push(
    "AI quota status request counters must each cap at the daily schema maximum plus one.",
  );
}

const quotaBlockingReasonsInOrder = [
  "'global_daily_request_limit'",
  "'company_daily_request_limit'",
  "'user_daily_request_limit'",
  "'global_daily_budget'",
  "'company_monthly_budget'",
];
let previousQuotaBlockingReasonIndex = -1;
for (const quotaBlockingReason of quotaBlockingReasonsInOrder) {
  const quotaBlockingReasonIndex = normalizedAiQuotaStatusReadModelMigration.indexOf(
    quotaBlockingReason,
    previousQuotaBlockingReasonIndex + 1,
  );
  if (quotaBlockingReasonIndex <= previousQuotaBlockingReasonIndex) {
    failures.push(
      "AI quota status blocking reasons must retain atomic reservation precedence.",
    );
    break;
  }
  previousQuotaBlockingReasonIndex = quotaBlockingReasonIndex;
}

if (
  /\bsecurity\s+definer\b/i.test(aiQuotaStatusReadModelMigration) ||
  /\bpg_advisory(?:_xact)?_lock\b/i.test(aiQuotaStatusReadModelMigration) ||
  /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i.test(
    aiQuotaStatusReadModelMigration,
  )
) {
  failures.push(
    "AI quota status read model must remain invoker-rights, lock-free, and read-only.",
  );
}

const crmDatabaseTypes = fs.readFileSync(
  path.join(process.cwd(), "lib", "crm", "types.ts"),
  "utf8",
);
const normalizedCrmDatabaseTypes = crmDatabaseTypes.replace(/\s+/g, " ");
if (
  !normalizedCrmDatabaseTypes.includes(
    "wtos_get_ai_quota_status_v1: { Args: { p_company_id: string; p_actor_user_id: string; p_request: Record<string, unknown>; }; Returns: Record<string, unknown>; };",
  )
) {
  failures.push("CRM database types must expose the exact AI quota status RPC signature.");
}

if (
  !normalizedAiQuotaProbeRefreshCooldownMigration.startsWith("begin;") ||
  !normalizedAiQuotaProbeRefreshCooldownMigration.endsWith("commit;")
) {
  failures.push("AI quota-probe refresh cooldown must execute as one transaction.");
}

for (const quotaProbeRefreshContract of [
  "create table public.ai_quota_probe_refresh_cooldowns",
  "company_id uuid not null references public.companies(id) on delete cascade",
  "actor_user_id uuid not null references auth.users(id) on delete cascade",
  "primary key (company_id, actor_user_id)",
  "alter table public.ai_quota_probe_refresh_cooldowns enable row level security",
  "alter table public.ai_quota_probe_refresh_cooldowns force row level security",
  "revoke all on table public.ai_quota_probe_refresh_cooldowns from public, anon, authenticated, service_role",
  "grant select, insert, update on table public.ai_quota_probe_refresh_cooldowns to service_role",
  "create or replace function public.wtos_claim_ai_quota_probe_refresh_v1( p_company_id uuid, p_actor_user_id uuid )",
  "returns jsonb language plpgsql volatile security invoker set search_path = ''",
  "trusted_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb)",
  "if trusted_claims ->> 'role' is distinct from 'service_role'",
  "from public.company_memberships as membership where membership.company_id = p_company_id and membership.user_id = p_actor_user_id and membership.role not in ('customer_portal', 'employee_portal')",
  "checked_at timestamptz := clock_timestamp()",
  "checked_at + interval '30 seconds'",
  "on conflict (company_id, actor_user_id) do update",
  "where cooldown.next_allowed_at <= checked_at",
  "returning next_allowed_at into claimed_next_allowed_at",
  "retry_after_seconds := greatest( 1, least( 30, ceil(extract(epoch from claimed_next_allowed_at - checked_at))::integer ) )",
  "revoke all on function public.wtos_claim_ai_quota_probe_refresh_v1(uuid, uuid) from public, anon, authenticated, service_role",
  "grant execute on function public.wtos_claim_ai_quota_probe_refresh_v1(uuid, uuid) to service_role",
]) {
  if (!normalizedAiQuotaProbeRefreshCooldownMigration.includes(quotaProbeRefreshContract)) {
    failures.push(
      `AI quota-probe refresh cooldown is missing ${quotaProbeRefreshContract}.`,
    );
  }
}

for (const receiptKey of [
  "contractVersion",
  "companyId",
  "actorUserId",
  "allowed",
  "retryAfterSeconds",
  "checkedAt",
]) {
  if (!aiQuotaProbeRefreshCooldownMigration.includes(`'${receiptKey}'`)) {
    failures.push(`AI quota-probe refresh claim receipt is missing ${receiptKey}.`);
  }
}

if (
  /\bsecurity\s+definer\b/i.test(aiQuotaProbeRefreshCooldownMigration) ||
  /\b(?:delete\s+from|truncate|pg_advisory(?:_xact)?_lock)\b/i.test(
    aiQuotaProbeRefreshCooldownMigration,
  )
) {
  failures.push(
    "AI quota-probe refresh cooldown must remain invoker-rights, bounded-row, and free of destructive or advisory-lock operations.",
  );
}

if (
  !normalizedCrmDatabaseTypes.includes(
    "ai_quota_probe_refresh_cooldowns: { Row: { company_id: string; actor_user_id: string; next_allowed_at: string; updated_at: string; }; Insert: { company_id: string; actor_user_id: string; next_allowed_at: string; updated_at: string; }; Update: Partial< Database[\"public\"][\"Tables\"][\"ai_quota_probe_refresh_cooldowns\"][\"Insert\"] >; Relationships: []; };",
  ) ||
  !normalizedCrmDatabaseTypes.includes(
    "wtos_claim_ai_quota_probe_refresh_v1: { Args: { p_company_id: string; p_actor_user_id: string; }; Returns: Record<string, unknown>; };",
  )
) {
  failures.push(
    "CRM database types must expose the exact AI quota-probe refresh table and RPC signature.",
  );
}

if (
  automationEngineFoundationIndex === -1 ||
  goHighLevelWebhookStateMachineIndex === -1 ||
  automationEngineFoundationIndex >= goHighLevelWebhookStateMachineIndex
) {
  failures.push("GoHighLevel webhook state-machine hardening must follow the automation foundation.");
}

for (const goHighLevelWebhookContract of [
  "add column if not exists payload_sha256 text",
  "add column if not exists claim_token uuid",
  "add column if not exists lease_expires_at timestamptz",
  "provider_max_attempts constant integer := 13",
  "pg_advisory_xact_lock",
  "for update;",
  "existing_event.lease_expires_at > clock_timestamp()",
  "create or replace function public.wtos_claim_gohighlevel_webhook_v1",
  "create or replace function public.wtos_transition_gohighlevel_webhook_v1",
  "create or replace function public.wtos_finalize_gohighlevel_uninstall_v1",
  "create or replace function public.wtos_requeue_gohighlevel_webhook_v1",
  "public.wtos_has_membership_role(existing_event.company_id, array['owner', 'admin'])",
  "grant execute on function public.wtos_claim_gohighlevel_webhook_v1(jsonb)",
  "to service_role;",
  "grant execute on function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)",
  "to authenticated;",
]) {
  if (!goHighLevelWebhookStateMachineMigration.includes(goHighLevelWebhookContract)) {
    failures.push(`GoHighLevel webhook state-machine migration is missing ${goHighLevelWebhookContract}.`);
  }
}
if (/\b(?:raw_payload|payload_body|request_body)\s+(?:text|jsonb|bytea)/i.test(
  goHighLevelWebhookStateMachineMigration,
)) {
  failures.push("GoHighLevel webhook state-machine migration must not persist raw provider payloads.");
}
if (/grant execute on function public\.wtos_(?:claim|transition|finalize)_gohighlevel[^\n]*\nto authenticated/i.test(
  goHighLevelWebhookStateMachineMigration,
)) {
  failures.push("GoHighLevel claim and terminal RPCs must remain service-role-only.");
}

for (const inboundBridgeContract of [
  "create or replace function public.wtos_emit_inbound_communication_event_v1()",
  "create or replace function public.wtos_emit_missed_call_event_v1()",
  "if new.provider = 'gohighlevel' then",
  "connection.id = new.integration_connection_id",
  "connection.company_id = new.company_id",
  "connection.provider = 'gohighlevel'",
  "connection.status = 'connected'",
  "elsif new.provider in ('twilio', 'twilio_sms') then",
  "route.id = new.business_phone_number_id",
  "route.company_id = new.company_id",
  "route.routing_status = 'active'",
  "from public, anon, authenticated, service_role;",
]) {
  if (!goHighLevelInboundAutomationBridgeMigration.includes(inboundBridgeContract)) {
    failures.push(`GoHighLevel inbound automation bridge is missing ${inboundBridgeContract}.`);
  }
}
if (
  (goHighLevelInboundAutomationBridgeMigration.match(
    /create or replace function public\./g,
  ) ?? []).length !== 2 ||
  /^\s*(?:(?:create|alter|drop)\s+(?:table|trigger)|(?:insert into|update|delete from|truncate)\b)/gim.test(
    goHighLevelInboundAutomationBridgeMigration,
  )
) {
  failures.push(
    "GoHighLevel inbound automation bridge must replace only two trigger functions and mutate no schema or data.",
  );
}

for (const goHighLevelGuardrailContract of [
  "lower(existing_event.event_type) not like '%uninstall%'",
  "existing_event.external_location_id not like 'company:%'",
  "credential.external_company_id = substring(",
  "connection.external_account_id = existing_event.external_location_id",
  "Company uninstall scope mismatch.",
  "Location uninstall scope mismatch.",
  "The reason is intentionally not persisted",
  "p_expected_attempt_count,\n    null",
  "revoke all on function public.wtos_finalize_gohighlevel_uninstall_v1_unscoped_20260902",
  "revoke all on function public.wtos_requeue_gohighlevel_webhook_v1_unbounded_reason_20260902",
]) {
  if (!goHighLevelWebhookGuardrailsMigration.includes(goHighLevelGuardrailContract)) {
    failures.push(`GoHighLevel webhook guardrail migration is missing ${goHighLevelGuardrailContract}.`);
  }
}

for (const legacyLeadLintContract of [
  "public.wtos_ingest_mighty_apes_yelp(jsonb)",
  "public.wtos_create_accountable_lead_core(jsonb,boolean)",
  "pg_catalog.pg_get_functiondef(candidate.oid)",
  "execute pg_catalog.format($insert_legacy_lead$",
  "execute pg_catalog.format($create_legacy_lead$",
  "pg_catalog.concat(''customer'', ''_name'')",
  "candidate.proacl is not distinct from original_acl",
  "candidate.proowner = original_owner",
  "candidate.prosecdef = original_security_definer",
  "candidate.proconfig is not distinct from original_config",
]) {
  if (!legacyLeadDynamicInsertLintCorrectionMigration.includes(legacyLeadLintContract)) {
    failures.push(`Legacy lead lint correction is missing ${legacyLeadLintContract}.`);
  }
}

for (const canonicalLeadLintContract of [
  "public.wtos_ingest_mighty_apes_yelp(jsonb)",
  "public.wtos_create_accountable_lead_core(jsonb,boolean)",
  "pg_catalog.pg_get_functiondef(candidate.oid)",
  "execute pg_catalog.format($insert_canonical_lead$",
  "execute pg_catalog.format($create_canonical_lead$",
  "pg_catalog.concat(''contact'', ''_name'')",
  "target_route.company_location_id",
  "target_route.service_type",
  "candidate.proacl is not distinct from original_acl",
  "candidate.proowner = original_owner",
  "candidate.prosecdef = original_security_definer",
  "candidate.proconfig is not distinct from original_config",
]) {
  if (!canonicalLeadDynamicInsertLintCorrectionMigration.includes(canonicalLeadLintContract)) {
    failures.push(`Canonical lead lint correction is missing ${canonicalLeadLintContract}.`);
  }
}

for (const lintCorrection of [
  legacyLeadDynamicInsertLintCorrectionMigration,
  canonicalLeadDynamicInsertLintCorrectionMigration,
]) {
  if (/\b(?:delete from|truncate|send_email|send_sms|place_call|provider_write)\b/i.test(
    lintCorrection,
  )) {
    failures.push("Cross-schema lint corrections must not mutate CRM data or invoke providers.");
  }
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
  "Verified raw filename order matches numeric order from 0001 through 0036 followed by the registered timestamped migrations.",
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
console.log(
  "Verified 0027_gmail_workspace_email_foundation.sql precedes 0028_google_calendar_scheduling_foundation.sql.",
);
console.log(
  "Verified 0028_google_calendar_scheduling_foundation.sql precedes 0029_google_business_profile_foundation.sql.",
);
console.log(
  "Verified 0029_google_business_profile_foundation.sql precedes 0030_quickbooks_online_foundation.sql.",
);
console.log(
  "Verified 0030_quickbooks_online_foundation.sql precedes 0031_electronic_signatures_foundation.sql.",
);
console.log(
  "Verified 0031_electronic_signatures_foundation.sql precedes 0032_estimate_proposal_builder_v2.sql.",
);
console.log(
  "Verified 0032_estimate_proposal_builder_v2.sql precedes 0033_ai_tools_operating_brain.sql.",
);
console.log(
  "Verified 0033_ai_tools_operating_brain.sql precedes 0034_office_operations_daily_task_queue.sql.",
);
console.log(
  "Verified 0034_office_operations_daily_task_queue.sql precedes 0035_office_task_source_delete_cascade.sql.",
);
console.log(
  "Verified 0035_office_task_source_delete_cascade.sql precedes 0036_gohighlevel_oauth_communications_bridge.sql.",
);
console.log(
  "Verified 0036_gohighlevel_oauth_communications_bridge.sql precedes 20260808222141_stripe_company_isolation.sql.",
);
console.log(
  "Verified 20260808222141_stripe_company_isolation.sql precedes 20260810225320_stripe_refund_reconciliation.sql.",
);
console.log(
  "Verified 20260810225320_stripe_refund_reconciliation.sql precedes 20260814051533_crm_identity_reconciliation.sql.",
);
console.log(
  "Verified 20260814051533_crm_identity_reconciliation.sql precedes 20260814053339_crm_identity_reconciliation_runtime_hardening.sql.",
);
console.log(
  "Verified 20260814053339_crm_identity_reconciliation_runtime_hardening.sql precedes 20260814054250_crm_identity_reconciliation_invariant_hardening.sql.",
);
console.log(
  "Verified 20260814054250_crm_identity_reconciliation_invariant_hardening.sql precedes 20260814061253_crm_identity_reconciliation_stale_version_error_hardening.sql.",
);
console.log(
  "Verified 20260814061253_crm_identity_reconciliation_stale_version_error_hardening.sql precedes 20260814063407_crm_identity_reconciliation_release_hardening.sql.",
);
console.log(
  "Verified CRM identity release hardening and Mighty Apes Yelp intake precede Lead Attribution & Marketing Accountability Phase 1.",
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
  "Verified 0029 adds google_business_profile to integration, source mapping, and lead intake provider constraints.",
);
console.log(
  "Verified 0030 adds quickbooks_online to integration provider constraints without broad RLS policies.",
);
console.log(
  "Verified 0031 adds docusign and dropbox_sign to integration provider constraints without broad RLS policies.",
);
console.log(
  "Verified 0032 proposal tables, customer-safe document categories, pricing options, and scoped RLS policies.",
);
console.log(
  "Verified 0033 AI persistence tables, provider-disabled defaults, scoped RLS policies, and authenticated delete revocation.",
);
console.log(
  "Verified CRM identity reconciliation transaction, immutable audit, owner/admin authorization, exact-version locks, same-company guards, and provider/financial isolation.",
);
console.log(
  "Verified Mighty Apes Yelp delivery and lead idempotency locks, immutable non-PII audit, exact WeatherTech campaign routing, test-only isolation, service-role-only transactional intake, and narrow audit row-lock privilege.",
);
console.log(
  "Verified Lead Attribution & Marketing Accountability Phase 1 additive schema, immutable non-PII ledger, fixed-search-path RPCs, strict company isolation, first-touch locks, lifecycle chronology, optimistic concurrency, Phoenix reporting, no-backfill contract, and narrow synthetic cleanup privileges.",
);
console.log(
  "Verified secure company-scoped job photos and its rollback/retry correction precede the final registered native proposal e-sign/sold-job gate migration, all with exact approved SQL hashes.",
);
console.log(
  "Verified 0027 Gmail Workspace schema, service-only credentials, company-scoped metadata, duplicate prevention, and transactional wrapper.",
);
console.log(
  "Verified 0028 Google Calendar schema, service-only credentials, company-scoped calendar metadata, sync mapping fields, and transactional wrapper.",
);
console.log(
  "Verified the service-role-only AI quota status RPC is bounded, exact-company scoped, UTC aligned, lock-free, and read-only.",
);
