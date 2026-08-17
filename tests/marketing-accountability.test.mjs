import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-marketing-accountability-"));
let assertionCount = 0;

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  assertionCount += 1;
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
  assertionCount += 1;
}

function closeTo(actual, expected, message) {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
  assertionCount += 1;
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules/.bin/tsc"),
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--skipLibCheck",
      "--outDir",
      outDir,
      "lib/crm/marketingAccountability.ts",
    ],
    { cwd, encoding: "utf8" },
  );

  check(
    compile.status === 0,
    `Marketing accountability helpers did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const accountability = await import(
    `${pathToFileURL(join(outDir, "marketingAccountability.js")).href}?v=${Date.now()}`
  );

  check(
    JSON.stringify(accountability.canonicalAttributionSourceKeys) ===
      JSON.stringify([
        "website",
        "google",
        "yelp",
        "phone",
        "email",
        "referral",
        "repeat_customer",
        "manual",
        "other",
        "unknown",
      ]),
    "Canonical attribution source keys remain exact and ordered",
  );
  check(
    accountability.lostReasonOptions.some((option) => option.value === "other") &&
      accountability.lostReasonOptions.some((option) => option.value === "outside_service_area") &&
      accountability.lostReasonOptions.some((option) => option.value === "postponed"),
    "Lost-reason taxonomy is practical and includes an explicit other path",
  );
  check(
    accountability.wonValueBasisOptions.map((option) => option.value).join(",") ===
      "accepted_proposal,signed_proposal,approved_contract_total",
    "Won values use only owner-approved contract bases",
  );

  for (const [input, expected, message] of [
    [null, { status: "empty" }, "Null financial input remains empty"],
    ["   ", { status: "empty" }, "Whitespace-only financial input remains empty"],
    ["12500.50", { status: "valid", value: 12_500.5 }, "Plain decimal financial input parses exactly"],
    ["-7.25", { status: "valid", value: -7.25 }, "A negative sign is preserved for the business rule to reject"],
    ["$12,500.50", { status: "invalid" }, "Currency punctuation is never stripped into a different value"],
    ["12000 roofing", { status: "invalid" }, "Financial input with text is rejected"],
    ["NaN", { status: "invalid" }, "PostgreSQL-style NaN text is rejected client-side"],
    [Number.NaN, { status: "invalid" }, "JavaScript NaN is rejected client-side"],
    [Number.POSITIVE_INFINITY, { status: "invalid" }, "Infinite financial input is rejected client-side"],
  ]) {
    check(
      JSON.stringify(accountability.parseFiniteFinancialInput(input)) ===
        JSON.stringify(expected),
      message,
    );
  }

  const canonicalFingerprint = await accountability.getOperationPayloadFingerprint({
    company_id: "company-weathertech",
    source_key: "google",
    optional: undefined,
    nested: { b: 2, a: 1 },
  });
  const reorderedFingerprint = await accountability.getOperationPayloadFingerprint({
    nested: { a: 1, b: 2 },
    source_key: "google",
    company_id: "company-weathertech",
  });
  const changedFingerprint = await accountability.getOperationPayloadFingerprint({
    nested: { a: 1, b: 3 },
    source_key: "google",
    company_id: "company-weathertech",
  });
  check(
    /^[a-f0-9]{64}$/.test(canonicalFingerprint),
    "Operation payload fingerprints are opaque SHA-256 tokens",
  );
  equal(
    reorderedFingerprint,
    canonicalFingerprint,
    "Semantically identical retry payloads reuse one stable fingerprint regardless of object key order",
  );
  check(
    changedFingerprint !== canonicalFingerprint,
    "A changed retry payload receives a distinct fingerprint instead of reusing the prior operation token",
  );

  const attributionCases = [
    {
      name: "plain website",
      evidence: { intakeProvider: "website", source: "website" },
      expected: ["website", null, "website", "verified", true],
    },
    {
      name: "direct website transport without acquisition evidence",
      evidence: { intakeProvider: "website" },
      expected: ["website", null, "website", "verified", true],
    },
    {
      name: "Facebook source through website remains reviewable",
      evidence: { intakeProvider: "website", source: "facebook" },
      expected: ["unknown", "unsupported_source", "website", "needs_review", false],
    },
    {
      name: "Bing UTM through website remains reviewable",
      evidence: { intakeProvider: "website", source: "website", utmSource: "bing" },
      expected: ["unknown", "unsupported_utm_source", "website", "needs_review", false],
    },
    {
      name: "arbitrary UTM through website remains reviewable",
      evidence: { intakeProvider: "website", utmSource: "newsletter" },
      expected: ["unknown", "unsupported_utm_source", "website", "needs_review", false],
    },
    {
      name: "arbitrary source through website remains reviewable",
      evidence: { intakeProvider: "website", source: "partner portal" },
      expected: ["unknown", "unsupported_source", "website", "needs_review", false],
    },
    {
      name: "website transport cannot self-assert Yelp attribution",
      evidence: { intakeProvider: "website", source: "yelp" },
      expected: ["unknown", "unsupported_source", "website", "needs_review", false],
    },
    {
      name: "incomplete UTM through website remains reviewable",
      evidence: { intakeProvider: "website", source: "website", utmMedium: "cpc" },
      expected: ["unknown", "incomplete_utm", "website", "needs_review", false],
    },
    {
      name: "unsupported referrer through website remains reviewable",
      evidence: { intakeProvider: "website", referrer: "https://www.facebook.com/weathertech" },
      expected: ["unknown", "unsupported_referrer", "website", "needs_review", false],
    },
    {
      name: "lookalike Google referrer remains reviewable",
      evidence: { intakeProvider: "website", referrer: "https://google.evil.com/roofing" },
      expected: ["unknown", "unsupported_referrer", "website", "needs_review", false],
    },
    {
      name: "conflicting website and Google evidence remains reviewable",
      evidence: {
        intakeProvider: "website",
        source: "facebook",
        utmSource: "google",
        utmMedium: "cpc",
      },
      expected: ["unknown", "conflicting_acquisition_evidence", "website", "needs_review", false],
    },
    {
      name: "Google Ads click id through website",
      evidence: { intakeProvider: "website", googleClickId: "gclid-test" },
      expected: ["google", "google_ads", "website", "verified", true],
    },
    {
      name: "Google Ads paid UTM through website",
      evidence: { intakeProvider: "website", utmSource: "google", utmMedium: "cpc" },
      expected: ["google", "google_ads", "website", "verified", true],
    },
    {
      name: "Google Business Profile provider",
      evidence: { intakeProvider: "google_business_profile" },
      expected: ["google", "google_business_profile", "google_business_profile", "verified", true],
    },
    {
      name: "Google organic referrer",
      evidence: { intakeProvider: "website", referrer: "https://www.google.com/search?q=roofing" },
      expected: ["google", "google_organic", "website", "verified", true],
    },
    {
      name: "Mighty Apes Yelp",
      evidence: { intakeProvider: "mighty_apes", source: "yelp" },
      expected: ["yelp", "yelp", "mighty_apes", "verified", true],
    },
    {
      name: "Gmail email",
      evidence: { intakeProvider: "gmail" },
      expected: ["email", "gmail", "gmail", "verified", true],
    },
    {
      name: "deterministic Twilio phone",
      evidence: { intakeProvider: "twilio_sms" },
      expected: ["phone", "sms", "twilio_sms", "verified", true],
    },
    {
      name: "deterministic Twilio voice",
      evidence: { intakeProvider: "twilio_voice" },
      expected: ["phone", "voice", "twilio_voice", "verified", true],
    },
    {
      name: "explicit referral",
      evidence: { explicitSourceKey: "referral", explicitSourceDetail: "customer referral" },
      expected: ["referral", "customer_referral", null, "verified", true],
    },
    {
      name: "same-company repeat opportunity",
      evidence: { isRepeatCustomer: true },
      expected: ["repeat_customer", null, "manual", "verified", true],
    },
    {
      name: "explicit manual acquisition",
      evidence: { explicitSourceKey: "manual", explicitSourceDetail: "walk in" },
      expected: ["manual", "walk_in", "manual", "verified", true],
    },
    {
      name: "explicit other acquisition",
      evidence: { explicitSourceKey: "other", explicitSourceDetail: "trade show" },
      expected: ["other", "trade_show", null, "verified", true],
    },
    {
      name: "explicit unknown",
      evidence: { explicitUnknown: true, intakeProvider: "manual" },
      expected: ["unknown", null, "manual", "unattributed", false],
    },
    {
      name: "ambiguous Google",
      evidence: { intakeProvider: "website", source: "google" },
      expected: ["unknown", "ambiguous_google", "website", "needs_review", false],
    },
    {
      name: "ambiguous Google UTM without channel evidence",
      evidence: { intakeProvider: "website", utmSource: "google" },
      expected: ["unknown", "ambiguous_google", "website", "needs_review", false],
    },
    {
      name: "insufficient evidence",
      evidence: {},
      expected: ["unknown", null, null, "needs_review", false],
    },
  ];

  for (const testCase of attributionCases) {
    const resolution = accountability.resolveLeadAcquisitionAttribution(testCase.evidence);
    const actual = [
      resolution.sourceKey,
      resolution.sourceDetail,
      resolution.intakeProvider,
      resolution.reviewStatus,
      resolution.shouldLock,
    ];
    check(
      JSON.stringify(actual) === JSON.stringify(testCase.expected),
      `${testCase.name} preserves source/provider separation and review certainty; got ${JSON.stringify(actual)}`,
    );
  }

  const unknown = accountability.resolveLeadAcquisitionAttribution({ source: "word of mouth" });
  equal(unknown.sourceKey, "unknown", "Unsupported free text never defaults to Website");
  equal(unknown.shouldLock, false, "Unsupported free text remains reviewable");

  const augustBounds = accountability.getPhoenixMonthBounds("2026-08");
  equal(augustBounds.start, "2026-08-01T07:00:00.000Z", "Phoenix August starts at local midnight");
  equal(
    augustBounds.endExclusive,
    "2026-09-01T07:00:00.000Z",
    "Phoenix August uses an exclusive next-month local-midnight boundary",
  );
  let invalidMonthRejected = false;
  try {
    accountability.getPhoenixMonthBounds("2026-13");
  } catch {
    invalidMonthRejected = true;
  }
  check(invalidMonthRejected, "Invalid report months fail closed");

  const lifecycleEvents = [
    { eventType: "contacted", occurredAt: "2026-08-01T15:00:00.000Z" },
    { eventType: "appointment_scheduled", occurredAt: "2026-08-02T15:00:00.000Z" },
    { eventType: "inspection_completed", occurredAt: "2026-08-03T15:00:00.000Z" },
    { eventType: "estimate_sent", occurredAt: "2026-08-04T15:00:00.000Z" },
  ];
  equal(
    accountability.getAccountabilityActionPreflightError({
      action: "won",
      outcome: "open",
      occurredAt: "2026-08-05T15:00:00.000Z",
      events: lifecycleEvents,
    }),
    null,
    "Lifecycle preflight permits a chronologically ordered won action",
  );
  check(
    /must follow contact/i.test(
      accountability.getAccountabilityActionPreflightError({
        action: "estimate_sent",
        outcome: "open",
        occurredAt: "2026-08-04T15:00:00.000Z",
        events: lifecycleEvents.filter(
          (event) => event.eventType !== "inspection_completed",
        ),
      }) ?? "",
    ),
    "Lifecycle preflight refuses a missing prerequisite milestone",
  );
  check(
    /cannot precede/i.test(
      accountability.getAccountabilityActionPreflightError({
        action: "won",
        outcome: "open",
        occurredAt: "2026-08-03T12:00:00.000Z",
        events: lifecycleEvents,
      }) ?? "",
    ),
    "Lifecycle preflight refuses a milestone timestamp before its prerequisite",
  );
  check(
    /terminal/i.test(
      accountability.getAccountabilityActionPreflightError({
        action: "contacted",
        outcome: "lost",
        events: lifecycleEvents,
      }) ?? "",
    ),
    "Lifecycle preflight refuses mutations after a terminal outcome",
  );
  check(
    /already recorded/i.test(
      accountability.getAccountabilityActionPreflightError({
        action: "contacted",
        outcome: "open",
        firstResponseAt: "2026-08-01T15:00:00.000Z",
        events: lifecycleEvents,
      }) ?? "",
    ),
    "Lifecycle preflight refuses a second first-human-response action",
  );

  const weatherTech = "company-weathertech";
  const ihc = "company-ihc";
  const leads = [
    {
      leadId: "google-won",
      companyId: weatherTech,
      sourceKey: "google",
      reviewStatus: "verified",
      receivedAt: "2026-08-01T07:00:00.000Z",
      firstResponseAt: "2026-08-01T08:00:00.000Z",
      outcome: "won",
      wonContractValue: 24_000,
    },
    {
      leadId: "google-lost",
      companyId: weatherTech,
      sourceKey: "google",
      reviewStatus: "verified",
      receivedAt: "2026-08-06T15:00:00.000Z",
      firstResponseAt: "2026-08-06T16:00:00.000Z",
      outcome: "lost",
      wonContractValue: null,
    },
    {
      leadId: "yelp-awaiting",
      companyId: weatherTech,
      sourceKey: "yelp",
      reviewStatus: "verified",
      receivedAt: "2026-08-07T15:00:00.000Z",
      firstResponseAt: null,
      outcome: "open",
      wonContractValue: null,
      nextFollowUpAt: "2026-08-31T18:00:00.000Z",
    },
    {
      leadId: "website-overdue",
      companyId: weatherTech,
      sourceKey: "website",
      reviewStatus: "verified",
      receivedAt: "2026-08-08T15:00:00.000Z",
      firstResponseAt: "2026-08-08T16:00:00.000Z",
      outcome: "open",
      nextFollowUpAt: "2026-08-09T15:00:00.000Z",
    },
    {
      leadId: "referral-missing-follow-up",
      companyId: weatherTech,
      sourceKey: "referral",
      reviewStatus: "verified",
      receivedAt: "2026-08-09T15:00:00.000Z",
      firstResponseAt: "2026-08-09T16:00:00.000Z",
      outcome: "open",
      nextFollowUpAt: null,
    },
    {
      leadId: "unknown-awaiting",
      companyId: weatherTech,
      sourceKey: "unknown",
      reviewStatus: "needs_review",
      receivedAt: "2026-08-10T15:00:00.000Z",
      firstResponseAt: null,
      outcome: "open",
    },
    {
      leadId: "manual-won-missing-value",
      companyId: weatherTech,
      sourceKey: "manual",
      reviewStatus: "verified",
      receivedAt: "2026-08-11T15:00:00.000Z",
      firstResponseAt: "2026-08-11T16:00:00.000Z",
      outcome: "won",
      wonContractValue: null,
    },
    {
      leadId: "july-local",
      companyId: weatherTech,
      sourceKey: "google",
      reviewStatus: "verified",
      receivedAt: "2026-08-01T06:59:59.999Z",
      outcome: "open",
    },
    {
      leadId: "september-local",
      companyId: weatherTech,
      sourceKey: "google",
      reviewStatus: "verified",
      receivedAt: "2026-09-01T07:00:00.000Z",
      outcome: "open",
    },
    {
      leadId: "ihc-august",
      companyId: ihc,
      sourceKey: "google",
      reviewStatus: "verified",
      receivedAt: "2026-08-12T15:00:00.000Z",
      outcome: "won",
      wonContractValue: 99_999,
    },
  ];
  const event = (leadId, eventType, companyId = weatherTech) => ({
    leadId,
    companyId,
    eventType,
    occurredAt: "2026-08-20T15:00:00.000Z",
  });
  const events = [
    ...["google-won", "google-lost", "website-overdue", "referral-missing-follow-up", "manual-won-missing-value"]
      .flatMap((leadId) => [
        event(leadId, "appointment_scheduled"),
        event(leadId, "inspection_completed"),
      ]),
    event("google-won", "won"),
    event("google-lost", "lost"),
    event("website-overdue", "estimate_sent"),
    event("referral-missing-follow-up", "estimate_sent"),
    event("yelp-awaiting", "estimate_sent"),
    event("manual-won-missing-value", "won"),
    event("yelp-awaiting", "appointment_scheduled", ihc),
    event("google-won", "won"),
  ];
  const spend = [
    { companyId: weatherTech, spendMonth: "2026-08", sourceKey: "google", amount: 3_000 },
    { companyId: weatherTech, spendMonth: "2026-08", sourceKey: "yelp", amount: 1_000 },
    { companyId: weatherTech, spendMonth: "2026-08", sourceKey: "website", amount: 500 },
    { companyId: weatherTech, spendMonth: "2026-09", sourceKey: "google", amount: 7_000 },
    { companyId: ihc, spendMonth: "2026-08", sourceKey: "google", amount: 9_999 },
  ];

  const metrics = accountability.calculateMarketingAccountabilityMetrics({
    month: "2026-08",
    companyId: weatherTech,
    sourceKey: "all",
    leads,
    events,
    spend,
    now: "2026-08-31T18:00:00.000Z",
    missingAccountabilityLeadCount: 10,
  });

  equal(metrics.leadCount, 7, "Lead count uses distinct received-date cohort leads and Phoenix boundaries");
  equal(metrics.marketingSpend, 4_500, "Spend sums only the selected company and month");
  closeTo(metrics.costPerLead, 4_500 / 7, "Cost per lead equals spend divided by received leads");
  closeTo(metrics.bookingRate, 5 / 7, "Booking rate equals booked cohort leads divided by received leads");
  closeTo(metrics.inspectionCompletionRate, 1, "Inspection rate equals inspected leads divided by booked leads");
  closeTo(metrics.closingRate, 2 / 5, "Closing rate equals won leads divided by inspected leads");
  closeTo(metrics.costPerSoldJob, 2_250, "Cost per sold job equals spend divided by distinct won leads");
  equal(metrics.attributedContractRevenue, 24_000, "Revenue sums verified won values only");
  closeTo(metrics.marketingRevenuePerSpend, 24_000 / 4_500, "Marketing revenue per spend uses verified revenue and spend");
  equal(metrics.newAwaitingContact, 2, "Awaiting-contact excludes leads with successful human contact");
  equal(metrics.unsoldEstimatesNeedingFollowUp, 1, "Only overdue explicit follow-up dates enter the follow-up queue");
  equal(metrics.unsoldEstimatesMissingFollowUp, 1, "Open sent estimates without a follow-up date remain visible as a data gap");
  equal(metrics.unattributedLeadCount, 1, "Unknown or unverified attribution remains visible");
  closeTo(metrics.attributionCoverage, 6 / 7, "Coverage measures verified non-unknown attribution");
  equal(metrics.missingWonValueCount, 1, "Won records missing a verified value remain visible as a data gap");
  equal(metrics.missingAccountabilityLeadCount, 10, "Existing unsupported leads are reported as missing accountability, not backfilled");

  const metricsWithoutLegacyGap =
    accountability.calculateMarketingAccountabilityMetrics({
      month: "2026-08",
      companyId: weatherTech,
      sourceKey: "all",
      leads,
      events,
      spend,
      now: "2026-08-31T18:00:00.000Z",
      missingAccountabilityLeadCount: 0,
    });
  for (const metricKey of [
    "leadCount",
    "marketingSpend",
    "costPerLead",
    "bookedLeadCount",
    "bookingRate",
    "inspectionCompletedLeadCount",
    "inspectionCompletionRate",
    "wonLeadCount",
    "closingRate",
    "costPerSoldJob",
    "attributedContractRevenue",
    "marketingRevenuePerSpend",
    "newAwaitingContact",
    "unsoldEstimatesNeedingFollowUp",
    "unsoldEstimatesMissingFollowUp",
    "unattributedLeadCount",
    "attributionCoverage",
    "missingWonValueCount",
  ]) {
    equal(
      metrics[metricKey],
      metricsWithoutLegacyGap[metricKey],
      `An unaccounted legacy lead changes only its data-quality gap, not ${metricKey}`,
    );
  }
  equal(
    metricsWithoutLegacyGap.missingAccountabilityLeadCount,
    0,
    "Removing the synthetic legacy gap changes only the explicit gap counter",
  );

  const googleMetrics = accountability.calculateMarketingAccountabilityMetrics({
    month: "2026-08",
    companyId: weatherTech,
    sourceKey: "google",
    leads,
    events,
    spend,
    now: "2026-08-31T18:00:00.000Z",
    missingAccountabilityLeadCount: 10,
  });
  equal(googleMetrics.leadCount, 2, "Source filter limits the cohort");
  equal(googleMetrics.marketingSpend, 3_000, "Source filter limits spend");
  closeTo(googleMetrics.costPerLead, 1_500, "Source cost per lead is exact");
  closeTo(googleMetrics.bookingRate, 1, "Source booking rate is exact");
  closeTo(googleMetrics.inspectionCompletionRate, 1, "Source inspection rate is exact");
  closeTo(googleMetrics.closingRate, 0.5, "Source closing rate is exact");
  closeTo(googleMetrics.costPerSoldJob, 3_000, "Source cost per sold job is exact");
  equal(googleMetrics.attributedContractRevenue, 24_000, "Source revenue is exact");
  closeTo(googleMetrics.marketingRevenuePerSpend, 8, "Source revenue/spend is exact");
  equal(
    googleMetrics.missingAccountabilityLeadCount,
    10,
    "A source filter retains the company/month legacy gap because it cannot be defensibly source-allocated",
  );

  const yelpMetrics = accountability.calculateMarketingAccountabilityMetrics({
    month: "2026-08",
    companyId: weatherTech,
    sourceKey: "yelp",
    leads,
    events,
    spend,
    now: "2026-08-31T18:00:00.000Z",
  });
  equal(
    yelpMetrics.unsoldEstimatesNeedingFollowUp,
    0,
    "A follow-up due exactly now is due today, not already overdue",
  );

  const emptyMetrics = accountability.calculateMarketingAccountabilityMetrics({
    month: "2026-07",
    companyId: weatherTech,
    sourceKey: "yelp",
    leads,
    events,
    spend: [],
  });
  equal(emptyMetrics.leadCount, 0, "Empty cohort count remains zero");
  equal(emptyMetrics.costPerLead, null, "Zero lead denominator is unavailable, not zero performance");
  equal(emptyMetrics.bookingRate, null, "Zero booking denominator is unavailable");
  equal(emptyMetrics.inspectionCompletionRate, null, "Zero booked denominator is unavailable");
  equal(emptyMetrics.closingRate, null, "Zero inspected denominator is unavailable");
  equal(emptyMetrics.costPerSoldJob, null, "Zero sold-job denominator is unavailable");
  equal(emptyMetrics.marketingRevenuePerSpend, null, "Zero spend denominator is unavailable");
  equal(emptyMetrics.attributionCoverage, null, "Zero lead coverage denominator is unavailable");

  console.log(`Marketing accountability helpers: PASS (${assertionCount} assertions)`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
