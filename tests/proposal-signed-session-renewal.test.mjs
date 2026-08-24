import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const migration = readFileSync(
  join(
    cwd,
    "supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql",
  ),
  "utf8",
);

function source(path) {
  return readFileSync(join(cwd, path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireAll(haystack, values, scope) {
  for (const value of values) {
    assert(haystack.includes(value), `${scope} is missing: ${value}`);
  }
}

function functionSource(name) {
  const marker = `create or replace function public.${name}`;
  const start = migration.indexOf(marker);
  assert(start >= 0, `Migration defines ${name}`);
  const next = migration.indexOf(
    "\ncreate or replace function public.",
    start + marker.length,
  );
  return migration.slice(start, next === -1 ? undefined : next);
}

const exchange = functionSource("wtos_exchange_proposal_signing_token");
const accept = functionSource("wtos_accept_proposal_signing");
const decline = functionSource("wtos_decline_proposal_signing");
const session = functionSource("wtos_get_proposal_signing_session");
const rateAccountingIndex = exchange.indexOf(
  "exchange_attempt_count = attempt_count",
);
const tokenDigestIndex = exchange.indexOf(
  "selected_request.request_token_sha256 is distinct from request_token_sha256",
);
const consumedIndex = exchange.indexOf(
  "if selected_request.request_token_consumed_at is not null then",
);
const expiryCapIndex = exchange.indexOf(
  "request_session_expires_at := least(",
);
const renewalIndex = exchange.indexOf(
  "if selected_request.request_token_consumed_at is not null then",
  consumedIndex + 1,
);
const preparedIndex = exchange.indexOf(
  "if selected_request.status = 'prepared' then",
);

assert(
  rateAccountingIndex >= 0 &&
    tokenDigestIndex > rateAccountingIndex &&
    consumedIndex > tokenDigestIndex &&
    expiryCapIndex > consumedIndex &&
    renewalIndex > expiryCapIndex &&
    preparedIndex > renewalIndex,
  "Signed renewal remains behind exchange rate accounting, exact raw-token hashing, original response-loss replay, and request/session expiry capping",
);

const consumedRetry = exchange.slice(consumedIndex, expiryCapIndex);
requireAll(
  consumedRetry,
  [
    "session.id = selected_request.request_token_consumed_session_id",
    "session.company_id = selected_request.company_id",
    "session.signing_request_id = selected_request.id",
    "session.session_token_sha256 = request_session_sha256",
    "created_session.status <> 'active'",
    "created_session.expires_at <= attempt_time",
    "selected_request.status <> 'viewed'",
    "'status', 'active'",
    "selected_request.status <> 'signed'",
    "or created_session.id is not null",
  ],
  "Original active-session response-loss replay",
);

const renewal = exchange.slice(renewalIndex, preparedIndex);
requireAll(
  renewal,
  [
    "consumed_session.id = selected_request.request_token_consumed_session_id",
    "consumed_session.signing_request_id = selected_request.id",
    "consumed_session.company_id = selected_request.company_id",
    "consumed_session.status = 'signed'",
    "consumed_session.signed_at = selected_request.signed_at",
    "acceptance.company_id = selected_request.company_id",
    "acceptance.proposal_revision_id = selected_request.proposal_revision_id",
    "revision.status in ('accepted', 'converted_to_job')",
    "revision.signature_status = 'signed'",
    "revision.accepted_acceptance_id = acceptance.id",
    "revision.accepted_signature_id = signature.id",
    "acceptance.acceptance_method = 'native_electronic'",
    "acceptance.signature_status = 'signed'",
    "signature.acceptance_id = acceptance.id",
    "selected_request.proposal_document_id = document.id",
    "document.storage_bucket = 'customer-documents'",
    "document.file_url is null",
    "document.immutable_after_at is not null",
    "selected_request.revision_sha256 = revision.revision_sha256",
    "selected_request.document_sha256 = document.content_sha256",
    "acceptance.consent_sha256 = selected_request.consent_sha256",
    "acceptance.evidence_sha256 = signature.evidence_sha256",
    "conflicting_session.signing_request_id <> selected_request.id",
    "request_session_sha256,\n      'signed'",
    "selected_request.signed_at",
    "proposal_signing_sessions.status = 'signed'",
    "proposal_signing_sessions.expires_at > attempt_time",
    "'native_signed_proposal_link_reopened'",
    "'accessMode', 'signed_read_only'",
    "'status', 'signed'",
  ],
  "Exact company/evidence-bound signed-session renewal",
);
assert(
  !renewal.includes("request_token_consumed_at =") &&
    !renewal.includes("request_token_consumed_session_id =") &&
    !renewal.includes("'status', 'active'") &&
    !renewal.includes("consumed_session.expires_at"),
  "Signed renewal neither resets one-time token evidence, returns signing authority, nor requires the original signed session to remain unexpired",
);
requireAll(
  exchange.slice(expiryCapIndex, renewalIndex),
  [
    "selected_request.expires_at",
    "attempt_time + interval '24 hours'",
    "request_session_expires_at <= attempt_time",
  ],
  "Exact request/session expiry boundary",
);

requireAll(
  accept,
  [
    "'sessionHash', request_session_sha256",
    "existing_acceptance.acceptance_request_sha256 is distinct from request_fingerprint_sha256",
    "selected_session.status <> 'active'",
  ],
  "Acceptance response-loss binding and new-action gate",
);
requireAll(
  decline,
  [
    "'sessionHash', request_session_sha256",
    "selected_session.status <> 'active'",
  ],
  "Decline response-loss binding and new-action gate",
);
requireAll(
  session,
  [
    "selected_session.status not in ('active', 'signed', 'declined')",
    "selected_session.expires_at <= access_time",
    "selected_request.expires_at <= access_time",
    "selected_session.status = 'signed' and selected_request.status <> 'signed'",
    "selected_receipt_document.content_sha256 is distinct from selected_receipt.signed_document_sha256",
  ],
  "Read-only signed session and receipt integrity read",
);

const exchangeRoute = source(
  "app/api/proposals/signing/[requestId]/exchange/route.ts",
);
const httpSource = source("lib/proposal-signing/http.ts");
const contractsSource = source("lib/proposal-signing/contracts.ts");
requireAll(
  exchangeRoute,
  [
    "status: result.status",
    'result.status === "active" ? generateProposalSigningToken(24) : null',
    "getProposalSigningSessionCookieMaxAge(result.sessionExpiresAt)",
  ],
  "Public exchange route signed/read-write split",
);
requireAll(
  httpSource,
  [
    "csrfToken: string | null",
    'csrfToken ?? ""',
    "maxAge: csrfToken ? maxAge : 0",
    "Math.min(\n      PROPOSAL_SIGNING_SESSION_TTL_SECONDS",
  ],
  "Bounded signed-session cookie contract",
);
assert(
  contractsSource.includes('status: "active" | "signed";'),
  "Exchange contract truthfully represents terminal read-only signed sessions",
);

const outDir = mkdtempSync(join(tmpdir(), "wtos-signed-session-renewal-"));
try {
  const compile = spawnSync(
    join(cwd, "node_modules/.bin/tsc"),
    [
      "lib/proposal-signing/constants.ts",
      "lib/proposal-signing/contracts.ts",
      "lib/proposal-signing/http.ts",
      "lib/proposal-signing/security.ts",
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
  assert(
    compile.status === 0,
    `Signed-session HTTP contract compiles.\n${compile.stdout}\n${compile.stderr}`,
  );

  process.env.NODE_PATH = join(cwd, "node_modules");
  createRequire(import.meta.url)("node:module").Module._initPaths();
  const http = await import(pathToFileURL(join(outDir, "http.js")));
  const security = await import(pathToFileURL(join(outDir, "security.js")));
  const { NextResponse } = createRequire(import.meta.url)("next/server");
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const sessionName = `__Host-wtos-ps-${requestId}`;
  const csrfName = `__Host-wtos-pc-${requestId}`;

  const rawToken = security.generateProposalSigningToken();
  const originalExchangeKey = security.generateProposalSigningToken();
  const renewalExchangeKey = security.generateProposalSigningToken();
  const derivationInput = {
    requestId,
    rawToken,
    serverSecret: "local-runtime-proof-service-secret",
  };
  const originalSessionToken = security.deriveProposalSigningSessionToken({
    ...derivationInput,
    exchangeKey: originalExchangeKey,
  });
  const replayedOriginalSessionToken = security.deriveProposalSigningSessionToken({
    ...derivationInput,
    exchangeKey: originalExchangeKey,
  });
  const renewedSignedSessionToken = security.deriveProposalSigningSessionToken({
    ...derivationInput,
    exchangeKey: renewalExchangeKey,
  });
  assert(
    originalSessionToken === replayedOriginalSessionToken,
    "The same browser-memory exchange key deterministically recovers the original active session after response loss",
  );
  assert(
    renewedSignedSessionToken !== originalSessionToken &&
      security.hashProposalSigningToken(renewedSignedSessionToken) !==
        security.hashProposalSigningToken(originalSessionToken),
    "A fresh exchange key derives a distinct hashed credential for signed read-only re-entry without changing the raw invitation token",
  );

  assert(
    http.getProposalSigningSessionCookieMaxAge(
      "2026-08-24T01:00:00.000Z",
      Date.parse("2026-08-24T00:00:00.000Z"),
    ) === 3600,
    "Cookie lifetime follows a nearer exact request/session deadline",
  );
  assert(
    http.getProposalSigningSessionCookieMaxAge(
      "2026-08-25T00:00:00.000Z",
      Date.parse("2026-08-24T00:00:00.000Z"),
    ) === 7200,
    "Cookie lifetime never exceeds the ordinary two-hour session TTL",
  );
  assert(
    http.getProposalSigningSessionCookieMaxAge(
      "2026-08-23T23:59:59.000Z",
      Date.parse("2026-08-24T00:00:00.000Z"),
    ) === 0 &&
      http.getProposalSigningSessionCookieMaxAge("not-a-date") === 0,
    "Expired or invalid server deadlines cannot produce a live cookie",
  );

  const activeResponse = NextResponse.json({ ok: true });
  http.setProposalSigningCookies({
    response: activeResponse,
    requestId,
    sessionToken: "s".repeat(43),
    csrfToken: "c".repeat(32),
    maxAge: 3600,
  });
  const activeCookies = activeResponse.headers.get("set-cookie") ?? "";
  assert(
    activeCookies.includes(`${sessionName}=${"s".repeat(43)}`) &&
      activeCookies.includes("HttpOnly") &&
      activeCookies.includes(`${csrfName}=${"c".repeat(32)}`) &&
      !activeCookies.includes(`${csrfName}=;`),
    "Active exchange retains its HttpOnly session and nonempty CSRF cookie for response-loss-safe actions",
  );

  const signedResponse = NextResponse.json({ ok: true });
  http.setProposalSigningCookies({
    response: signedResponse,
    requestId,
    sessionToken: "r".repeat(43),
    csrfToken: null,
    maxAge: 3600,
  });
  const signedCookies = signedResponse.headers.get("set-cookie") ?? "";
  assert(
    signedCookies.includes(`${sessionName}=${"r".repeat(43)}`) &&
      signedCookies.includes("HttpOnly") &&
      signedCookies.includes(`${csrfName}=;`) &&
      signedCookies.includes("Max-Age=0"),
    "Signed renewal keeps only the read credential and clears any action CSRF cookie",
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("Signed proposal session renewal tests passed.");
