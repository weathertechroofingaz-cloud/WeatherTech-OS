import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const migrationPattern = /^([0-9]+)_[a-z0-9][a-z0-9_]*\.sql$/;
const jobProductionMigration = "0012001_job_production_details.sql";
const jobProductionSqlSha256 =
  "49529318b462b3e5ab132aa87fe7890a72705d3f3e7f85aeeb7a73ae02a0eda8";

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const failures = [];
const versions = new Map();

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

const ordered = files
  .filter((file) => migrationPattern.test(file))
  .map((file) => ({
    file,
    version: migrationPattern.exec(file)?.[1] ?? "",
  }))
  .sort((left, right) => {
    const byVersion = left.version.localeCompare(right.version);
    return byVersion === 0 ? left.file.localeCompare(right.file) : byVersion;
  });

const integrationSyncIndex = ordered.findIndex(
  (migration) => migration.file === "0012_integration_sync_logs.sql",
);
const jobProductionIndex = ordered.findIndex(
  (migration) => migration.file === jobProductionMigration,
);
const websiteLeadIntakeIndex = ordered.findIndex(
  (migration) => migration.file === "0013_website_lead_intake_provider.sql",
);

if (jobProductionIndex === -1) {
  failures.push(`${jobProductionMigration} is missing.`);
}

if (files.includes("0012_job_production_details.sql")) {
  failures.push("0012_job_production_details.sql must remain renamed to avoid duplicate versions.");
}

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

if (jobProductionIndex !== -1) {
  const sql = fs.readFileSync(path.join(migrationsDir, jobProductionMigration));
  const sha256 = createHash("sha256").update(sql).digest("hex");

  if (sha256 !== jobProductionSqlSha256) {
    failures.push(
      `${jobProductionMigration} SQL hash changed: expected ${jobProductionSqlSha256}, received ${sha256}.`,
    );
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
  "Verified 0012_integration_sync_logs.sql -> 0012001_job_production_details.sql -> 0013_website_lead_intake_provider.sql.",
);
console.log(`Verified ${jobProductionMigration} SQL SHA-256 ${jobProductionSqlSha256}.`);
