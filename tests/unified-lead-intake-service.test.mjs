import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-unified-lead-intake-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function createRecordId(table, index) {
  const prefix = {
    leads: "lead",
    lead_intake_records: "intake",
    integration_sync_logs: "sync",
    notifications: "notification",
  }[table] ?? table.replace(/_/g, "-");

  return `${prefix}-${index}`;
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.kind === "eq") {
        return row[filter.column] === filter.value;
      }

      if (filter.kind === "not-null") {
        return row[filter.column] !== null && row[filter.column] !== undefined;
      }

      if (filter.kind === "in") {
        return filter.values.includes(row[filter.column]);
      }

      return true;
    }),
  );
}

function createMockSupabase(initialState) {
  const state = {
    companies: [],
    customers: [],
    leads: [],
    lead_source_mappings: [],
    integration_sync_logs: [],
    lead_intake_records: [],
    notifications: [],
    failInsertsFor: new Set(),
    ...initialState,
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.limitCount = null;
      this.mode = "select";
      this.payload = null;
    }

    select() {
      return this;
    }

    insert(payload) {
      this.mode = "insert";
      this.payload = payload;
      return this;
    }

    update(payload) {
      this.mode = "update";
      this.payload = payload;
      return this;
    }

    eq(column, value) {
      this.filters.push({ kind: "eq", column, value });
      return this;
    }

    not(column, operator, value) {
      if (operator === "is" && value === null) {
        this.filters.push({ kind: "not-null", column });
      }

      return this;
    }

    in(column, values) {
      this.filters.push({ kind: "in", column, values });
      return this;
    }

    order() {
      return this;
    }

    limit(value) {
      this.limitCount = value;
      return this;
    }

    async maybeSingle() {
      const result = await this.execute();
      return {
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
        error: result.error,
      };
    }

    async single() {
      const result = await this.execute();
      return {
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
        error: result.error,
      };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    async execute() {
      const tableRows = state[this.table];

      if (!Array.isArray(tableRows)) {
        return { data: null, error: new Error(`Unknown table ${this.table}`) };
      }

      if (this.mode === "insert") {
        if (state.failInsertsFor.has(this.table)) {
          return {
            data: null,
            error: new Error(`TEST forced insert failure for ${this.table}`),
          };
        }

        const records = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = records.map((record) => ({
          id: record.id ?? createRecordId(this.table, tableRows.length + 1),
          created_at: record.created_at ?? new Date().toISOString(),
          updated_at: record.updated_at ?? new Date().toISOString(),
          ...record,
        }));
        tableRows.push(...inserted);
        return { data: Array.isArray(this.payload) ? inserted : inserted[0], error: null };
      }

      if (this.mode === "update") {
        const rows = applyFilters(tableRows, this.filters);
        rows.forEach((row) => Object.assign(row, this.payload));
        return { data: rows, error: null };
      }

      let rows = applyFilters(tableRows, this.filters);

      if (this.limitCount !== null) {
        rows = rows.slice(0, this.limitCount);
      }

      return { data: rows, error: null };
    }
  }

  return {
    state,
    client: {
      from(table) {
        return new Query(table);
      },
    },
  };
}

const baseCompany = {
  id: "company-weathertech",
  name: "WeatherTech Roofing LLC",
  short_name: "WeatherTech",
  trade: "roofing",
};

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/crm/leadRouting.ts",
      "lib/crm/leadIntake.ts",
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
      `Could not compile lead intake service.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const leadIntake = await import(pathToFileURL(join(outDir, "leadIntake.js")));

  const customerMatchDb = createMockSupabase({
    companies: [baseCompany],
    customers: [
      {
        id: "customer-1",
        company_id: baseCompany.id,
        display_name: "Jane Homeowner",
        contact_name: "Jane Homeowner",
        phone: "+16025550101",
        email: "jane@example.test",
        property_address: "111 Test Roof Way",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const customerLead = leadIntake.normalizeWebsiteLeadBody({
    business: "WeatherTech",
    name: "Jane Homeowner",
    phone: "(602) 555-0101",
    email: "jane@example.test",
    address: "111 Test Roof Way",
    city: "Phoenix",
    serviceType: "roofing",
    source: "Website",
    externalLeadId: "website-customer-match",
  });
  assert(customerLead.lead, "Customer-match lead normalizes");
  const customerResult = await leadIntake.processLeadIntake(
    customerMatchDb.client,
    customerLead.lead,
  );
  assertEqual(customerResult.customerId, "customer-1", "Existing customer is returned");
  assertEqual(customerResult.leadId, undefined, "Existing customer match does not create a lead id");
  assertEqual(customerMatchDb.state.leads.length, 0, "Existing customer match does not insert a lead");
  assertEqual(
    customerMatchDb.state.lead_intake_records[0]?.linked_customer_id,
    "customer-1",
    "Intake record links to existing customer",
  );
  assertEqual(
    customerMatchDb.state.integration_sync_logs[0]?.related_table,
    "customers",
    "Integration log records the customer attachment outcome",
  );
  assertEqual(
    customerMatchDb.state.notifications[0]?.customer_id,
    "customer-1",
    "Existing customer intake creates a customer follow-up",
  );

  const newLeadDb = createMockSupabase({ companies: [baseCompany] });
  const websiteLead = leadIntake.normalizeWebsiteLeadBody({
    business: "WeatherTech",
    name: "Sam Newlead",
    phone: "6025550102",
    address: "222 Fresh Lead Ave",
    city: "Phoenix",
    serviceType: "roofing",
    source: "Website estimate request",
    utmCampaign: "spring-roofs",
  });
  assert(websiteLead.lead, "Website lead normalizes");
  const createdResult = await leadIntake.processLeadIntake(
    newLeadDb.client,
    websiteLead.lead,
  );
  assert(createdResult.leadId, "New intake creates one lead");
  assertEqual(newLeadDb.state.leads.length, 1, "New intake inserts one lead");
  assertEqual(
    newLeadDb.state.lead_intake_records[0]?.linked_lead_id,
    createdResult.leadId,
    "Intake record links to the created lead",
  );
  assertEqual(
    newLeadDb.state.lead_intake_records[0]?.follow_up_state,
    "scheduled",
    "New intake records scheduled follow-up state",
  );
  assertEqual(newLeadDb.state.notifications.length, 1, "New intake creates a follow-up");

  const leadMatchDb = createMockSupabase({
    companies: [baseCompany],
    leads: [
      {
        id: "lead-existing",
        company_id: baseCompany.id,
        contact_name: "Existing Lead",
        phone: "+16025550103",
        email: null,
        property_address: "333 Existing Lead Rd",
        source: "Website",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const duplicateLead = leadIntake.normalizeTwilioSmsLeadBody({
    from: "6025550103",
    body: "Need roof repair",
    address: "333 Existing Lead Rd",
    city: "Phoenix",
    serviceType: "roofing",
    business: "WeatherTech",
    messageSid: "SM_DUPLICATE",
  });
  assert(duplicateLead.lead, "Twilio lead normalizes");
  const duplicateResult = await leadIntake.processLeadIntake(
    leadMatchDb.client,
    duplicateLead.lead,
  );
  assertEqual(
    duplicateResult.duplicateOfLeadId,
    "lead-existing",
    "Existing lead match is returned as duplicate",
  );
  assertEqual(leadMatchDb.state.leads.length, 1, "Duplicate lead intake does not insert a second lead");

  const yelpCustomerMatchDb = createMockSupabase({
    companies: [baseCompany],
    customers: [
      {
        id: "customer-yelp-1",
        company_id: baseCompany.id,
        display_name: "Yelp Existing Customer",
        contact_name: "Yelp Existing Customer",
        phone: "+16025550105",
        email: "yelp-existing@example.test",
        property_address: "555 Yelp Match Way",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const yelpCustomerLead = leadIntake.normalizeYelpLeadBody({
    business: "WeatherTech",
    verifiedCompanyKey: "weathertech_roofing",
    verifiedBranchKey: "weathertech_phoenix",
    name: "Yelp Existing Customer",
    phone: "(602) 555-0105",
    email: "yelp-existing@example.test",
    address: "555 Yelp Match Way",
    city: "Phoenix",
    serviceType: "roofing",
    source: "WeatherTech Yelp",
    yelpBusinessId: "TEST_YELP_BUSINESS",
    yelpLeadId: "TEST_YELP_CUSTOMER_MATCH",
  });
  assert(yelpCustomerLead.lead, "Yelp customer-match lead normalizes");
  const yelpCustomerResult = await leadIntake.processLeadIntake(
    yelpCustomerMatchDb.client,
    yelpCustomerLead.lead,
  );
  assertEqual(
    yelpCustomerResult.customerId,
    "customer-yelp-1",
    "Yelp intake attaches to an existing customer",
  );
  assertEqual(
    yelpCustomerMatchDb.state.leads.length,
    0,
    "Yelp existing customer match does not create a duplicate lead",
  );
  assertEqual(
    yelpCustomerMatchDb.state.notifications[0]?.customer_id,
    "customer-yelp-1",
    "Yelp existing customer match creates a customer follow-up",
  );

  const yelpProviderDuplicateDb = createMockSupabase({
    companies: [baseCompany],
    leads: [
      {
        id: "lead-yelp-existing",
        company_id: baseCompany.id,
        contact_name: "Existing Yelp Lead",
        phone: "+16025550106",
        email: null,
        property_address: "666 Yelp Duplicate Way",
        source: "Yelp",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    integration_sync_logs: [
      {
        id: "sync-yelp-existing",
        provider: "yelp",
        event_type: "yelp.lead.created",
        status: "succeeded",
        related_table: "leads",
        related_record_id: "lead-yelp-existing",
        external_id: "YELP-DUPLICATE-LEAD",
        request_fingerprint: "fingerprint-existing",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const yelpDuplicateLead = leadIntake.normalizeYelpLeadBody({
    business: "WeatherTech",
    verifiedCompanyKey: "weathertech_roofing",
    verifiedBranchKey: "weathertech_phoenix",
    name: "Existing Yelp Lead",
    phone: "6025550106",
    address: "666 Yelp Duplicate Way",
    city: "Phoenix",
    serviceType: "roofing",
    source: "WeatherTech Yelp",
    yelpBusinessId: "TEST_YELP_BUSINESS",
    yelpLeadId: "YELP-DUPLICATE-LEAD",
  });
  assert(yelpDuplicateLead.lead, "Yelp duplicate lead normalizes");
  const yelpDuplicateResult = await leadIntake.processLeadIntake(
    yelpProviderDuplicateDb.client,
    yelpDuplicateLead.lead,
  );
  assertEqual(
    yelpDuplicateResult.duplicateOfLeadId,
    "lead-yelp-existing",
    "Yelp provider external ID prevents duplicate processing",
  );
  assertEqual(
    yelpProviderDuplicateDb.state.leads.length,
    1,
    "Yelp provider duplicate does not insert a second lead",
  );

  const invalidGmail = leadIntake.normalizeGmailLeadBody({});
  assertEqual(
    invalidGmail.lead,
    null,
    "Malformed Gmail payload without contact or message is rejected",
  );

  const gmailLead = leadIntake.normalizeGmailLeadBody({
    gmailMessageId: "gmail-message-1",
    fromEmail: "Owner@Example.TEST",
    subject: "Need a roof estimate",
    body: "Please contact me about a roof inspection.",
    business: "WeatherTech",
    city: "Phoenix",
  });
  assert(gmailLead.lead, "Gmail payload creates a lead-intake candidate");
  assertEqual(gmailLead.lead.provider, "gmail", "Gmail provider is preserved");
  assertEqual(gmailLead.lead.email, "owner@example.test", "Gmail email is normalized");

  const failedDb = createMockSupabase({
    companies: [baseCompany],
    failInsertsFor: new Set(["leads"]),
  });
  const failedLead = leadIntake.normalizeWebsiteLeadBody({
    business: "WeatherTech",
    name: "Failed Lead",
    phone: "6025550104",
    address: "444 Failure Loop",
    city: "Phoenix",
    serviceType: "roofing",
  });
  assert(failedLead.lead, "Failure test lead normalizes");
  const failedResult = await leadIntake.processLeadIntake(
    failedDb.client,
    failedLead.lead,
  );
  assertEqual(failedResult.status, "error", "Provider persistence failure is reported");
  assertEqual(
    failedDb.state.integration_sync_logs[0]?.status,
    "failed",
    "Provider failure writes a failed integration sync log",
  );

  console.log("Unified lead intake service regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
