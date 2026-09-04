import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-ghl-oauth-atomicity-"));
const compile = spawnSync(
  join(cwd, "node_modules", ".bin", "tsc"),
  [
    "lib/gohighlevel/oauth.ts",
    "lib/gohighlevel/foundation.ts",
    "lib/crm/types.ts",
    "--target",
    "ES2022",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--strict",
    "--skipLibCheck",
    "--esModuleInterop",
    "--outDir",
    outDir,
  ],
  { cwd, encoding: "utf8" },
);

if (compile.status !== 0) {
  throw new Error(
    `Could not compile the focused GoHighLevel OAuth modules.\n${compile.stdout}\n${compile.stderr}`,
  );
}

const oauth = await import(
  pathToFileURL(join(outDir, "gohighlevel", "oauth.js"))
);
const foundation = await import(
  pathToFileURL(join(outDir, "gohighlevel", "foundation.js"))
);
const envKeys = [
  "GHL_CLIENT_ID",
  "GHL_CLIENT_SECRET",
  "GHL_REDIRECT_URI",
  "GHL_MARKETPLACE_INSTALL_URL",
  "GHL_TOKEN_ENCRYPTION_KEY",
];
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);

process.env.GHL_CLIENT_ID = "atomicity-test-client";
process.env.GHL_CLIENT_SECRET = "atomicity-test-secret";
process.env.GHL_REDIRECT_URI =
  "https://weathertech.test/api/oauth/marketplace/callback";
process.env.GHL_MARKETPLACE_INSTALL_URL =
  "https://marketplace.gohighlevel.com/oauth/chooselocation";
process.env.GHL_TOKEN_ENCRYPTION_KEY =
  "weathertech-atomicity-test-encryption-material";

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(outDir, { recursive: true, force: true });
});

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() {
      return payload;
    },
  };
}

function refreshedTokenPayload(locationId = "location-alpha") {
  return {
    access_token: "fresh-access-token",
    refresh_token: "fresh-rotating-refresh-token",
    token_type: "Bearer",
    expires_in: 3600,
    scope: foundation.goHighLevelOAuthScopes.join(" "),
    userType: "Location",
    locationId,
    companyId: "external-agency-one",
    userId: "external-user-one",
  };
}

function makeCredential(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "10000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
    integration_connection_id: "30000000-0000-4000-8000-000000000001",
    external_location_id: "location-alpha",
    external_company_id: "external-agency-one",
    external_user_id: "external-user-one",
    encrypted_access_token: oauth.encryptGoHighLevelToken("expired-access-token"),
    encrypted_refresh_token: oauth.encryptGoHighLevelToken("active-refresh-token"),
    bridge_version: "0036",
    token_type: "Bearer",
    scopes: [...foundation.goHighLevelOAuthScopes],
    user_type: "Location",
    token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    last_refreshed_at: null,
    refresh_version: 0,
    refresh_lease_id: null,
    refresh_lease_acquired_at: null,
    refresh_lease_expires_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function cloneCredential(credential) {
  return {
    ...credential,
    scopes: [...credential.scopes],
  };
}

function createRefreshService({ credential = makeCredential(), onClaim } = {}) {
  const state = {
    credential: cloneCredential(credential),
    connection: {
      id: credential.integration_connection_id,
      company_id: credential.company_id,
      provider: "gohighlevel",
      external_account_id: credential.external_location_id,
    },
    connectionStatus: "connected",
    claimCalls: 0,
    adoptionCalls: 0,
    finalizeCalls: 0,
    releaseCalls: 0,
    statusMutations: 0,
    finalizedPayloads: [],
  };

  const client = {
    from(table) {
      assert.ok(
        table === "gohighlevel_oauth_credentials" ||
          table === "integration_connections",
      );
      const filters = new Map();
      const builder = {
        select() {
          return builder;
        },
        eq(column, value) {
          filters.set(column, value);
          return builder;
        },
        is(column, value) {
          filters.set(column, value);
          return builder;
        },
        async maybeSingle() {
          if (table === "integration_connections") {
            return {
              data:
                filters.get("id") === state.connection.id
                  ? { ...state.connection }
                  : null,
              error: null,
            };
          }
          const matches =
            filters.get("integration_connection_id") ===
              state.credential.integration_connection_id &&
            filters.get("revoked_at") === null &&
            state.credential.revoked_at === null;
          return {
            data: matches ? cloneCredential(state.credential) : null,
            error: null,
          };
        },
      };
      return builder;
    },
    async rpc(name, args) {
      if (name === "wtos_claim_gohighlevel_token_refresh_v1") {
        state.claimCalls += 1;
        const claim = args.p_claim;
        if (state.credential.revoked_at !== null) {
          return {
            data: { contractVersion: 1, disposition: "unavailable" },
            error: null,
          };
        }
        if (state.credential.refresh_version !== claim.expectedRefreshVersion) {
          return {
            data: {
              contractVersion: 1,
              disposition: "superseded",
              credentialId: state.credential.id,
              refreshVersion: state.credential.refresh_version,
            },
            error: null,
          };
        }
        if (
          state.credential.refresh_lease_id &&
          new Date(state.credential.refresh_lease_expires_at).getTime() > Date.now()
        ) {
          return {
            data: {
              contractVersion: 1,
              disposition: "busy",
              credentialId: state.credential.id,
              refreshVersion: state.credential.refresh_version,
            },
            error: null,
          };
        }
        state.credential.refresh_lease_id = claim.leaseId;
        state.credential.refresh_lease_acquired_at = new Date().toISOString();
        state.credential.refresh_lease_expires_at = new Date(
          Date.now() + claim.leaseSeconds * 1000,
        ).toISOString();
        onClaim?.(state);
        return {
          data: {
            contractVersion: 1,
            disposition: "claimed",
            credentialId: state.credential.id,
            refreshVersion: state.credential.refresh_version,
          },
          error: null,
        };
      }

      if (name === "wtos_adopt_gohighlevel_token_refresh_v1") {
        state.adoptionCalls += 1;
        const adoption = args.p_adoption;
        if (state.credential.revoked_at !== null) {
          return {
            data: { contractVersion: 1, disposition: "unavailable" },
            error: null,
          };
        }
        if (
          state.credential.refresh_version > adoption.minimumRefreshVersion &&
          new Date(state.credential.token_expires_at).getTime() >
            new Date(adoption.minimumTokenExpiresAt).getTime()
        ) {
          return {
            data: {
              contractVersion: 1,
              disposition: "adopted",
              credentialId: state.credential.id,
              refreshVersion: state.credential.refresh_version,
            },
            error: null,
          };
        }
        const disposition =
          state.credential.refresh_lease_id &&
          new Date(state.credential.refresh_lease_expires_at).getTime() > Date.now()
            ? "busy"
            : "reclaimable";
        return {
          data: {
            contractVersion: 1,
            disposition,
            credentialId: state.credential.id,
            refreshVersion: state.credential.refresh_version,
          },
          error: null,
        };
      }

      if (name === "wtos_finalize_gohighlevel_token_refresh_v1") {
        state.finalizeCalls += 1;
        const finalization = args.p_finalization;
        const ownsLease =
          state.credential.id === finalization.credentialId &&
          state.credential.refresh_version ===
            finalization.expectedRefreshVersion &&
          state.credential.refresh_lease_id === finalization.leaseId &&
          new Date(state.credential.refresh_lease_expires_at).getTime() > Date.now() &&
          state.credential.revoked_at === null;
        if (!ownsLease) {
          return {
            data: { contractVersion: 1, disposition: "stale" },
            error: null,
          };
        }
        assert.match(finalization.encryptedAccessToken, /^v1:/);
        assert.match(finalization.encryptedRefreshToken, /^v1:/);
        assert.notEqual(finalization.encryptedAccessToken, "fresh-access-token");
        assert.notEqual(
          finalization.encryptedRefreshToken,
          "fresh-rotating-refresh-token",
        );
        state.finalizedPayloads.push({ ...finalization });
        state.credential.encrypted_access_token =
          finalization.encryptedAccessToken;
        state.credential.encrypted_refresh_token =
          finalization.encryptedRefreshToken;
        state.credential.token_type = finalization.tokenType;
        state.credential.scopes = [...finalization.scopes];
        state.credential.token_expires_at = finalization.tokenExpiresAt;
        state.credential.last_refreshed_at = new Date().toISOString();
        state.credential.refresh_version += 1;
        state.credential.refresh_lease_id = null;
        state.credential.refresh_lease_acquired_at = null;
        state.credential.refresh_lease_expires_at = null;
        if (
          state.connectionStatus === "connected" ||
          state.connectionStatus === "needs_reauth"
        ) {
          state.connectionStatus = "connected";
          state.statusMutations += 1;
        }
        return {
          data: {
            contractVersion: 1,
            disposition: "finalized",
            credentialId: state.credential.id,
            refreshVersion: state.credential.refresh_version,
          },
          error: null,
        };
      }

      if (name === "wtos_release_gohighlevel_token_refresh_v1") {
        state.releaseCalls += 1;
        const release = args.p_release;
        const ownsLease =
          state.credential.id === release.credentialId &&
          state.credential.refresh_version === release.expectedRefreshVersion &&
          state.credential.refresh_lease_id === release.leaseId &&
          state.credential.revoked_at === null;
        if (!ownsLease) {
          return {
            data: {
              contractVersion: 1,
              disposition: "stale",
              connectionMarkedNeedsReauth: false,
            },
            error: null,
          };
        }
        state.credential.refresh_lease_id = null;
        state.credential.refresh_lease_acquired_at = null;
        state.credential.refresh_lease_expires_at = null;
        if (release.markNeedsReauth) {
          state.connectionStatus = "needs_reauth";
          state.statusMutations += 1;
        }
        return {
          data: {
            contractVersion: 1,
            disposition: "released",
            credentialId: state.credential.id,
            refreshVersion: state.credential.refresh_version,
            connectionMarkedNeedsReauth: release.markNeedsReauth,
          },
          error: null,
        };
      }

      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  return { client, state };
}

function makeBinding(overrides = {}) {
  return {
    companyId: "20000000-0000-4000-8000-000000000001",
    externalLocationId: "location-alpha",
    externalCompanyId: "external-agency-one",
    externalUserId: "external-user-one",
    displayName: "HighLevel Alpha",
    scopes: [...foundation.goHighLevelOAuthScopes],
    encryptedAccessToken: oauth.encryptGoHighLevelToken("callback-access-token"),
    encryptedRefreshToken: oauth.encryptGoHighLevelToken(
      "callback-refresh-token",
    ),
    tokenType: "Bearer",
    userType: "Location",
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    settings: {
      authMethod: "marketplace_oauth",
      outboundMessagingEnabled: false,
    },
    ...overrides,
  };
}

function createAtomicBindingService({
  failLocationId = null,
  initialConnections = [],
  initialCredentials = [],
} = {}) {
  let storage = {
    connections: structuredClone(initialConnections),
    credentials: structuredClone(initialCredentials),
  };
  const calls = [];
  let sequence = 1;
  const nextId = () =>
    `40000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;

  const client = {
    async rpc(name, args) {
      assert.equal(name, "wtos_bind_gohighlevel_oauth_v1");
      const binding = args.p_binding;
      calls.push(structuredClone(binding));
      assert.equal(binding.contractVersion, 1);
      assert.match(binding.encryptedAccessToken, /^v1:/);
      assert.match(binding.encryptedRefreshToken, /^v1:/);
      assert.ok(!JSON.stringify(binding).includes("callback-access-token"));
      assert.ok(!JSON.stringify(binding).includes("callback-refresh-token"));

      const staged = structuredClone(storage);
      const existingCredential = staged.credentials.find(
        (item) => item.externalLocationId === binding.externalLocationId,
      );
      if (
        existingCredential &&
        existingCredential.companyId !== binding.companyId
      ) {
        return {
          data: {
            contractVersion: 1,
            disposition: "conflict",
            companyId: binding.companyId,
            locationId: binding.externalLocationId,
          },
          error: null,
        };
      }

      const companyMapping = staged.connections.find(
        (item) => item.companyId === binding.companyId,
      );
      if (
        companyMapping?.externalLocationId &&
        companyMapping.externalLocationId !== binding.externalLocationId
      ) {
        return {
          data: {
            contractVersion: 1,
            disposition: "company_location_conflict",
            companyId: binding.companyId,
            locationId: binding.externalLocationId,
          },
          error: null,
        };
      }

      let connection = existingCredential
        ? staged.connections.find(
            (item) => item.id === existingCredential.connectionId,
          )
        : companyMapping;
      const reconnect = Boolean(connection || existingCredential);
      if (!connection) {
        connection = {
          id: nextId(),
          companyId: binding.companyId,
          externalLocationId: binding.externalLocationId,
          status: "connected",
        };
        staged.connections.push(connection);
      }
      Object.assign(connection, {
        externalLocationId: binding.externalLocationId,
        status: "connected",
      });

      if (binding.externalLocationId === failLocationId) {
        return {
          data: null,
          error: { message: "simulated transactional credential failure" },
        };
      }

      if (existingCredential) {
        Object.assign(existingCredential, {
          companyId: binding.companyId,
          connectionId: connection.id,
          encryptedAccessToken: binding.encryptedAccessToken,
          encryptedRefreshToken: binding.encryptedRefreshToken,
        });
      } else {
        staged.credentials.push({
          id: nextId(),
          companyId: binding.companyId,
          connectionId: connection.id,
          externalLocationId: binding.externalLocationId,
          encryptedAccessToken: binding.encryptedAccessToken,
          encryptedRefreshToken: binding.encryptedRefreshToken,
        });
      }
      storage = staged;
      return {
        data: {
          contractVersion: 1,
          disposition: reconnect ? "reconnected" : "connected",
          connectionId: connection.id,
          companyId: binding.companyId,
          locationId: binding.externalLocationId,
        },
        error: null,
      };
    },
  };

  return {
    client,
    calls,
    snapshot: () => structuredClone(storage),
  };
}

function createSyncLeaseService() {
  const state = {
    now: Date.now(),
    companyId: "80000000-0000-4000-8000-000000000001",
    connectionId: "81000000-0000-4000-8000-000000000001",
    logs: [],
    sequence: 1,
    connectionHealth: {
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      lastFailureAt: null,
      lastError: null,
    },
  };
  const receiptBase = (log) => ({
    contractVersion: 1,
    syncLogId: log.id,
    companyId: log.companyId,
    integrationConnectionId: log.connectionId,
  });
  const hashClaimToken = (value) =>
    createHash("sha256").update(value).digest("hex");

  const client = {
    async rpc(name, args) {
      if (name === "wtos_claim_gohighlevel_sync_v1") {
        const claim = args.p_claim;
        if (
          claim.companyId !== state.companyId ||
          claim.integrationConnectionId !== state.connectionId
        ) {
          return {
            data: {
              contractVersion: 1,
              disposition: "unavailable",
              companyId: claim.companyId,
              integrationConnectionId: claim.integrationConnectionId,
            },
            error: null,
          };
        }
        const active = state.logs.find((log) =>
          ["queued", "running", "retrying"].includes(log.status),
        );
        if (
          active?.status === "running" &&
          active.claimTokenSha256 &&
          active.leaseExpiresAt > state.now
        ) {
          return {
            data: {
              ...receiptBase(active),
              disposition: "busy",
              leaseExpiresAt: new Date(active.leaseExpiresAt).toISOString(),
              staleRunRecovered: false,
            },
            error: null,
          };
        }
        const staleRunRecovered = Boolean(active);
        if (active) {
          active.status = "failed";
          active.claimTokenSha256 = null;
          active.leaseExpiresAt = null;
          active.errorCode = "gohighlevel_sync_lease_expired";
        }
        const log = {
          id: `82000000-0000-4000-8000-${String(state.sequence++).padStart(12, "0")}`,
          companyId: state.companyId,
          connectionId: state.connectionId,
          claimTokenSha256: hashClaimToken(claim.claimToken),
          leaseExpiresAt: state.now + claim.leaseSeconds * 1000,
          lastAttemptedAt: state.now,
          status: "running",
          responseSummary: {},
          errorCode: null,
        };
        state.logs.push(log);
        return {
          data: {
            ...receiptBase(log),
            disposition: "claimed",
            status: "running",
            leaseExpiresAt: new Date(log.leaseExpiresAt).toISOString(),
            staleRunRecovered,
          },
          error: null,
        };
      }

      if (name === "wtos_renew_gohighlevel_sync_v1") {
        const renewal = args.p_renewal;
        if (
          renewal.companyId !== state.companyId ||
          renewal.integrationConnectionId !== state.connectionId
        ) {
          return {
            data: {
              contractVersion: 1,
              disposition: "unavailable",
              syncLogId: renewal.syncLogId,
              companyId: renewal.companyId,
              integrationConnectionId: renewal.integrationConnectionId,
            },
            error: null,
          };
        }
        if (renewal.leaseSeconds < 60 || renewal.leaseSeconds > 300) {
          throw new Error("invalid sync renewal");
        }
        const log = state.logs.find(
          (candidate) => candidate.id === renewal.syncLogId,
        );
        if (!log) {
          return {
            data: {
              contractVersion: 1,
              disposition: "unavailable",
              syncLogId: renewal.syncLogId,
              companyId: renewal.companyId,
              integrationConnectionId: renewal.integrationConnectionId,
            },
            error: null,
          };
        }
        if (
          log.status !== "running" ||
          log.claimTokenSha256 !== hashClaimToken(renewal.claimToken)
        ) {
          return {
            data: { ...receiptBase(log), disposition: "stale", status: log.status },
            error: null,
          };
        }
        if (!log.leaseExpiresAt || log.leaseExpiresAt <= state.now) {
          return {
            data: {
              ...receiptBase(log),
              disposition: "expired",
              status: log.status,
              leaseExpiresAt: log.leaseExpiresAt,
            },
            error: null,
          };
        }
        log.leaseExpiresAt = Math.max(
          log.leaseExpiresAt,
          state.now + renewal.leaseSeconds * 1000,
        );
        log.lastAttemptedAt = state.now;
        return {
          data: {
            ...receiptBase(log),
            disposition: "renewed",
            status: log.status,
            leaseExpiresAt: new Date(log.leaseExpiresAt).toISOString(),
            lastAttemptedAt: new Date(log.lastAttemptedAt).toISOString(),
          },
          error: null,
        };
      }

      if (name === "wtos_complete_gohighlevel_sync_v1") {
        const completion = args.p_completion;
        const log = state.logs.find(
          (candidate) =>
            candidate.id === completion.syncLogId &&
            candidate.companyId === completion.companyId &&
            candidate.connectionId === completion.integrationConnectionId,
        );
        if (!log) {
          return {
            data: {
              contractVersion: 1,
              disposition: "unavailable",
              syncLogId: completion.syncLogId,
              companyId: completion.companyId,
              integrationConnectionId: completion.integrationConnectionId,
            },
            error: null,
          };
        }
        if (
          log.claimTokenSha256 !== hashClaimToken(completion.claimToken)
        ) {
          return {
            data: {
              ...receiptBase(log),
              disposition: "stale",
              status: log.status,
              idempotent: false,
            },
            error: null,
          };
        }
        if (log.status !== "running") {
          return {
            data: {
              ...receiptBase(log),
              disposition: "completed",
              status: log.status,
              idempotent: true,
            },
            error: null,
          };
        }
        if (!log.leaseExpiresAt || log.leaseExpiresAt <= state.now) {
          log.status = "failed";
          log.claimTokenSha256 = null;
          log.leaseExpiresAt = null;
          log.errorCode = "gohighlevel_sync_lease_expired";
          state.connectionHealth.lastSyncAt = state.now;
          state.connectionHealth.lastFailureAt = state.now;
          state.connectionHealth.lastError =
            "HighLevel synchronization lease expired before completion.";
          return {
            data: {
              ...receiptBase(log),
              disposition: "stale",
              status: "failed",
              idempotent: false,
            },
            error: null,
          };
        }
        log.status = completion.outcome;
        log.leaseExpiresAt = null;
        log.responseSummary = structuredClone(completion.responseSummary);
        log.errorCode = completion.errorCode ?? null;
        state.connectionHealth.lastSyncAt = state.now;
        if (completion.outcome === "succeeded") {
          state.connectionHealth.lastSuccessfulSyncAt = state.now;
          state.connectionHealth.lastError = null;
        } else {
          state.connectionHealth.lastFailureAt = state.now;
          state.connectionHealth.lastError =
            completion.errorCode === "gohighlevel_partial_sync"
              ? "One or more HighLevel resources failed to synchronize."
              : "HighLevel synchronization failed.";
        }
        return {
          data: {
            ...receiptBase(log),
            disposition: "completed",
            status: log.status,
            completedAt: new Date(state.now).toISOString(),
            idempotent: false,
          },
          error: null,
        };
      }

      throw new Error(`Unexpected sync RPC ${name}`);
    },
  };

  return { client, state };
}

function createWebhookTransitionModel({ connectionExists = true } = {}) {
  let state = {
    now: Date.now(),
    event: {
      id: "84000000-0000-4000-8000-000000000001",
      companyId: "85000000-0000-4000-8000-000000000001",
      connectionId: "86000000-0000-4000-8000-000000000001",
      payloadSha256: "c".repeat(64),
      claimToken: "87000000-0000-4000-8000-000000000001",
      leaseExpiresAt: Date.now() + 30_000,
      status: "received",
      signatureVersion: "ed25519",
      errorMessage: null,
    },
    connection: connectionExists
      ? {
          id: "86000000-0000-4000-8000-000000000001",
          companyId: "85000000-0000-4000-8000-000000000001",
          provider: "gohighlevel",
          lastSyncAt: null,
          lastSuccessfulSyncAt: null,
          lastFailureAt: null,
          lastError: "prior safe failure",
          settings: {},
        }
      : null,
  };

  return {
    snapshot: () => structuredClone(state),
    reclaim(claimToken) {
      state.event.claimToken = claimToken;
      state.event.leaseExpiresAt = state.now + 30_000;
    },
    transition({ claimToken, targetStatus, errorMessage = null }) {
      const staged = structuredClone(state);
      if (
        staged.event.claimToken !== claimToken ||
        staged.event.status !== "received" ||
        staged.event.leaseExpiresAt <= staged.now
      ) {
        throw new Error("Webhook transition is stale.");
      }
      staged.event.status = targetStatus;
      staged.event.leaseExpiresAt = null;
      staged.event.errorMessage =
        targetStatus === "failed"
          ? "HighLevel webhook processing failed safely."
          : null;
      if (!staged.connection) {
        throw new Error("Webhook connection scope mismatch.");
      }
      staged.connection.lastSyncAt = staged.now;
      staged.connection.settings = {
        ...staged.connection.settings,
        webhooksVerified: true,
        lastVerifiedWebhookAt: staged.now,
        lastWebhookSignatureVersion: staged.event.signatureVersion,
      };
      if (targetStatus === "processed") {
        staged.connection.lastSuccessfulSyncAt = staged.now;
        staged.connection.lastError = null;
      } else if (targetStatus === "failed") {
        staged.connection.lastFailureAt = staged.now;
        staged.connection.lastError =
          "HighLevel webhook processing failed safely.";
        staged.connection.settings.lastWebhookFailureAt = staged.now;
      }
      state = staged;
      return {
        contractVersion: 1,
        eventId: state.event.id,
        processingStatus: state.event.status,
        idempotent: false,
        suppliedErrorWasIgnored: errorMessage !== state.event.errorMessage,
      };
    },
  };
}

function createSnapshotBatchModel() {
  let state = {
    companyId: "88000000-0000-4000-8000-000000000001",
    connectionId: "89000000-0000-4000-8000-000000000001",
    now: Date.now(),
    snapshots: new Map(),
  };
  const keyFor = (record) => `${record.resourceType}:${record.externalId}`;

  return {
    snapshot() {
      return {
        ...state,
        snapshots: new Map(
          [...state.snapshots.entries()].map(([key, value]) => [
            key,
            structuredClone(value),
          ]),
        ),
      };
    },
    advance(milliseconds) {
      state.now += milliseconds;
    },
    apply(records) {
      assert.ok(records.length > 0 && records.length <= 200);
      const staged = this.snapshot();
      let savedCount = 0;
      let skippedCount = 0;
      for (const record of records) {
        if (
          record.companyId !== staged.companyId ||
          record.integrationConnectionId !== staged.connectionId
        ) {
          throw new Error("Resource snapshot record scope mismatch.");
        }
        const key = keyFor(record);
        const existing = staged.snapshots.get(key);
        const incomingVersion = record.providerUpdatedAt
          ? new Date(record.providerUpdatedAt).getTime()
          : null;
        const existingVersion = existing?.providerUpdatedAt
          ? new Date(existing.providerUpdatedAt).getTime()
          : null;
        if (
          existing &&
          existingVersion !== null &&
          (incomingVersion === null || incomingVersion < existingVersion)
        ) {
          existing.lastSyncedAt = Math.max(existing.lastSyncedAt, staged.now);
          skippedCount += 1;
          continue;
        }
        const authoritative =
          record.payloadSummary.associationAuthoritative === true;
        const providerRecord = structuredClone(record);
        if (
          existing &&
          ["message", "call"].includes(record.resourceType) &&
          existingVersion !== null &&
          incomingVersion === existingVersion
        ) {
          for (const field of [
            "externalParentId",
            "externalContactId",
            "direction",
            "status",
            "bodyPreview",
            "occurredAt",
          ]) {
            providerRecord[field] = existing[field] ?? providerRecord[field] ?? null;
          }
          providerRecord.payloadSummary = {
            ...Object.fromEntries(
              Object.entries(providerRecord.payloadSummary).filter(
                ([, value]) => value !== null,
              ),
            ),
            ...existing.payloadSummary,
          };
        }
        const next = {
          ...providerRecord,
          customerId:
            existing && !authoritative
              ? existing.customerId
              : record.customerId,
          leadId:
            existing && !authoritative ? existing.leadId : record.leadId,
          lastSyncedAt: Math.max(existing?.lastSyncedAt ?? 0, staged.now),
        };
        staged.snapshots.set(key, next);
        savedCount += 1;
      }
      state = staged;
      return {
        contractVersion: 1,
        companyId: state.companyId,
        integrationConnectionId: state.connectionId,
        receivedCount: records.length,
        savedCount,
        skippedCount,
        syncedAt: new Date(state.now).toISOString(),
      };
    },
  };
}

function createCommunicationIdentityModel() {
  const state = {
    companyId: "91000000-0000-4000-8000-000000000001",
    connectionId: "92000000-0000-4000-8000-000000000001",
    identities: new Map(),
    aliases: new Map(),
    conflicts: new Map(),
    nextIdentity: 1,
    nextConflict: 1,
  };
  const allowedAliases = new Set([
    "messageId",
    "emailMessageId",
    "id",
    "altId",
  ]);
  const priority = { messageId: 1, emailMessageId: 2, id: 3, altId: 4 };
  const scopeKey = (channel, value) =>
    `${state.companyId}:${state.connectionId}:${channel}:${value}`;
  const fingerprint = (value) =>
    createHash("sha256").update(value).digest("hex");
  const snapshot = () => structuredClone({
    ...state,
    identities: [...state.identities.entries()],
    aliases: [...state.aliases.entries()],
    conflicts: [...state.conflicts.entries()],
  });
  const sortedEvidence = (aliases) =>
    [...new Map(
      aliases.map(({ type, value }) => [JSON.stringify({ type, value }), { type, value }]),
    ).values()]
      .sort((left, right) =>
        left.value.localeCompare(right.value) || left.type.localeCompare(right.type),
      )
      .slice(0, 6);
  const upsertConflict = ({
    channel,
    kind,
    tupleFingerprint,
    evidence,
    candidates,
  }) => {
    const aliasFingerprint = evidence.length
      ? fingerprint(JSON.stringify(evidence))
      : null;
    const conflictKey = fingerprint(
      tupleFingerprint
        ? `tuple:${tupleFingerprint}`
        : `aliases:${aliasFingerprint}`,
    );
    const key = scopeKey(channel, `conflict:${conflictKey}`);
    const existing = state.conflicts.get(key);
    const combinedEvidence = sortedEvidence([
      ...(existing?.aliasEvidence ?? []),
      ...evidence,
    ]);
    const record = {
      id: existing?.id ?? `conflict-${state.nextConflict++}`,
      channel,
      kind,
      tupleFingerprint,
      aliasFingerprint,
      aliasEvidence: combinedEvidence,
      candidateIdentityIds: [
        ...new Set([...(existing?.candidateIdentityIds ?? []), ...candidates]),
      ].sort().slice(0, 12),
      status: "open",
      occurrenceCount: (existing?.occurrenceCount ?? 0) + 1,
      resolvedAt: null,
    };
    state.conflicts.set(key, record);
    return record;
  };
  const markCandidates = (candidateIds, reason) => {
    for (const id of candidateIds) {
      const identity = state.identities.get(id);
      if (!identity) continue;
      identity.reconciliationStatus = "needs_reconciliation";
      identity.conflictCount += 1;
      identity.conflictReason = reason;
    }
  };

  return {
    state,
    snapshot,
    resolve({
      companyId = state.companyId,
      connectionId = state.connectionId,
      channel,
      aliases,
      tupleFingerprint = null,
    }) {
      if (companyId !== state.companyId || connectionId !== state.connectionId) {
        throw new Error("identity scope mismatch");
      }
      if (!["sms", "voice", "email"].includes(channel) || aliases.length > 6) {
        throw new Error("invalid identity resolution");
      }
      for (const alias of aliases) {
        if (
          !allowedAliases.has(alias.type) ||
          typeof alias.value !== "string" ||
          !alias.value.trim()
        ) {
          throw new Error("invalid communication alias");
        }
      }
      const evidence = sortedEvidence(
        aliases.map(({ type, value }) => ({ type, value: value.trim() })),
      );

      if (evidence.length === 0) {
        if (!tupleFingerprint) {
          return { disposition: "incomplete", conflictId: null };
        }
        const tupleCandidates = [...state.identities.values()]
          .filter(
            (identity) =>
              identity.channel === channel &&
              identity.tupleFingerprint === tupleFingerprint,
          )
          .map((identity) => identity.id);
        const conflictKind = tupleCandidates.length
          ? "tuple_fingerprint_collision"
          : "incomplete_identity";
        const conflict = upsertConflict({
          channel,
          kind: conflictKind,
          tupleFingerprint,
          evidence,
          candidates: tupleCandidates,
        });
        markCandidates(tupleCandidates, "tuple_fingerprint_collision");
        return {
          disposition: tupleCandidates.length ? "conflict" : "incomplete",
          conflictId: conflict.id,
          conflictCount: conflict.occurrenceCount,
        };
      }

      const matchedIds = [
        ...new Set(
          evidence
            .map(({ value }) => state.aliases.get(scopeKey(channel, value)))
            .filter(Boolean),
        ),
      ];
      const tupleIds = tupleFingerprint
        ? [...state.identities.values()]
            .filter(
              (identity) =>
                identity.channel === channel &&
                identity.tupleFingerprint === tupleFingerprint,
            )
            .map((identity) => identity.id)
        : [];
      const tupleConflict = tupleFingerprint
        ? [...state.conflicts.values()].find(
            (conflict) =>
              conflict.channel === channel &&
              conflict.status === "open" &&
              conflict.tupleFingerprint === tupleFingerprint,
          )
        : null;
      let resolvedConflictId = null;
      if (tupleConflict) {
        const candidates = [
          ...new Set([
            ...tupleConflict.candidateIdentityIds,
            ...matchedIds,
            ...tupleIds,
          ]),
        ];
        if (
          tupleConflict.kind === "incomplete_identity" &&
          candidates.length === 0
        ) {
          tupleConflict.aliasEvidence = evidence;
          tupleConflict.aliasFingerprint = fingerprint(JSON.stringify(evidence));
          tupleConflict.status = "resolved";
          tupleConflict.occurrenceCount += 1;
          tupleConflict.resolvedAt = "now";
          resolvedConflictId = tupleConflict.id;
        } else {
          const conflict = upsertConflict({
            channel,
            kind: tupleConflict.kind,
            tupleFingerprint,
            evidence,
            candidates,
          });
          markCandidates(candidates, "tuple_fingerprint_collision");
          return {
            disposition: "conflict",
            conflictId: conflict.id,
            conflictCount: conflict.occurrenceCount,
          };
        }
      }

      const candidateIds = [...new Set([...matchedIds, ...tupleIds])];
      const tupleDisagrees =
        matchedIds.length === 1 && tupleIds.some((id) => id !== matchedIds[0]);
      if (
        matchedIds.length > 1 ||
        (matchedIds.length === 0 && tupleIds.length > 0) ||
        tupleDisagrees
      ) {
        const reason =
          matchedIds.length > 1
            ? "provider_alias_collision"
            : "tuple_fingerprint_collision";
        const conflict = upsertConflict({
          channel,
          kind: reason,
          tupleFingerprint,
          evidence,
          candidates: candidateIds,
        });
        markCandidates(candidateIds, reason);
        return {
          disposition: "conflict",
          conflictId: conflict.id,
          conflictCount: conflict.occurrenceCount,
        };
      }

      let identity = matchedIds.length === 1
        ? state.identities.get(matchedIds[0])
        : null;
      if (identity?.reconciliationStatus === "needs_reconciliation") {
        const conflict = upsertConflict({
          channel,
          kind: identity.conflictReason ?? "provider_alias_collision",
          tupleFingerprint,
          evidence,
          candidates: [identity.id],
        });
        markCandidates([identity.id], conflict.kind);
        return {
          disposition: "conflict",
          conflictId: conflict.id,
          conflictCount: conflict.occurrenceCount,
        };
      }

      let disposition = "resolved";
      if (!identity) {
        const canonical = [...evidence].sort(
          (left, right) => priority[left.type] - priority[right.type],
        )[0].value;
        identity = {
          id: `identity-${state.nextIdentity++}`,
          channel,
          canonicalExternalId: canonical,
          tupleFingerprint,
          reconciliationStatus: "resolved",
          conflictCount: 0,
          conflictReason: null,
        };
        state.identities.set(identity.id, identity);
        disposition = "created";
      }
      for (const alias of evidence) {
        const key = scopeKey(channel, alias.value);
        const existing = state.aliases.get(key);
        if (existing && existing !== identity.id) {
          throw new Error("alias collision escaped serialization");
        }
        state.aliases.set(key, identity.id);
      }
      if (tupleFingerprint) identity.tupleFingerprint = tupleFingerprint;
      return {
        disposition,
        canonicalExternalId: identity.canonicalExternalId,
        conflictId: null,
        resolvedConflictId,
      };
    },
  };
}

function createCommunicationPersistenceModel() {
  const statusRank = {
    incoming: 0,
    queued: 10,
    pending: 10,
    scheduled: 10,
    ringing: 10,
    in_progress: 20,
    sent: 20,
    answered: 30,
    connected: 30,
    received: 30,
    delivered: 40,
    read: 50,
    opened: 50,
    clicked: 50,
    opt_out: 50,
    completed: 50,
    voicemail: 50,
    missed: 40,
    busy: 50,
    failed: 50,
    undelivered: 50,
    canceled: 50,
    cancelled: 50,
  };
  const state = {
    event: null,
    call: null,
    automationEvents: [],
    identityStatus: "resolved",
  };
  const associationFrom = (input) => ({
    customerId: input.customerId ?? null,
    leadId: input.leadId ?? null,
    jobId: input.jobId ?? null,
  });
  const associationsMatch = (left, right) =>
    left.customerId === right.customerId &&
    left.leadId === right.leadId &&
    left.jobId === right.jobId;
  const hashObservation = (input, kind) => {
    const providerSummary = { ...input.payloadSummary };
    delete providerSummary.associationAuthoritative;
    delete providerSummary.matchStatus;
    delete providerSummary.matchCandidateCount;
    return createHash("sha256")
      .update(JSON.stringify({
        kind,
        channel: input.channel,
        direction: input.direction,
        status: input.status,
        occurredAt: input.occurredAt,
        payloadSummary: providerSummary,
      }))
      .digest("hex");
  };
  const canAdvance = (existing, incoming) => {
    if (!existing) return true;
    if (incoming.version > existing.version) return true;
    if (incoming.version < existing.version) return false;
    if (existing.versionSource === "legacy_backfill") return true;
    if (
      existing.versionSource === "created_at_fallback" &&
      incoming.versionSource === "updated_at"
    ) {
      return true;
    }
    return (
      existing.versionSource === "created_at_fallback" &&
      incoming.versionSource === "created_at_fallback" &&
      existing.rank !== null &&
      incoming.rank > existing.rank
    );
  };

  return {
    state,
    seedEvent(input) {
      state.event = {
        version: new Date(input.providerUpdatedAt).getTime(),
        versionSource: input.providerVersionSource,
        rank: statusRank[input.status] ?? null,
        hash: hashObservation(input, "event"),
        status: input.status,
        ...associationFrom(input),
      };
    },
    persist(input) {
      if (state.identityStatus !== "resolved") {
        throw new Error("communication identity must be resolved first");
      }
      const associationAuthoritative =
        input.payloadSummary.associationAuthoritative === true;
      let targetAssociation = associationFrom(input);
      if (
        state.event &&
        state.call &&
        state.event.jobId !== null &&
        state.call.jobId !== null &&
        state.event.jobId !== state.call.jobId
      ) {
        throw new Error("communication job association state conflicts");
      }
      if (targetAssociation.jobId === null) {
        targetAssociation = {
          ...targetAssociation,
          jobId: state.event?.jobId ?? state.call?.jobId ?? null,
        };
      }
      if (!associationAuthoritative) {
        if (
          state.event &&
          state.call &&
          !associationsMatch(state.event, state.call)
        ) {
          throw new Error("communication association state conflicts");
        }
        const existingAssociation = state.event ?? state.call;
        if (existingAssociation) {
          targetAssociation = associationFrom(existingAssociation);
        }
      }
      const incoming = {
        version: new Date(input.providerUpdatedAt).getTime(),
        versionSource: input.providerVersionSource,
        rank: statusRank[input.status] ?? null,
        hash: hashObservation(input, "event"),
        status: input.status,
        ...targetAssociation,
      };
      const incomingCall = {
        ...incoming,
        hash: hashObservation(input, "call"),
      };
      if (
        incoming.versionSource === "created_at_fallback" &&
        incoming.rank === null
      ) {
        throw new Error("fallback status is not monotonic");
      }
      const siblingsComplete =
        Boolean(state.event) && (input.channel !== "voice" || Boolean(state.call));
      const greatestVersion = Math.max(
        state.event?.version ?? Number.NEGATIVE_INFINITY,
        state.call?.version ?? Number.NEGATIVE_INFINITY,
      );
      if (greatestVersion > incoming.version) {
        return {
          disposition: siblingsComplete ? "stale" : "conflict",
          providerRecordsChanged: false,
        };
      }
      const eventAdvance = canAdvance(state.event, incoming);
      const callAdvance = input.channel === "voice" && canAdvance(state.call, incomingCall);
      if (
        state.event &&
        state.event.version === incoming.version &&
        state.event.hash !== incoming.hash &&
        !eventAdvance
      ) {
        return { disposition: "conflict", providerRecordsChanged: false };
      }
      if (
        input.channel === "voice" &&
        state.call &&
        state.call.version === incoming.version &&
        state.call.hash !== incomingCall.hash &&
        !callAdvance
      ) {
        return { disposition: "conflict", providerRecordsChanged: false };
      }
      let providerChanged = false;
      let associationChanged = false;
      if (!state.event || eventAdvance) {
        state.event = incoming;
        providerChanged = true;
      } else if (
        associationAuthoritative &&
        !associationsMatch(state.event, targetAssociation)
      ) {
        Object.assign(state.event, targetAssociation);
        associationChanged = true;
      }
      if (input.channel === "voice" && (!state.call || callAdvance)) {
        const inserting = !state.call;
        state.call = incomingCall;
        providerChanged = true;
        if (inserting && ["missed", "voicemail"].includes(input.status)) {
          state.automationEvents.push("missed_call.received");
        }
      } else if (
        input.channel === "voice" &&
        associationAuthoritative &&
        !associationsMatch(state.call, targetAssociation)
      ) {
        Object.assign(state.call, targetAssociation);
        associationChanged = true;
      }
      return {
        disposition: providerChanged
          ? "saved"
          : associationChanged
            ? "association_updated"
            : "same_version",
        providerRecordsChanged: providerChanged,
        associationChanged,
      };
    },
  };
}

test("documented location-token responses inherit only the requested strict scope", async () => {
  const documentedResponse = {
    access_token: "location-access-token",
    refresh_token: "location-refresh-token",
    token_type: "Bearer",
    expires_in: 3600,
    scope: foundation.goHighLevelOAuthScopes.join(" "),
    locationId: "location-alpha",
    userId: "installer-one",
  };
  const requests = [];
  const result = await oauth.exchangeGoHighLevelLocationToken({
    accessToken: "agency-access-token",
    companyId: "agency-alpha",
    locationId: "location-alpha",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(200, documentedResponse);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.userType, "Location");
  assert.equal(result.payload.companyId, "agency-alpha");
  assert.equal(result.payload.locationId, "location-alpha");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.Version, "v3");
  assert.equal(
    requests[0].init.body,
    "companyId=agency-alpha&locationId=location-alpha",
  );

  for (const conflictingPayload of [
    { ...documentedResponse, locationId: "location-other" },
    { ...documentedResponse, companyId: "agency-other" },
    { ...documentedResponse, userType: "Company" },
  ]) {
    const conflict = await oauth.exchangeGoHighLevelLocationToken({
      accessToken: "agency-access-token",
      companyId: "agency-alpha",
      locationId: "location-alpha",
      fetchImpl: async () => jsonResponse(200, conflictingPayload),
    });
    assert.equal(conflict.ok, false);
  }
});

test("communication identities stay channel-scoped and quarantine ambiguous tuple evidence", () => {
  const scoped = createCommunicationIdentityModel();
  const sms = scoped.resolve({
    channel: "sms",
    aliases: [{ type: "messageId", value: "shared-provider-id" }],
  });
  const voice = scoped.resolve({
    channel: "voice",
    aliases: [{ type: "messageId", value: "shared-provider-id" }],
  });
  const email = scoped.resolve({
    channel: "email",
    aliases: [{ type: "emailMessageId", value: "email-provider-id" }],
  });
  assert.equal(sms.disposition, "created");
  assert.equal(voice.disposition, "created");
  assert.equal(email.disposition, "created");
  assert.equal(scoped.state.identities.size, 3);
  assert.throws(
    () =>
      scoped.resolve({
        channel: "sms",
        aliases: [
          { type: "conversationProviderId", value: "shared-configuration" },
        ],
      }),
    /invalid communication alias/,
  );

  const collision = createCommunicationIdentityModel();
  const tupleFingerprint = "a".repeat(64);
  const first = collision.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [{ type: "messageId", value: "message-one" }],
  });
  const second = collision.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [{ type: "id", value: "message-two" }],
  });
  assert.equal(first.disposition, "created");
  assert.equal(second.disposition, "conflict");
  assert.ok(second.conflictId);
  assert.equal(collision.state.identities.size, 1);
  const conflict = [...collision.state.conflicts.values()][0];
  assert.equal(conflict.status, "open");
  assert.deepEqual(conflict.aliasEvidence, [
    { type: "id", value: "message-two" },
  ]);
  assert.deepEqual(conflict.candidateIdentityIds, ["identity-1"]);
  assert.equal("body" in conflict, false);
  assert.equal("content" in conflict, false);

  const repeat = collision.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [{ type: "altId", value: "message-three" }],
  });
  assert.equal(repeat.disposition, "conflict");
  assert.equal(repeat.conflictId, second.conflictId);
  const repeatedConflict = [...collision.state.conflicts.values()][0];
  assert.equal(repeatedConflict.occurrenceCount, 2);
  assert.ok(repeatedConflict.aliasEvidence.length <= 6);
});

test("a strong REST identifier closes only a collision-free incomplete quarantine", () => {
  const model = createCommunicationIdentityModel();
  const tupleFingerprint = "b".repeat(64);
  const incomplete = model.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [],
  });
  assert.equal(incomplete.disposition, "incomplete");
  assert.ok(incomplete.conflictId);
  assert.equal(model.state.identities.size, 0);

  const resolved = model.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [{ type: "messageId", value: "rest-message-id" }],
  });
  assert.equal(resolved.disposition, "created");
  assert.equal(resolved.resolvedConflictId, incomplete.conflictId);
  assert.equal(model.state.identities.size, 1);
  const evidence = [...model.state.conflicts.values()][0];
  assert.equal(evidence.status, "resolved");
  assert.deepEqual(evidence.aliasEvidence, [
    { type: "messageId", value: "rest-message-id" },
  ]);

  const unresolved = createCommunicationIdentityModel();
  unresolved.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [],
  });
  unresolved.state.conflicts.values().next().value.candidateIdentityIds = [
    "identity-external",
  ];
  const quarantined = unresolved.resolve({
    channel: "sms",
    tupleFingerprint,
    aliases: [{ type: "messageId", value: "rest-message-id" }],
  });
  assert.equal(quarantined.disposition, "conflict");
  assert.equal(unresolved.state.identities.size, 0);
});

test("atomic communication persistence repairs siblings and blocks stale or conflicting state", () => {
  const base = {
    channel: "voice",
    direction: "inbound",
    status: "completed",
    occurredAt: "2026-09-04T12:00:00.000Z",
    providerUpdatedAt: "2026-09-04T12:00:00.000Z",
    providerVersionSource: "updated_at",
    payloadSummary: { associationAuthoritative: true },
  };
  const staleModel = createCommunicationPersistenceModel();
  assert.equal(staleModel.persist(base).disposition, "saved");
  const stale = staleModel.persist({
    ...base,
    status: "missed",
    providerUpdatedAt: "2026-09-04T11:59:00.000Z",
  });
  assert.equal(stale.disposition, "stale");
  assert.equal(staleModel.state.call.status, "completed");
  assert.deepEqual(staleModel.state.automationEvents, []);

  const equalVersion = createCommunicationPersistenceModel();
  equalVersion.persist({ ...base, channel: "sms", status: "delivered" });
  const conflict = equalVersion.persist({
    ...base,
    channel: "sms",
    status: "failed",
  });
  assert.equal(conflict.disposition, "conflict");
  assert.equal(equalVersion.state.event.status, "delivered");

  const crashRecovery = createCommunicationPersistenceModel();
  const missed = { ...base, status: "missed" };
  crashRecovery.seedEvent(missed);
  const repaired = crashRecovery.persist(missed);
  assert.equal(repaired.disposition, "saved");
  assert.equal(crashRecovery.state.call.status, "missed");
  assert.deepEqual(crashRecovery.state.automationEvents, [
    "missed_call.received",
  ]);

  const fallback = createCommunicationPersistenceModel();
  const fallbackBase = {
    ...base,
    channel: "sms",
    status: "queued",
    providerVersionSource: "created_at_fallback",
  };
  fallback.persist(fallbackBase);
  assert.equal(
    fallback.persist({ ...fallbackBase, status: "connected" }).disposition,
    "saved",
  );
  assert.equal(
    fallback.persist({ ...fallbackBase, status: "opened" }).disposition,
    "saved",
  );
  assert.equal(
    fallback.persist({ ...fallbackBase, status: "clicked" }).disposition,
    "conflict",
  );
  assert.equal(fallback.state.event.status, "opened");
  const optOut = createCommunicationPersistenceModel();
  optOut.persist(fallbackBase);
  assert.equal(
    optOut.persist({ ...fallbackBase, status: "opt_out" }).disposition,
    "saved",
  );

  const legacy = createCommunicationPersistenceModel();
  legacy.seedEvent({
    ...base,
    channel: "sms",
    status: "received",
    providerVersionSource: "legacy_backfill",
    payloadSummary: { legacyShape: true },
  });
  assert.equal(
    legacy.persist({
      ...base,
      channel: "sms",
      status: "received",
      payloadSummary: { normalizedShape: true },
    }).disposition,
    "saved",
  );
  assert.equal(
    legacy.persist({
      ...base,
      channel: "sms",
      status: "failed",
      payloadSummary: { conflictingShape: true },
    }).disposition,
    "conflict",
  );

  const quarantined = createCommunicationPersistenceModel();
  quarantined.state.identityStatus = "needs_reconciliation";
  assert.throws(() => quarantined.persist(base), /must be resolved first/);
  assert.equal(quarantined.state.event, null);
  assert.equal(quarantined.state.call, null);
  assert.deepEqual(quarantined.state.automationEvents, []);
});

test("authoritative customer repair preserves locked event and call job associations", () => {
  const jobId = "93000000-0000-4000-8000-000000000001";
  const customerId = "94000000-0000-4000-8000-000000000001";
  const base = {
    channel: "voice",
    direction: "inbound",
    status: "completed",
    occurredAt: "2026-09-04T12:00:00.000Z",
    providerUpdatedAt: "2026-09-04T12:00:00.000Z",
    providerVersionSource: "updated_at",
  };
  const model = createCommunicationPersistenceModel();
  model.persist({
    ...base,
    customerId: null,
    leadId: null,
    jobId,
    payloadSummary: { associationAuthoritative: false },
  });

  const repaired = model.persist({
    ...base,
    customerId,
    leadId: null,
    jobId: null,
    payloadSummary: { associationAuthoritative: true },
  });
  assert.equal(repaired.disposition, "association_updated");
  for (const record of [model.state.event, model.state.call]) {
    assert.equal(record.customerId, customerId);
    assert.equal(record.leadId, null);
    assert.equal(record.jobId, jobId);
  }

  const conflicting = createCommunicationPersistenceModel();
  conflicting.persist({
    ...base,
    customerId: null,
    leadId: null,
    jobId,
    payloadSummary: { associationAuthoritative: false },
  });
  conflicting.state.call.jobId =
    "93000000-0000-4000-8000-000000000099";
  const beforeConflict = structuredClone(conflicting.state);
  assert.throws(
    () =>
      conflicting.persist({
        ...base,
        customerId,
        leadId: null,
        jobId: null,
        payloadSummary: { associationAuthoritative: true },
      }),
    /job association state conflicts/,
  );
  assert.deepEqual(conflicting.state, beforeConflict);
});

test("atomic callback binding rolls back, reconnects idempotently, and rejects cross-company location reuse", async () => {
  const bindingService = createAtomicBindingService();
  const initial = await oauth.bindGoHighLevelOAuthConnection({
    serviceClient: bindingService.client,
    binding: makeBinding(),
  });
  assert.equal(initial.ok, true);
  assert.equal(initial.disposition, "connected");
  assert.equal(bindingService.snapshot().connections.length, 1);
  assert.equal(bindingService.snapshot().credentials.length, 1);

  const reconnect = await oauth.bindGoHighLevelOAuthConnection({
    serviceClient: bindingService.client,
    binding: makeBinding({
      encryptedAccessToken: oauth.encryptGoHighLevelToken(
        "callback-access-token-two",
      ),
      encryptedRefreshToken: oauth.encryptGoHighLevelToken(
        "callback-refresh-token-two",
      ),
    }),
  });
  assert.equal(reconnect.ok, true);
  assert.equal(reconnect.disposition, "reconnected");
  assert.equal(reconnect.connectionId, initial.connectionId);
  assert.equal(bindingService.snapshot().connections.length, 1);
  assert.equal(bindingService.snapshot().credentials.length, 1);

  const beforeCompanyRebind = bindingService.snapshot();
  const companyRebind = await oauth.bindGoHighLevelOAuthConnection({
    serviceClient: bindingService.client,
    binding: makeBinding({ externalLocationId: "location-beta" }),
  });
  assert.deepEqual(companyRebind, {
    ok: false,
    reason: "company_location_conflict",
    error:
      "This WeatherTech OS company is already mapped to another HighLevel location.",
  });
  assert.deepEqual(bindingService.snapshot(), beforeCompanyRebind);

  const placeholderConnectionId =
    "40000000-0000-4000-8000-000000000099";
  const placeholderService = createAtomicBindingService({
    initialConnections: [
      {
        id: placeholderConnectionId,
        companyId: makeBinding().companyId,
        externalLocationId: null,
        status: "paused",
      },
    ],
  });
  const adoptedPlaceholder = await oauth.bindGoHighLevelOAuthConnection({
    serviceClient: placeholderService.client,
    binding: makeBinding(),
  });
  assert.equal(adoptedPlaceholder.ok, true);
  assert.equal(adoptedPlaceholder.connectionId, placeholderConnectionId);
  assert.equal(placeholderService.snapshot().connections.length, 1);
  assert.equal(placeholderService.snapshot().credentials.length, 1);
  assert.equal(
    placeholderService.snapshot().connections[0].externalLocationId,
    "location-alpha",
  );
  assert.equal(placeholderService.snapshot().connections[0].status, "connected");

  const beforeConflict = bindingService.snapshot();
  const conflict = await oauth.bindGoHighLevelOAuthConnection({
    serviceClient: bindingService.client,
    binding: makeBinding({
      companyId: "20000000-0000-4000-8000-000000000002",
    }),
  });
  assert.deepEqual(conflict, {
    ok: false,
    reason: "location_company_conflict",
    error:
      "This HighLevel location is already mapped to another WeatherTech OS company.",
  });
  assert.deepEqual(bindingService.snapshot(), beforeConflict);
  assert.ok(!JSON.stringify(conflict).includes("callback-access-token"));
  assert.ok(!JSON.stringify(conflict).includes("callback-refresh-token"));

  const rollbackService = createAtomicBindingService({
    failLocationId: "location-rollback",
  });
  const beforeFailure = rollbackService.snapshot();
  const failed = await oauth.bindGoHighLevelOAuthConnection({
    serviceClient: rollbackService.client,
    binding: makeBinding({ externalLocationId: "location-rollback" }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "binding_failed");
  assert.deepEqual(rollbackService.snapshot(), beforeFailure);
  assert.ok(!JSON.stringify(failed).includes("simulated transactional"));
  assert.ok(!JSON.stringify(failed).includes("callback-access-token"));
});

test("parallel refresh callers make exactly one provider request and adopt one encrypted result", async () => {
  const refreshService = createRefreshService();
  let releaseProvider;
  let providerCalls = 0;
  const providerGate = new Promise((resolve) => {
    releaseProvider = resolve;
  });
  const fetchImpl = async (_url, options) => {
    providerCalls += 1;
    assert.equal(options.headers.Version, "v3");
    assert.ok(options.signal instanceof AbortSignal);
    await providerGate;
    return jsonResponse(200, refreshedTokenPayload());
  };
  let gateReleased = false;
  const waitImpl = async () => {
    if (!gateReleased) {
      gateReleased = true;
      releaseProvider();
    }
    await new Promise((resolve) => setImmediate(resolve));
  };

  const [owner, follower] = await Promise.all([
    oauth.getGoHighLevelAccessToken({
      serviceClient: refreshService.client,
      integrationConnectionId:
        refreshService.state.credential.integration_connection_id,
      fetchImpl,
      waitImpl,
      randomUUID: () => "50000000-0000-4000-8000-000000000001",
    }),
    oauth.getGoHighLevelAccessToken({
      serviceClient: refreshService.client,
      integrationConnectionId:
        refreshService.state.credential.integration_connection_id,
      fetchImpl,
      waitImpl,
      randomUUID: () => "50000000-0000-4000-8000-000000000002",
    }),
  ]);

  assert.equal(owner.ok, true);
  assert.equal(follower.ok, true);
  assert.equal(owner.accessToken, "fresh-access-token");
  assert.equal(follower.accessToken, "fresh-access-token");
  assert.equal(providerCalls, 1);
  assert.equal(refreshService.state.finalizeCalls, 1);
  assert.equal(refreshService.state.credential.refresh_version, 1);
  assert.equal(refreshService.state.credential.refresh_lease_id, null);
  assert.equal(refreshService.state.connectionStatus, "connected");
  assert.equal(refreshService.state.releaseCalls, 0);
  assert.equal(refreshService.state.finalizedPayloads.length, 1);
});

test("exact credential scope mismatches block token return and provider refresh", async () => {
  const mismatchedAtRead = createRefreshService();
  mismatchedAtRead.state.connection.company_id =
    "20000000-0000-4000-8000-000000000099";
  let providerCalls = 0;
  const rejectedRead = await oauth.getGoHighLevelAccessToken({
    serviceClient: mismatchedAtRead.client,
    integrationConnectionId:
      mismatchedAtRead.state.credential.integration_connection_id,
    fetchImpl: async () => {
      providerCalls += 1;
      return jsonResponse(200, refreshedTokenPayload());
    },
  });
  assert.equal(rejectedRead.ok, false);
  assert.match(rejectedRead.error, /credential is unavailable/);
  assert.equal(mismatchedAtRead.state.claimCalls, 0);
  assert.equal(providerCalls, 0);

  const changedAfterClaim = createRefreshService({
    onClaim(state) {
      state.connection.external_account_id = "location-rebound";
    },
  });
  const rejectedRefresh = await oauth.getGoHighLevelAccessToken({
    serviceClient: changedAfterClaim.client,
    integrationConnectionId:
      changedAfterClaim.state.credential.integration_connection_id,
    fetchImpl: async () => {
      providerCalls += 1;
      return jsonResponse(200, refreshedTokenPayload());
    },
    randomUUID: () => "55000000-0000-4000-8000-000000000001",
  });
  assert.equal(rejectedRefresh.ok, false);
  assert.match(rejectedRefresh.error, /binding changed before refresh/);
  assert.equal(providerCalls, 0);
  assert.equal(changedAfterClaim.state.releaseCalls, 1);
  assert.equal(changedAfterClaim.state.statusMutations, 0);
  assert.equal(changedAfterClaim.state.connectionStatus, "connected");
  assert.equal(
    oauth.isGoHighLevelCredentialBoundToConnection({
      credential: changedAfterClaim.state.credential,
      connection: changedAfterClaim.state.connection,
    }),
    false,
  );
  assert.ok(!JSON.stringify(rejectedRefresh).includes("active-refresh-token"));
});

test("an expired lease is reclaimed, but a valid lease stays busy without status clobber", async () => {
  const expiredLeaseService = createRefreshService({
    credential: makeCredential({
      refresh_lease_id: "60000000-0000-4000-8000-000000000001",
      refresh_lease_acquired_at: new Date(Date.now() - 120_000).toISOString(),
      refresh_lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
    }),
  });
  let providerCalls = 0;
  const reclaimed = await oauth.getGoHighLevelAccessToken({
    serviceClient: expiredLeaseService.client,
    integrationConnectionId:
      expiredLeaseService.state.credential.integration_connection_id,
    fetchImpl: async () => {
      providerCalls += 1;
      return jsonResponse(200, refreshedTokenPayload());
    },
    randomUUID: () => "60000000-0000-4000-8000-000000000002",
  });
  assert.equal(reclaimed.ok, true);
  assert.equal(providerCalls, 1);
  assert.equal(expiredLeaseService.state.credential.refresh_version, 1);
  assert.equal(expiredLeaseService.state.credential.refresh_lease_id, null);

  const validLeaseService = createRefreshService({
    credential: makeCredential({
      refresh_lease_id: "60000000-0000-4000-8000-000000000003",
      refresh_lease_acquired_at: new Date().toISOString(),
      refresh_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
    }),
  });
  let blockedProviderCalls = 0;
  const busy = await oauth.getGoHighLevelAccessToken({
    serviceClient: validLeaseService.client,
    integrationConnectionId:
      validLeaseService.state.credential.integration_connection_id,
    fetchImpl: async () => {
      blockedProviderCalls += 1;
      return jsonResponse(200, refreshedTokenPayload());
    },
    waitImpl: async () => {},
    randomUUID: () => "60000000-0000-4000-8000-000000000004",
  });
  assert.equal(busy.ok, false);
  assert.match(busy.error, /already in progress/);
  assert.equal(blockedProviderCalls, 0);
  assert.equal(validLeaseService.state.releaseCalls, 0);
  assert.equal(validLeaseService.state.statusMutations, 0);
  assert.equal(validLeaseService.state.connectionStatus, "connected");
  assert.equal(
    validLeaseService.state.credential.refresh_lease_id,
    "60000000-0000-4000-8000-000000000003",
  );
});

test("stale refresh finalizers and releases cannot overwrite the winning token or status", async () => {
  const service = createRefreshService({
    credential: makeCredential({
      refresh_version: 4,
      refresh_lease_id: "70000000-0000-4000-8000-000000000001",
      refresh_lease_acquired_at: new Date().toISOString(),
      refresh_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
    }),
  });
  const before = cloneCredential(service.state.credential);
  const staleFinalize = await service.client.rpc(
    "wtos_finalize_gohighlevel_token_refresh_v1",
    {
      p_finalization: {
        contractVersion: 1,
        credentialId: before.id,
        leaseId: "70000000-0000-4000-8000-000000000099",
        expectedRefreshVersion: 3,
        encryptedAccessToken: oauth.encryptGoHighLevelToken("losing-access"),
        encryptedRefreshToken: oauth.encryptGoHighLevelToken("losing-refresh"),
        tokenType: "Bearer",
        scopes: [...foundation.goHighLevelOAuthScopes],
        tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    },
  );
  assert.equal(staleFinalize.data.disposition, "stale");
  assert.deepEqual(service.state.credential, before);

  const staleRelease = await service.client.rpc(
    "wtos_release_gohighlevel_token_refresh_v1",
    {
      p_release: {
        contractVersion: 1,
        credentialId: before.id,
        leaseId: "70000000-0000-4000-8000-000000000099",
        expectedRefreshVersion: 3,
        markNeedsReauth: true,
      },
    },
  );
  assert.equal(staleRelease.data.disposition, "stale");
  assert.equal(staleRelease.data.connectionMarkedNeedsReauth, false);
  assert.deepEqual(service.state.credential, before);
  assert.equal(service.state.connectionStatus, "connected");
  assert.equal(service.state.statusMutations, 0);
});

test("sync lease renewal is exact, bounded, and never resurrects expired work", async () => {
  const service = createSyncLeaseService();
  const claimToken = "82500000-0000-4000-8000-000000000001";
  const claim = await service.client.rpc("wtos_claim_gohighlevel_sync_v1", {
    p_claim: {
      contractVersion: 1,
      companyId: service.state.companyId,
      integrationConnectionId: service.state.connectionId,
      claimToken,
      leaseSeconds: 60,
      requestFingerprint: "c".repeat(64),
    },
  });
  const log = service.state.logs[0];
  const originalExpiry = log.leaseExpiresAt;
  service.state.now += 30_000;
  const renewed = await service.client.rpc("wtos_renew_gohighlevel_sync_v1", {
    p_renewal: {
      contractVersion: 1,
      syncLogId: claim.data.syncLogId,
      companyId: service.state.companyId,
      integrationConnectionId: service.state.connectionId,
      claimToken,
      leaseSeconds: 120,
    },
  });
  assert.equal(renewed.data.disposition, "renewed");
  assert.ok(log.leaseExpiresAt > originalExpiry);
  assert.equal(log.lastAttemptedAt, service.state.now);
  assert.ok(!JSON.stringify(renewed.data).includes(claimToken));

  const beforeStale = structuredClone(log);
  const stale = await service.client.rpc("wtos_renew_gohighlevel_sync_v1", {
    p_renewal: {
      contractVersion: 1,
      syncLogId: claim.data.syncLogId,
      companyId: service.state.companyId,
      integrationConnectionId: service.state.connectionId,
      claimToken: "82500000-0000-4000-8000-000000000099",
      leaseSeconds: 120,
    },
  });
  assert.equal(stale.data.disposition, "stale");
  assert.deepEqual(log, beforeStale);

  service.state.now = log.leaseExpiresAt + 1;
  const expired = await service.client.rpc("wtos_renew_gohighlevel_sync_v1", {
    p_renewal: {
      contractVersion: 1,
      syncLogId: claim.data.syncLogId,
      companyId: service.state.companyId,
      integrationConnectionId: service.state.connectionId,
      claimToken,
      leaseSeconds: 120,
    },
  });
  assert.equal(expired.data.disposition, "expired");
  assert.equal(log.status, "running");
  assert.equal(log.leaseExpiresAt, beforeStale.leaseExpiresAt);
});

test("sync claims serialize one exact run, recover stale work, and reject stale completion", async () => {
  const service = createSyncLeaseService();
  const claim = (claimToken) =>
    service.client.rpc("wtos_claim_gohighlevel_sync_v1", {
      p_claim: {
        contractVersion: 1,
        companyId: service.state.companyId,
        integrationConnectionId: service.state.connectionId,
        claimToken,
        leaseSeconds: 300,
        requestFingerprint: "a".repeat(64),
      },
    });
  const firstToken = "83000000-0000-4000-8000-000000000001";
  const secondToken = "83000000-0000-4000-8000-000000000002";
  const [firstClaim, competingClaim] = await Promise.all([
    claim(firstToken),
    claim(secondToken),
  ]);
  assert.equal(firstClaim.data.disposition, "claimed");
  assert.equal(competingClaim.data.disposition, "busy");
  assert.ok(!JSON.stringify(firstClaim.data).includes(firstToken));
  assert.ok(!JSON.stringify(competingClaim.data).includes(firstToken));
  assert.equal(service.state.logs.filter((log) => log.status === "running").length, 1);

  const crossCompany = await service.client.rpc(
    "wtos_claim_gohighlevel_sync_v1",
    {
      p_claim: {
        contractVersion: 1,
        companyId: "80000000-0000-4000-8000-000000000099",
        integrationConnectionId: service.state.connectionId,
        claimToken: "83000000-0000-4000-8000-000000000099",
        leaseSeconds: 300,
        requestFingerprint: "b".repeat(64),
      },
    },
  );
  assert.equal(crossCompany.data.disposition, "unavailable");
  assert.equal(service.state.logs.length, 1);

  const staleCompletion = await service.client.rpc(
    "wtos_complete_gohighlevel_sync_v1",
    {
      p_completion: {
        contractVersion: 1,
        syncLogId: firstClaim.data.syncLogId,
        companyId: service.state.companyId,
        integrationConnectionId: service.state.connectionId,
        claimToken: "83000000-0000-4000-8000-000000000099",
        outcome: "failed",
        errorCode: "gohighlevel_sync_failed",
        responseSummary: { providerRecordsChanged: false },
      },
    },
  );
  assert.equal(staleCompletion.data.disposition, "stale");
  assert.equal(service.state.logs[0].status, "running");

  const completed = await service.client.rpc(
    "wtos_complete_gohighlevel_sync_v1",
    {
      p_completion: {
        contractVersion: 1,
        syncLogId: firstClaim.data.syncLogId,
        companyId: service.state.companyId,
        integrationConnectionId: service.state.connectionId,
        claimToken: firstToken,
        outcome: "succeeded",
        errorCode: null,
        responseSummary: {
          totalFetched: 4,
          totalSaved: 4,
          providerRequests: 3,
          providerRecordsChanged: false,
        },
      },
    },
  );
  assert.equal(completed.data.disposition, "completed");
  assert.equal(completed.data.status, "succeeded");
  assert.equal(service.state.connectionHealth.lastSyncAt, service.state.now);
  assert.equal(
    service.state.connectionHealth.lastSuccessfulSyncAt,
    service.state.now,
  );
  assert.equal(service.state.connectionHealth.lastError, null);
  const idempotent = await service.client.rpc(
    "wtos_complete_gohighlevel_sync_v1",
    {
      p_completion: {
        contractVersion: 1,
        syncLogId: firstClaim.data.syncLogId,
        companyId: service.state.companyId,
        integrationConnectionId: service.state.connectionId,
        claimToken: firstToken,
        outcome: "succeeded",
        errorCode: null,
        responseSummary: {},
      },
    },
  );
  assert.equal(idempotent.data.idempotent, true);

  const expiringToken = "83000000-0000-4000-8000-000000000003";
  const expiringClaim = await claim(expiringToken);
  assert.equal(expiringClaim.data.disposition, "claimed");
  service.state.now += 301_000;
  const replacementToken = "83000000-0000-4000-8000-000000000004";
  const replacement = await claim(replacementToken);
  assert.equal(replacement.data.disposition, "claimed");
  assert.equal(replacement.data.staleRunRecovered, true);
  const expiredLog = service.state.logs.find(
    (log) => log.id === expiringClaim.data.syncLogId,
  );
  assert.equal(expiredLog.status, "failed");
  assert.equal(expiredLog.claimTokenSha256, null);
  assert.equal(
    service.state.logs.filter((log) => ["queued", "running", "retrying"].includes(log.status)).length,
    1,
  );

  const lateCompletion = await service.client.rpc(
    "wtos_complete_gohighlevel_sync_v1",
    {
      p_completion: {
        contractVersion: 1,
        syncLogId: expiringClaim.data.syncLogId,
        companyId: service.state.companyId,
        integrationConnectionId: service.state.connectionId,
        claimToken: expiringToken,
        outcome: "succeeded",
        errorCode: null,
        responseSummary: {},
      },
    },
  );
  assert.equal(lateCompletion.data.disposition, "stale");
  assert.equal(expiredLog.status, "failed");
  assert.equal(
    service.state.logs.find((log) => log.id === replacement.data.syncLogId).status,
    "running",
  );

  const replacementFailure = await service.client.rpc(
    "wtos_complete_gohighlevel_sync_v1",
    {
      p_completion: {
        contractVersion: 1,
        syncLogId: replacement.data.syncLogId,
        companyId: service.state.companyId,
        integrationConnectionId: service.state.connectionId,
        claimToken: replacementToken,
        outcome: "failed",
        errorCode: "gohighlevel_partial_sync",
        responseSummary: {
          totalFailed: 1,
          providerRequests: 3,
          providerRecordsChanged: false,
        },
      },
    },
  );
  assert.equal(replacementFailure.data.status, "failed");
  assert.equal(service.state.connectionHealth.lastFailureAt, service.state.now);
  assert.equal(
    service.state.connectionHealth.lastError,
    "One or more HighLevel resources failed to synchronize.",
  );
});

test("webhook terminal CAS owns connection health and stale workers cannot clobber success", () => {
  const rollbackModel = createWebhookTransitionModel({
    connectionExists: false,
  });
  const beforeRollback = rollbackModel.snapshot();
  assert.throws(
    () =>
      rollbackModel.transition({
        claimToken: beforeRollback.event.claimToken,
        targetStatus: "processed",
      }),
    /connection scope mismatch/,
  );
  assert.deepEqual(rollbackModel.snapshot(), beforeRollback);

  const raceModel = createWebhookTransitionModel();
  const oldClaim = raceModel.snapshot().event.claimToken;
  const winningClaim = "87000000-0000-4000-8000-000000000002";
  raceModel.reclaim(winningClaim);
  const winner = raceModel.transition({
    claimToken: winningClaim,
    targetStatus: "processed",
  });
  assert.equal(winner.processingStatus, "processed");
  const afterWinner = raceModel.snapshot();
  assert.equal(
    afterWinner.connection.lastSuccessfulSyncAt,
    afterWinner.connection.lastSyncAt,
  );
  assert.equal(afterWinner.connection.lastError, null);
  assert.throws(
    () =>
      raceModel.transition({
        claimToken: oldClaim,
        targetStatus: "failed",
        errorMessage: "raw customer or token material",
      }),
    /stale/,
  );
  assert.deepEqual(raceModel.snapshot(), afterWinner);

  const failedModel = createWebhookTransitionModel();
  const failedState = failedModel.snapshot();
  const failure = failedModel.transition({
    claimToken: failedState.event.claimToken,
    targetStatus: "failed",
    errorMessage: "raw customer or token material",
  });
  assert.equal(failure.suppliedErrorWasIgnored, true);
  const safeFailure = failedModel.snapshot();
  assert.equal(
    safeFailure.connection.lastError,
    "HighLevel webhook processing failed safely.",
  );
  assert.ok(!JSON.stringify(safeFailure).includes("raw customer"));
});

test("snapshot batches reject stale provider versions and preserve or clear association pairs authoritatively", () => {
  const model = createSnapshotBatchModel();
  const scope = model.snapshot();
  const baseRecord = {
    companyId: scope.companyId,
    integrationConnectionId: scope.connectionId,
    resourceType: "contact",
    externalId: "contact-one",
    externalParentId: null,
    externalContactId: "contact-one",
    customerId: "90000000-0000-4000-8000-000000000001",
    leadId: null,
    direction: null,
    status: "active",
    bodyPreview: "webhook-newest",
    occurredAt: "2026-09-04T12:00:00.000Z",
    providerUpdatedAt: "2026-09-04T12:00:00.000Z",
    payloadSummary: { associationAuthoritative: true },
  };
  const inserted = model.apply([baseRecord]);
  assert.deepEqual(
    { saved: inserted.savedCount, skipped: inserted.skippedCount },
    { saved: 1, skipped: 0 },
  );

  model.advance(1_000);
  const stale = model.apply([
    {
      ...baseRecord,
      customerId: null,
      bodyPreview: "stale-poll-content",
      providerUpdatedAt: "2026-09-04T11:59:00.000Z",
      payloadSummary: { associationAuthoritative: false },
    },
  ]);
  assert.deepEqual(
    { saved: stale.savedCount, skipped: stale.skippedCount },
    { saved: 0, skipped: 1 },
  );
  let stored = model.snapshot().snapshots.get("contact:contact-one");
  assert.equal(stored.bodyPreview, "webhook-newest");
  assert.equal(
    stored.providerUpdatedAt,
    "2026-09-04T12:00:00.000Z",
  );
  assert.equal(
    stored.customerId,
    "90000000-0000-4000-8000-000000000001",
  );
  const staleObservationAt = stored.lastSyncedAt;

  model.advance(1_000);
  model.apply([
    {
      ...baseRecord,
      customerId: null,
      bodyPreview: "newer-partial-content",
      providerUpdatedAt: "2026-09-04T12:01:00.000Z",
      payloadSummary: { associationAuthoritative: false },
    },
  ]);
  stored = model.snapshot().snapshots.get("contact:contact-one");
  assert.equal(stored.bodyPreview, "newer-partial-content");
  assert.equal(
    stored.customerId,
    "90000000-0000-4000-8000-000000000001",
  );
  assert.ok(stored.lastSyncedAt > staleObservationAt);

  model.advance(1_000);
  model.apply([
    {
      ...baseRecord,
      customerId: null,
      leadId: null,
      bodyPreview: "explicit-conflict",
      providerUpdatedAt: "2026-09-04T12:02:00.000Z",
      payloadSummary: {
        associationAuthoritative: true,
        matchStatus: "ambiguous",
      },
    },
  ]);
  stored = model.snapshot().snapshots.get("contact:contact-one");
  assert.equal(stored.customerId, null);
  assert.equal(stored.leadId, null);

  const messageRecord = {
    ...baseRecord,
    resourceType: "message",
    externalId: "message-one",
    externalParentId: "conversation-one",
    externalContactId: "contact-one",
    direction: "inbound",
    status: "delivered",
    bodyPreview: "snapshot-only-preview",
    providerUpdatedAt: "2026-09-04T12:04:00.000Z",
    payloadSummary: {
      associationAuthoritative: false,
      snapshotOnly: "preserved",
      overwritten: "old",
    },
  };
  model.apply([messageRecord]);
  model.apply([
    {
      ...messageRecord,
      externalParentId: null,
      externalContactId: null,
      direction: null,
      status: null,
      bodyPreview: null,
      occurredAt: null,
      payloadSummary: {
        associationAuthoritative: false,
        overwritten: "new",
        absentValue: null,
      },
    },
  ]);
  const repairedMessage = model.snapshot().snapshots.get("message:message-one");
  assert.equal(repairedMessage.externalParentId, "conversation-one");
  assert.equal(repairedMessage.externalContactId, "contact-one");
  assert.equal(repairedMessage.bodyPreview, "snapshot-only-preview");
  assert.equal(repairedMessage.payloadSummary.snapshotOnly, "preserved");
  assert.equal(repairedMessage.payloadSummary.overwritten, "old");
  assert.equal("absentValue" in repairedMessage.payloadSummary, false);

  const beforeCrossScope = model.snapshot();
  assert.throws(
    () =>
      model.apply([
        {
          ...baseRecord,
          externalId: "contact-two",
          providerUpdatedAt: "2026-09-04T12:03:00.000Z",
        },
        {
          ...baseRecord,
          companyId: "88000000-0000-4000-8000-000000000099",
          externalId: "contact-three",
          providerUpdatedAt: "2026-09-04T12:03:00.000Z",
        },
      ]),
    /scope mismatch/,
  );
  assert.deepEqual(
    [...model.snapshot().snapshots.entries()],
    [...beforeCrossScope.snapshots.entries()],
  );
});

test("SQL and callback contracts keep atomic writes, service-only leases, agency revocation, and provider-ID isolation", () => {
  const migration = readFileSync(
    join(
      cwd,
      "supabase/migrations/20260904140401_gohighlevel_bridge_observability_hardening.sql",
    ),
    "utf8",
  );
  const callback = readFileSync(
    join(cwd, "app/api/oauth/marketplace/callback/route.ts"),
    "utf8",
  );
  const oauthSource = readFileSync(
    join(cwd, "lib/gohighlevel/oauth.ts"),
    "utf8",
  );
  const types = readFileSync(join(cwd, "lib/crm/types.ts"), "utf8");
  const functionBody = (name) => {
    const start = migration.indexOf(`create or replace function public.${name}`);
    assert.notEqual(start, -1, `${name} must exist`);
    const end = migration.indexOf("$$;", start);
    assert.notEqual(end, -1, `${name} must have a complete body`);
    return migration.slice(start, end + 3);
  };

  const serviceFunctions = [
    "wtos_claim_gohighlevel_sync_v1",
    "wtos_renew_gohighlevel_sync_v1",
    "wtos_complete_gohighlevel_sync_v1",
    "wtos_bind_gohighlevel_oauth_v1",
    "wtos_claim_gohighlevel_token_refresh_v1",
    "wtos_adopt_gohighlevel_token_refresh_v1",
    "wtos_finalize_gohighlevel_token_refresh_v1",
    "wtos_release_gohighlevel_token_refresh_v1",
    "wtos_transition_gohighlevel_webhook_v1",
    "wtos_upsert_gohighlevel_resource_snapshots_v1",
    "wtos_resolve_gohighlevel_communication_identity_v1",
    "wtos_upsert_gohighlevel_communication_v1",
    "wtos_finalize_gohighlevel_uninstall_v1",
  ];
  for (const name of serviceFunctions) {
    const body = functionBody(name);
    assert.match(body, /security definer\s+set search_path = ''/);
    assert.match(body, /if not public\.wtos_is_service_role_request\(\)/);
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`),
    );
  }
  for (const table of [
    "gohighlevel_resource_snapshots",
    "gohighlevel_webhook_events",
    "communication_provider_events",
    "call_records",
    "gohighlevel_sync_mappings",
    "gohighlevel_discovery_snapshots",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from authenticated;[\\s\\S]*?grant select on table public\\.${table} to authenticated;`,
      ),
    );
  }
  assert.match(
    migration,
    /revoke delete, truncate, references, trigger\s+on table public\.integration_sync_logs from authenticated/,
  );
  assert.match(
    migration,
    /Provider evidence retains an authenticated mutation privilege/,
  );
  assert.match(
    migration,
    /Integration sync logs retain an unsafe authenticated privilege/,
  );

  const legacyReconciliationPosition = migration.indexOf(
    "with ranked_active_gohighlevel_syncs as",
  );
  const activeIndexPosition = migration.indexOf(
    "create unique index if not exists integration_sync_logs_gohighlevel_active_uidx",
  );
  assert.ok(legacyReconciliationPosition >= 0);
  assert.ok(activeIndexPosition > legacyReconciliationPosition);
  assert.match(
    migration,
    /ranked_active_gohighlevel_syncs[\s\S]*?partition by sync_log\.company_id, sync_log\.integration_connection_id[\s\S]*?sync_log\.status in \('queued', 'running', 'retrying'\)[\s\S]*?ranked\.active_rank > 1/,
  );
  assert.match(
    migration,
    /integration_sync_logs_gohighlevel_active_uidx[\s\S]*?company_id,[\s\S]*?integration_connection_id,[\s\S]*?provider,[\s\S]*?event_type[\s\S]*?status in \('queued', 'running', 'retrying'\)/,
  );

  const syncClaimBody = functionBody("wtos_claim_gohighlevel_sync_v1");
  assert.match(syncClaimBody, /pg_advisory_xact_lock/);
  assert.match(
    syncClaimBody,
    /connection\.id = target_connection_id[\s\S]*?connection\.company_id = target_company_id[\s\S]*?connection\.provider = 'gohighlevel'/,
  );
  assert.match(
    syncClaimBody,
    /status in \('queued', 'running', 'retrying'\)[\s\S]*?status = 'failed'[\s\S]*?insert into public\.integration_sync_logs/,
  );
  assert.match(syncClaimBody, /'disposition', 'busy'/);
  assert.match(syncClaimBody, /'staleRunRecovered', stale_run_recovered/);

  const syncRenewalBody = functionBody("wtos_renew_gohighlevel_sync_v1");
  assert.match(
    syncRenewalBody,
    /sync_log\.id = target_sync_log_id[\s\S]*?sync_log\.company_id = target_company_id[\s\S]*?sync_log\.integration_connection_id = target_connection_id[\s\S]*?sync_log\.provider = 'gohighlevel'[\s\S]*?sync_log\.event_type = 'gohighlevel\.sync'/,
  );
  assert.match(
    syncRenewalBody,
    /target_lease_seconds < 60[\s\S]*?target_lease_seconds > 300/,
  );
  assert.match(
    syncRenewalBody,
    /existing_run\.status <> 'running'[\s\S]*?existing_run\.claim_token_sha256[\s\S]*?is distinct from target_claim_token_sha256/,
  );
  assert.match(
    syncRenewalBody,
    /lease_expires_at <= renewal_at[\s\S]*?'disposition', 'expired'/,
  );
  assert.match(
    syncRenewalBody,
    /lease_expires_at = greatest\([\s\S]*?last_attempted_at = renewal_at[\s\S]*?status = 'running'[\s\S]*?claim_token_sha256 = target_claim_token_sha256[\s\S]*?lease_expires_at > renewal_at/,
  );
  assert.doesNotMatch(syncRenewalBody, /set\s+status\s*=/);

  const syncCompletionBody = functionBody(
    "wtos_complete_gohighlevel_sync_v1",
  );
  assert.match(
    syncCompletionBody,
    /sync_log\.id = target_sync_log_id[\s\S]*?sync_log\.company_id = target_company_id[\s\S]*?sync_log\.integration_connection_id = target_connection_id/,
  );
  assert.match(
    syncCompletionBody,
    /existing_run\.claim_token_sha256 is distinct from target_claim_token_sha256/,
  );
  assert.match(
    syncCompletionBody,
    /status = 'running'[\s\S]*?claim_token_sha256 = target_claim_token_sha256[\s\S]*?lease_expires_at > completion_at/,
  );
  assert.match(
    syncCompletionBody,
    /update public\.integration_connections[\s\S]*?last_sync_at = completion_at[\s\S]*?last_successful_sync_at = case[\s\S]*?last_failure_at = case[\s\S]*?last_error = case/,
  );
  assert.match(
    syncCompletionBody,
    /where id = target_connection_id[\s\S]*?company_id = target_company_id[\s\S]*?provider = 'gohighlevel'[\s\S]*?Sync completion connection scope mismatch/,
  );
  assert.match(syncCompletionBody, /'idempotent', true/);

  assert.match(
    migration,
    /drop policy if exists "WTOS users insert integration sync logs"/,
  );
  assert.match(
    migration,
    /drop policy if exists "WTOS users update integration sync logs"/,
  );
  assert.match(
    migration,
    /create policy "WTOS users insert integration sync logs"[\s\S]*?wtos_can_manage_sales\(company_id\)[\s\S]*?wtos_can_manage_settings\(company_id\)[\s\S]*?provider = 'gohighlevel'[\s\S]*?event_type = 'gohighlevel.sync'/,
  );
  assert.match(
    migration,
    /create policy "WTOS users update integration sync logs"[\s\S]*?using \([\s\S]*?wtos_can_manage_sales\(company_id\)[\s\S]*?wtos_can_manage_settings\(company_id\)[\s\S]*?gohighlevel.sync[\s\S]*?with check \([\s\S]*?wtos_can_manage_sales\(company_id\)[\s\S]*?wtos_can_manage_settings\(company_id\)[\s\S]*?gohighlevel.sync/,
  );
  assert.match(migration, /from pg_catalog\.pg_policies as policy/);
  assert.match(
    migration,
    /Unexpected integration sync-log mutation policy remains active/,
  );

  const missedCallBody = functionBody("wtos_emit_missed_call_event_v1");
  assert.match(
    missedCallBody,
    /if new\.provider = 'gohighlevel'[\s\S]*?new\.call_status not in \('missed', 'voicemail'\)/,
  );
  assert.match(
    missedCallBody,
    /elsif new\.provider = 'twilio'[\s\S]*?new\.call_status <> 'missed'/,
  );
  assert.match(missedCallBody, /'missed_call\.received'/);

  const webhookTransitionBody = functionBody(
    "wtos_transition_gohighlevel_webhook_v1",
  );
  assert.match(
    webhookTransitionBody,
    /existing_event\.lease_expires_at <= transition_at/,
  );
  assert.match(
    webhookTransitionBody,
    /processing_status = 'received'[\s\S]*?claim_token = p_claim_token[\s\S]*?payload_sha256 = normalized_payload_sha256[\s\S]*?lease_expires_at > transition_at/,
  );
  assert.match(
    webhookTransitionBody,
    /update public\.integration_connections[\s\S]*?last_sync_at = transition_at[\s\S]*?last_successful_sync_at = case[\s\S]*?last_failure_at = case[\s\S]*?last_error = case/,
  );
  assert.match(
    webhookTransitionBody,
    /where id = existing_event\.integration_connection_id[\s\S]*?company_id = existing_event\.company_id[\s\S]*?provider = 'gohighlevel'[\s\S]*?Webhook connection scope mismatch/,
  );
  assert.match(
    webhookTransitionBody,
    /then 'HighLevel webhook processing failed safely\.'/,
  );
  assert.doesNotMatch(
    webhookTransitionBody,
    /left\(pg_catalog\.coalesce|left\(coalesce/,
  );

  const snapshotBatchBody = functionBody(
    "wtos_upsert_gohighlevel_resource_snapshots_v1",
  );
  assert.match(snapshotBatchBody, /maximum_batch_records constant integer := 200/);
  assert.match(snapshotBatchBody, /maximum_batch_bytes constant integer := 1048576/);
  assert.match(snapshotBatchBody, /pg_advisory_xact_lock/);
  assert.match(
    snapshotBatchBody,
    /connection\.id = target_connection_id[\s\S]*?connection\.company_id = target_company_id[\s\S]*?connection\.provider = 'gohighlevel'/,
  );
  assert.match(
    snapshotBatchBody,
    /record_value ->> 'companyId' is distinct from target_company_id::text[\s\S]*?record_value ->> 'integrationConnectionId'[\s\S]*?is distinct from target_connection_id::text/,
  );
  assert.match(
    snapshotBatchBody,
    /target_provider_updated_at is null[\s\S]*?target_provider_updated_at < existing_snapshot\.provider_updated_at[\s\S]*?skipped_count := skipped_count \+ 1/,
  );
  assert.match(
    snapshotBatchBody,
    /set last_synced_at = greatest\(last_synced_at, batch_synced_at\)/,
  );
  assert.match(
    snapshotBatchBody,
    /if not association_authoritative then[\s\S]*?target_customer_id := existing_snapshot\.customer_id[\s\S]*?target_lead_id := existing_snapshot\.lead_id/,
  );
  assert.match(snapshotBatchBody, /'savedCount', saved_count/);
  assert.match(snapshotBatchBody, /'skippedCount', skipped_count/);
  assert.match(
    snapshotBatchBody,
    /target_resource_type in \('message', 'call'\)[\s\S]*?target_provider_updated_at = existing_snapshot\.provider_updated_at[\s\S]*?target_external_parent_id := coalesce\([\s\S]*?existing_snapshot\.external_parent_id[\s\S]*?target_external_contact_id := coalesce\([\s\S]*?existing_snapshot\.external_contact_id[\s\S]*?target_body_preview := coalesce\([\s\S]*?existing_snapshot\.body_preview[\s\S]*?jsonb_strip_nulls\([\s\S]*?target_payload_summary[\s\S]*?\|\| coalesce\([\s\S]*?existing_snapshot\.payload_summary/,
  );
  assert.doesNotMatch(snapshotBatchBody, /'accessToken'|'refreshToken'/);

  const identityResolverBody = functionBody(
    "wtos_resolve_gohighlevel_communication_identity_v1",
  );
  assert.match(identityResolverBody, /maximum_alias_count constant integer := 6/);
  assert.match(
    identityResolverBody,
    /target_channel not in \('sms', 'voice', 'email'\)/,
  );
  assert.match(
    identityResolverBody,
    /'messageId',[\s\S]*?'emailMessageId',[\s\S]*?'id',[\s\S]*?'altId'/,
  );
  assert.doesNotMatch(identityResolverBody, /conversationProviderId|webhookId/);
  const tupleLockPosition = identityResolverBody.indexOf(
    "wtos:gohighlevel:communication-tuple:",
  );
  const aliasLockPosition = identityResolverBody.indexOf(
    "wtos:gohighlevel:communication-alias:",
  );
  assert.ok(tupleLockPosition >= 0 && aliasLockPosition > tupleLockPosition);
  assert.match(
    identityResolverBody,
    /gohighlevel_communication_identity_conflicts[\s\S]*?alias_evidence[\s\S]*?candidate_identity_ids[\s\S]*?occurrence_count[\s\S]*?'conflictId'/,
  );
  assert.match(
    identityResolverBody,
    /conflict_kind = 'incomplete_identity'[\s\S]*?matched_identity_count = 0[\s\S]*?tuple_identity_count = 0[\s\S]*?status = 'resolved'[\s\S]*?resolved_conflict_id := target_conflict\.id/,
  );
  assert.match(
    migration,
    /gohighlevel_communication_identity_conflicts[\s\S]*?alias_evidence jsonb[\s\S]*?jsonb_array_length\(alias_evidence\) <= 6[\s\S]*?candidate_identity_ids uuid\[\][\s\S]*?cardinality\(candidate_identity_ids\) <= 12[\s\S]*?status in \('open', 'resolved'\)/,
  );
  const identitySeedPosition = migration.indexOf(
    "with legacy_identity_candidates as",
  );
  const identityResolverPosition = migration.indexOf(
    "create or replace function public.wtos_resolve_gohighlevel_communication_identity_v1",
  );
  assert.ok(identitySeedPosition >= 0 && identitySeedPosition < identityResolverPosition);
  assert.match(
    migration,
    /legacy_identity_candidates[\s\S]*?communication_provider_events[\s\S]*?union[\s\S]*?call_records[\s\S]*?insert into public\.gohighlevel_communication_identities/,
  );
  assert.match(
    migration,
    /legacy_identity_candidates[\s\S]*?insert into public\.gohighlevel_communication_identity_aliases[\s\S]*?'id',[\s\S]*?candidate\.external_id/,
  );

  const communicationBody = functionBody(
    "wtos_upsert_gohighlevel_communication_v1",
  );
  assert.match(
    communicationBody,
    /reconciliation_status = 'resolved'[\s\S]*?conflict_record\.status = 'open'/,
  );
  assert.match(
    communicationBody,
    /existing_event\.provider_version_source = 'legacy_backfill'[\s\S]*?existing_call\.provider_version_source = 'legacy_backfill'/,
  );
  assert.match(
    communicationBody,
    /when 'connected' then 30[\s\S]*?when 'received' then 30[\s\S]*?when 'opened' then 50[\s\S]*?when 'clicked' then 50[\s\S]*?when 'opt_out' then 50/,
  );
  assert.match(
    communicationBody,
    /greatest_existing_version > target_provider_updated_at[\s\S]*?target_channel = 'voice'[\s\S]*?not event_exists or not call_exists[\s\S]*?'disposition', 'conflict'/,
  );
  assert.match(
    communicationBody,
    /event_exists and event_can_advance[\s\S]*?elsif event_exists[\s\S]*?else[\s\S]*?insert into public\.communication_provider_events/,
  );
  assert.match(
    communicationBody,
    /call_exists and call_can_advance[\s\S]*?elsif call_exists[\s\S]*?else[\s\S]*?insert into public\.call_records/,
  );
  const callAssociationLockPosition = communicationBody.indexOf(
    "call_exists := found;",
  );
  const jobConflictPosition = communicationBody.indexOf(
    "existing_event.job_id is distinct from existing_call.job_id",
  );
  const jobPreservationPosition = communicationBody.indexOf(
    "if target_job_id is null then",
  );
  const staleVersionPosition = communicationBody.indexOf(
    "greatest_existing_version > target_provider_updated_at",
  );
  assert.ok(
    callAssociationLockPosition >= 0 &&
      callAssociationLockPosition < jobConflictPosition &&
      jobConflictPosition < jobPreservationPosition &&
      jobPreservationPosition < staleVersionPosition,
    "job preservation must use locked sibling state before any persistence branch",
  );
  assert.match(
    communicationBody,
    /existing_event\.job_id is not null[\s\S]*?existing_call\.job_id is not null[\s\S]*?existing_event\.job_id is distinct from existing_call\.job_id[\s\S]*?HighLevel communication job association state conflicts[\s\S]*?if target_job_id is null then[\s\S]*?if event_exists and existing_event\.job_id is not null then[\s\S]*?target_job_id := existing_event\.job_id[\s\S]*?elsif call_exists and existing_call\.job_id is not null then[\s\S]*?target_job_id := existing_call\.job_id[\s\S]*?from public\.jobs as job[\s\S]*?job\.company_id = target_company_id/,
  );
  assert.match(
    migration,
    /provider_version_source = coalesce\([\s\S]*?'legacy_backfill'[\s\S]*?when 'connected' then 30[\s\S]*?when 'opened' then 50[\s\S]*?when 'clicked' then 50[\s\S]*?when 'opt_out' then 50/,
  );
  assert.match(
    migration,
    /update public\.call_records[\s\S]*?provider_updated_at = coalesce\(\s*provider_updated_at,\s*started_at,\s*ended_at/,
  );

  const bindingBody = functionBody("wtos_bind_gohighlevel_oauth_v1");
  assert.match(
    migration,
    /create unique index if not exists integration_connections_gohighlevel_company_uidx[\s\S]*?on public\.integration_connections\(company_id\)[\s\S]*?where provider = 'gohighlevel'/,
  );
  assert.match(
    bindingBody,
    /pg_advisory_xact_lock\([\s\S]*?oauth:company:[\s\S]*?pg_advisory_xact_lock\([\s\S]*?oauth:location:/,
  );
  assert.match(
    bindingBody,
    /credential\.external_location_id = target_location_id[\s\S]*?existing_credential\.company_id is distinct from target_company_id/,
  );
  assert.match(
    bindingBody,
    /connection\.company_id = target_company_id[\s\S]*?connection\.provider = 'gohighlevel'[\s\S]*?existing_company_connection\.external_account_id[\s\S]*?is distinct from target_location_id[\s\S]*?'disposition', 'company_location_conflict'/,
  );
  assert.ok(
    bindingBody.indexOf("'disposition', 'company_location_conflict'") <
      bindingBody.indexOf("insert into public.integration_connections"),
    "company/location conflicts must return before connection mutation",
  );
  assert.match(
    bindingBody,
    /target_connection := existing_company_connection[\s\S]*?if target_connection\.id is null then[\s\S]*?insert into public\.integration_connections/,
  );
  assert.match(bindingBody, /insert into public\.integration_connections/);
  assert.match(bindingBody, /update public\.integration_connections/);
  assert.match(bindingBody, /insert into public\.gohighlevel_oauth_credentials/);
  assert.match(bindingBody, /update public\.gohighlevel_oauth_credentials/);
  assert.match(bindingBody, /refresh_version = refresh_version \+ 1/);
  assert.match(bindingBody, /raise exception[\s\S]*OAuth connection binding was lost/);
  assert.doesNotMatch(
    bindingBody,
    /last_successful_sync_at\s*=\s*pg_catalog\.clock_timestamp/,
  );
  assert.doesNotMatch(bindingBody, /'accessToken'|'refreshToken'/);

  const refreshClaimBody = functionBody(
    "wtos_claim_gohighlevel_token_refresh_v1",
  );
  const refreshAdoptionBody = functionBody(
    "wtos_adopt_gohighlevel_token_refresh_v1",
  );
  for (const body of [refreshClaimBody, refreshAdoptionBody]) {
    assert.match(
      body,
      /connection\.id = target_credential\.integration_connection_id[\s\S]*?connection\.company_id = target_credential\.company_id[\s\S]*?connection\.provider = 'gohighlevel'[\s\S]*?connection\.external_account_id[\s\S]*?= target_credential\.external_location_id/,
    );
  }

  const finalizeBody = functionBody(
    "wtos_finalize_gohighlevel_token_refresh_v1",
  );
  assert.match(
    finalizeBody,
    /refresh_lease_id is distinct from target_lease_id/,
  );
  assert.match(
    finalizeBody,
    /refresh_lease_expires_at <= pg_catalog\.clock_timestamp\(\)/,
  );
  assert.match(finalizeBody, /refresh_version = refresh_version \+ 1/);
  assert.match(
    finalizeBody,
    /update public\.integration_connections[\s\S]*?external_account_id = target_credential\.external_location_id/,
  );
  assert.doesNotMatch(finalizeBody, /'accessToken'|'refreshToken'/);

  assert.match(
    oauthSource,
    /isGoHighLevelCredentialBoundToConnection[\s\S]*?credential\.company_id === connection\.company_id[\s\S]*?credential\.external_location_id === connection\.external_account_id/,
  );
  assert.match(
    oauthSource,
    /const leasedCredential = await readBoundActiveGoHighLevelCredential[\s\S]*?leasedCredential\.refresh_lease_id !== leaseId[\s\S]*?refreshGoHighLevelOAuthToken/,
  );

  const releaseBody = functionBody(
    "wtos_release_gohighlevel_token_refresh_v1",
  );
  assert.match(
    releaseBody,
    /refresh_version <> expected_refresh_version[\s\S]*?refresh_lease_id is distinct from target_lease_id/,
  );
  assert.match(releaseBody, /status = 'needs_reauth'/);
  assert.match(releaseBody, /'connectionMarkedNeedsReauth', false/);

  const uninstallBody = functionBody(
    "wtos_finalize_gohighlevel_uninstall_v1",
  );
  assert.match(
    uninstallBody,
    /credential\.integration_connection_id = existing_event\.integration_connection_id[\s\S]*?credential\.company_id = existing_event\.company_id[\s\S]*?credential\.external_company_id = target_external_company_id/,
  );
  assert.match(
    uninstallBody,
    /where external_company_id = target_external_company_id\s+and revoked_at is null/,
  );
  assert.match(
    uninstallBody,
    /where credential\.external_company_id = target_external_company_id/,
  );

  assert.match(
    migration,
    /drop index if exists public\.communication_provider_events_provider_sid_unique/,
  );
  assert.match(
    migration,
    /communication_provider_events_gohighlevel_provider_sid_unique[\s\S]*?company_id,[\s\S]*?integration_connection_id,[\s\S]*?provider,[\s\S]*?event_type,[\s\S]*?provider_event_sid[\s\S]*?where provider = 'gohighlevel'/,
  );
  assert.match(
    migration,
    /communication_provider_events_other_provider_sid_unique[\s\S]*?where provider <> 'gohighlevel'/,
  );
  assert.match(
    migration,
    /call_records_gohighlevel_provider_call_sid_unique[\s\S]*?company_id,[\s\S]*?integration_connection_id,[\s\S]*?provider,[\s\S]*?provider_call_sid[\s\S]*?where provider = 'gohighlevel'/,
  );
  assert.match(
    migration,
    /call_records_non_gohighlevel_provider_call_sid_unique[\s\S]*?where provider <> 'gohighlevel'/,
  );
  assert.match(
    migration,
    /communication_provider_events_gohighlevel_scope_check[\s\S]*?not valid;[\s\S]*?validate constraint communication_provider_events_gohighlevel_scope_check/,
  );
  assert.match(
    migration,
    /call_records_gohighlevel_scope_check[\s\S]*?not valid;[\s\S]*?validate constraint call_records_gohighlevel_scope_check/,
  );

  assert.match(callback, /bindGoHighLevelOAuthConnection\(\{/);
  assert.match(callback, /encryptedAccessToken: encryptGoHighLevelToken/);
  assert.match(callback, /encryptedRefreshToken: encryptGoHighLevelToken/);
  assert.doesNotMatch(callback, /\.from\("integration_connections"\)/);
  assert.doesNotMatch(callback, /credentialMutation|connectionMutation/);
  assert.match(types, /refresh_version: number/);
  assert.match(types, /refresh_lease_id: string \| null/);
  assert.match(types, /claim_token_sha256: string \| null/);
  assert.match(types, /lease_expires_at: string \| null/);
  assert.match(types, /wtos_claim_gohighlevel_sync_v1/);
  assert.match(types, /wtos_renew_gohighlevel_sync_v1/);
  assert.match(types, /wtos_complete_gohighlevel_sync_v1/);
  assert.match(types, /wtos_upsert_gohighlevel_resource_snapshots_v1/);
  assert.match(types, /wtos_bind_gohighlevel_oauth_v1/);
  assert.match(types, /wtos_finalize_gohighlevel_token_refresh_v1/);
  assert.match(types, /gohighlevel_communication_identity_conflicts/);
  assert.match(types, /GoHighLevelCommunicationIdentityConflictInsert/);
  assert.match(types, /wtos_resolve_gohighlevel_communication_identity_v1/);
  assert.match(types, /wtos_upsert_gohighlevel_communication_v1/);
});
