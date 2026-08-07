import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  GoHighLevelOauthCredentialRecord,
} from "../crm/types";
import {
  goHighLevelOAuthEndpoints,
  goHighLevelOAuthRequiredEnvVars,
  goHighLevelOAuthScopes,
} from "./foundation";

export {
  goHighLevelOAuthEndpoints,
  goHighLevelOAuthRequiredEnvVars,
  goHighLevelOAuthScopes,
} from "./foundation";

type CrmClient = SupabaseClient<Database>;
type FetchLike = typeof fetch;

export const GOHIGHLEVEL_API_BASE_URL = "https://services.leadconnectorhq.com";
export const GOHIGHLEVEL_API_VERSION = "2021-07-28";
export const GOHIGHLEVEL_TOKEN_ENDPOINT = `${GOHIGHLEVEL_API_BASE_URL}/oauth/token`;
export const GOHIGHLEVEL_LOCATION_TOKEN_ENDPOINT = `${GOHIGHLEVEL_API_BASE_URL}/oauth/location-token`;
export const GOHIGHLEVEL_INSTALLED_LOCATIONS_ENDPOINT = `${GOHIGHLEVEL_API_BASE_URL}/oauth/installed-locations`;
export const GOHIGHLEVEL_OAUTH_STATE_COOKIE = "wtos_ghl_oauth_state";
export const GOHIGHLEVEL_OAUTH_EVENT_TYPE = "gohighlevel.oauth";
export const GOHIGHLEVEL_SYNC_EVENT_TYPE = "gohighlevel.sync";
export const GOHIGHLEVEL_WEBHOOK_EVENT_TYPE = "gohighlevel.webhook";
export const GOHIGHLEVEL_PROVIDER_MANAGED_OAUTH_SCOPES = [
  "oauth.readonly",
  "oauth.write",
] as const;

const OAUTH_STATE_TTL_MINUTES = 10;
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 2 * 60 * 1000;
const TOKEN_ENCRYPTION_VERSION = "v1";

const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

const GHL_LEGACY_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

type HighLevelTokenPayload = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scopes: string[];
  userType: "Location" | "Company";
  locationId: string | null;
  companyId: string | null;
  userId: string | null;
  approvedLocations: string[];
};

export type HighLevelTokenExchangeResult =
  | { ok: true; payload: HighLevelTokenPayload }
  | { ok: false; status: number | null; error: string };

export type HighLevelInstalledLocation = {
  id: string;
  name: string | null;
};

export type HighLevelInstalledLocationsResult =
  | { ok: true; locations: HighLevelInstalledLocation[] }
  | { ok: false; status: number | null; error: string };

export type HighLevelCompanyLocationResolutionResult =
  | {
      ok: true;
      locationId: string;
      source: "approved_locations" | "installed_locations";
    }
  | {
      ok: false;
      reason: "discovery_failed" | "location_count_invalid";
      error: string;
    };

export type GoHighLevelWebhookVerification =
  | { ok: true; signatureVersion: "ed25519" | "rsa_legacy" }
  | { ok: false; signatureVersion: null; reason: string };

function getServerEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isAbsoluteUrl(value: string | null, protocols: string[]) {
  if (!value) {
    return false;
  }

  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function createGoHighLevelServiceClient(): CrmClient | null {
  const url = getServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export function getGoHighLevelOAuthConfig() {
  const clientId = getServerEnv("GHL_CLIENT_ID");
  const clientSecret = getServerEnv("GHL_CLIENT_SECRET");
  const redirectUri = getServerEnv("GHL_REDIRECT_URI");
  const installUrl = getServerEnv("GHL_MARKETPLACE_INSTALL_URL");
  const tokenEncryptionKey = getServerEnv("GHL_TOKEN_ENCRYPTION_KEY");
  const malformed: string[] = [];

  if (redirectUri && !isAbsoluteUrl(redirectUri, ["https:", "http:"])) {
    malformed.push("GHL_REDIRECT_URI");
  }

  if (installUrl && !isAbsoluteUrl(installUrl, ["https:"])) {
    malformed.push("GHL_MARKETPLACE_INSTALL_URL");
  }

  if (tokenEncryptionKey && tokenEncryptionKey.length < 32) {
    malformed.push("GHL_TOKEN_ENCRYPTION_KEY");
  }

  const missing = goHighLevelOAuthRequiredEnvVars.filter(
    (name) => !getServerEnv(name),
  );
  const marketplaceVersionId = (() => {
    if (!installUrl) return null;
    try {
      const url = new URL(installUrl);
      return normalizeString(
        url.searchParams.get("version_id") ?? url.searchParams.get("versionId"),
      );
    } catch {
      return null;
    }
  })();
  const marketplaceAppId =
    clientId?.match(/^([^-]+)-/)?.[1] ?? marketplaceVersionId;

  return {
    ok: missing.length === 0 && malformed.length === 0,
    missing: [...missing],
    malformed,
    clientId,
    clientSecret,
    redirectUri,
    installUrl,
    marketplaceAppId,
    marketplaceVersionId,
    tokenEncryptionKey,
    syncEnabled: getServerEnv("GHL_SYNC_ENABLED") === "true",
    detected: {
      clientId: Boolean(clientId),
      clientSecret: Boolean(clientSecret),
      redirectUri: Boolean(redirectUri),
      installUrl: Boolean(installUrl),
      tokenEncryptionKey: Boolean(tokenEncryptionKey),
    },
  };
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function hashGoHighLevelOAuthState(state: string) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export function createGoHighLevelOAuthState({
  randomBytes = (size: number) => crypto.randomBytes(size),
}: {
  randomBytes?: (size: number) => Buffer;
} = {}) {
  const rawState = base64UrlEncode(randomBytes(32));

  return {
    rawState,
    stateHash: hashGoHighLevelOAuthState(rawState),
    expiresAt: new Date(
      Date.now() + OAUTH_STATE_TTL_MINUTES * 60 * 1000,
    ).toISOString(),
  };
}

export function buildGoHighLevelAuthorizationRequest({
  rawState,
}: {
  rawState: string;
}) {
  const config = getGoHighLevelOAuthConfig();

  if (!config.ok || !config.installUrl || !config.clientId || !config.redirectUri) {
    throw new Error("GoHighLevel OAuth configuration is incomplete.");
  }

  const url = new URL(config.installUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", goHighLevelOAuthScopes.join(" "));
  url.searchParams.set("state", rawState);

  return {
    authorizationUrl: url.toString(),
    scopes: [...goHighLevelOAuthScopes],
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTokenPayload(value: unknown): HighLevelTokenPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const accessToken = normalizeString(payload.accessToken ?? payload.access_token);
  const refreshToken = normalizeString(payload.refreshToken ?? payload.refresh_token);
  const rawUserType = normalizeString(payload.userType ?? payload.user_type);
  const userType =
    rawUserType === "Company" || rawUserType === "Location" ? rawUserType : null;
  const rawExpiresIn = payload.expiresIn ?? payload.expires_in;
  const expiresIn =
    typeof rawExpiresIn === "number"
      ? rawExpiresIn
      : Number.parseInt(String(rawExpiresIn ?? ""), 10);
  const scopeValue = normalizeString(payload.scope) ?? "";
  const rawApprovedLocations =
    payload.approvedLocations ?? payload.approved_locations;

  if (!accessToken || !refreshToken || !userType || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    tokenType: normalizeString(payload.tokenType ?? payload.token_type) ?? "Bearer",
    expiresIn,
    scopes: scopeValue.split(/[\s,]+/).filter(Boolean),
    userType,
    locationId: normalizeString(payload.locationId ?? payload.location_id),
    companyId: normalizeString(payload.companyId ?? payload.company_id),
    userId: normalizeString(payload.userId ?? payload.user_id),
    approvedLocations: Array.isArray(rawApprovedLocations)
      ? rawApprovedLocations
          .map(normalizeString)
          .filter((value): value is string => Boolean(value))
      : [],
  };
}

function getSafeTokenError(status: number | null) {
  if (status === 400 || status === 422) {
    return "HighLevel rejected the OAuth token request parameters.";
  }

  if (status === 401 || status === 403) {
    return "HighLevel rejected the Marketplace client credentials.";
  }

  return "HighLevel OAuth token exchange failed.";
}

async function requestHighLevelToken({
  body,
  encoding = "json",
  fetchImpl = fetch,
}: {
  body: Record<string, string>;
  encoding?: "json" | "form";
  fetchImpl?: FetchLike;
}): Promise<HighLevelTokenExchangeResult> {
  const requestBody =
    encoding === "form" ? new URLSearchParams(body).toString() : JSON.stringify(body);
  const response = await fetchImpl(GOHIGHLEVEL_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type":
        encoding === "form"
          ? "application/x-www-form-urlencoded"
          : "application/json",
    },
    body: requestBody,
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return { ok: false, status: null, error: getSafeTokenError(null) };
  }

  const rawPayload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: getSafeTokenError(response.status),
    };
  }

  const payload = normalizeTokenPayload(rawPayload);

  return payload
    ? { ok: true, payload }
    : {
        ok: false,
        status: response.status,
        error: "HighLevel returned an invalid OAuth token response.",
      };
}

export async function exchangeGoHighLevelOAuthCode({
  code,
  fetchImpl = fetch,
}: {
  code: string;
  fetchImpl?: FetchLike;
}) {
  const config = getGoHighLevelOAuthConfig();

  if (!config.ok || !config.clientId || !config.clientSecret || !config.redirectUri) {
    return {
      ok: false as const,
      status: null,
      error: "GoHighLevel OAuth configuration is incomplete.",
    };
  }

  return requestHighLevelToken({
    fetchImpl,
    encoding: "form",
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Location",
      redirect_uri: config.redirectUri,
    },
  });
}

export async function exchangeGoHighLevelLocationToken({
  accessToken,
  companyId,
  locationId,
  fetchImpl = fetch,
}: {
  accessToken: string;
  companyId: string;
  locationId: string;
  fetchImpl?: FetchLike;
}): Promise<HighLevelTokenExchangeResult> {
  const response = await fetchImpl(GOHIGHLEVEL_LOCATION_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Version: "v3",
    },
    body: new URLSearchParams({ companyId, locationId }).toString(),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      status: null,
      error: "HighLevel location-token exchange failed.",
    };
  }

  const rawPayload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "HighLevel rejected the location-token exchange.",
    };
  }

  const payload = normalizeTokenPayload(rawPayload);
  return payload?.userType === "Location" && payload.locationId === locationId
    ? { ok: true, payload }
    : {
        ok: false,
        status: response.status,
        error: "HighLevel returned an invalid location-token response.",
      };
}

export async function getGoHighLevelInstalledLocations({
  accessToken,
  companyId,
  fetchImpl = fetch,
}: {
  accessToken: string;
  companyId: string;
  fetchImpl?: FetchLike;
}): Promise<HighLevelInstalledLocationsResult> {
  const config = getGoHighLevelOAuthConfig();
  if (!config.ok || !config.marketplaceAppId) {
    return {
      ok: false,
      status: null,
      error: "GoHighLevel Marketplace app metadata is incomplete.",
    };
  }

  const url = new URL(GOHIGHLEVEL_INSTALLED_LOCATIONS_ENDPOINT);
  url.searchParams.set("companyId", companyId);
  url.searchParams.set("appId", config.marketplaceAppId);
  url.searchParams.set("isInstalled", "true");
  url.searchParams.set("pageSize", "100");
  if (config.marketplaceVersionId) {
    url.searchParams.set("versionId", config.marketplaceVersionId);
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      Version: "v3",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      status: null,
      error: "HighLevel installed-location discovery failed.",
    };
  }

  const rawPayload: unknown = await response.json().catch(() => null);
  if (!response.ok || !rawPayload || typeof rawPayload !== "object") {
    return {
      ok: false,
      status: response.status,
      error: "HighLevel rejected installed-location discovery.",
    };
  }

  const payload = rawPayload as Record<string, unknown>;
  const rawLocations = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.locations)
      ? payload.locations
      : [];
  const locations = new Map<string, HighLevelInstalledLocation>();
  for (const value of rawLocations) {
    if (!value || typeof value !== "object") continue;
    const location = value as Record<string, unknown>;
    if (location.isInstalled === false) continue;
    const id = normalizeString(
      location._id ?? location.id ?? location.locationId ?? location.location_id,
    );
    if (!id) continue;
    locations.set(id, {
      id,
      name: normalizeString(location.name),
    });
  }

  return { ok: true, locations: [...locations.values()] };
}

export async function resolveGoHighLevelCompanyLocation({
  accessToken,
  companyId,
  approvedLocationIds,
  fetchImpl = fetch,
}: {
  accessToken: string;
  companyId: string;
  approvedLocationIds: string[];
  fetchImpl?: FetchLike;
}): Promise<HighLevelCompanyLocationResolutionResult> {
  const uniqueApprovedLocationIds = [...new Set(approvedLocationIds)];
  if (uniqueApprovedLocationIds.length === 1) {
    return {
      ok: true,
      locationId: uniqueApprovedLocationIds[0],
      source: "approved_locations",
    };
  }
  if (uniqueApprovedLocationIds.length > 1) {
    return {
      ok: false,
      reason: "location_count_invalid",
      error:
        "HighLevel returned multiple approved sub-accounts for one company mapping.",
    };
  }

  const installedLocations = await getGoHighLevelInstalledLocations({
    accessToken,
    companyId,
    fetchImpl,
  });
  if (!installedLocations.ok) {
    return {
      ok: false,
      reason: "discovery_failed",
      error: installedLocations.error,
    };
  }
  if (installedLocations.locations.length !== 1) {
    return {
      ok: false,
      reason: "location_count_invalid",
      error:
        installedLocations.locations.length === 0
          ? "HighLevel installed-location discovery returned no installed sub-accounts."
          : "HighLevel installed-location discovery returned multiple installed sub-accounts for one company mapping.",
    };
  }

  return {
    ok: true,
    locationId: installedLocations.locations[0].id,
    source: "installed_locations",
  };
}

export async function refreshGoHighLevelOAuthToken({
  refreshToken,
  fetchImpl = fetch,
}: {
  refreshToken: string;
  fetchImpl?: FetchLike;
}) {
  const config = getGoHighLevelOAuthConfig();

  if (!config.ok || !config.clientId || !config.clientSecret || !config.redirectUri) {
    return {
      ok: false as const,
      status: null,
      error: "GoHighLevel OAuth configuration is incomplete.",
    };
  }

  return requestHighLevelToken({
    fetchImpl,
    encoding: "form",
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
      redirect_uri: config.redirectUri,
    },
  });
}

export function validateGoHighLevelGrantedScopes(scopes: string[]) {
  const granted = new Set(scopes);
  const required = new Set<string>(goHighLevelOAuthScopes);
  const providerManaged = new Set<string>(
    GOHIGHLEVEL_PROVIDER_MANAGED_OAUTH_SCOPES,
  );
  const missing = goHighLevelOAuthScopes.filter((scope) => !granted.has(scope));
  const unexpected = scopes.filter(
    (scope) => !required.has(scope) && !providerManaged.has(scope),
  );

  return {
    ok: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
    providerManaged: scopes.filter((scope) => providerManaged.has(scope)),
  };
}

export function describeGoHighLevelScopeMismatch({
  missing,
  unexpected,
}: ReturnType<typeof validateGoHighLevelGrantedScopes>) {
  const missingLabel = missing.length > 0 ? missing.join(", ") : "none";
  const unexpectedLabel = unexpected.length > 0 ? unexpected.join(", ") : "none";

  return `HighLevel granted scopes do not match the approved least-privilege set. Missing: ${missingLabel}. Unexpected: ${unexpectedLabel}.`;
}

function getEncryptionKey() {
  const configuredKey = getServerEnv("GHL_TOKEN_ENCRYPTION_KEY");

  if (!configuredKey || configuredKey.length < 32) {
    throw new Error("GoHighLevel token encryption is not configured.");
  }

  return crypto.createHash("sha256").update(configuredKey).digest();
}

export function encryptGoHighLevelToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_ENCRYPTION_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptGoHighLevelToken(value: string) {
  const [version, iv, authTag, ciphertext] = value.split(":");

  if (version !== TOKEN_ENCRYPTION_VERSION || !iv || !authTag || !ciphertext) {
    throw new Error("Stored GoHighLevel token format is invalid.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function getGoHighLevelTokenExpiry(expiresIn: number) {
  const safeSeconds = Math.max(60, Math.min(expiresIn, 7 * 24 * 60 * 60));
  return new Date(Date.now() + safeSeconds * 1000).toISOString();
}

export async function getGoHighLevelAccessToken({
  serviceClient,
  integrationConnectionId,
  fetchImpl = fetch,
  forceRefresh = false,
}: {
  serviceClient: CrmClient;
  integrationConnectionId: string;
  fetchImpl?: FetchLike;
  forceRefresh?: boolean;
}) {
  const { data: credential, error } = await serviceClient
    .from("gohighlevel_oauth_credentials")
    .select("*")
    .eq("integration_connection_id", integrationConnectionId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !credential) {
    return { ok: false as const, error: "GoHighLevel OAuth credential is unavailable." };
  }

  if (
    !forceRefresh &&
    new Date(credential.token_expires_at).getTime() >
    Date.now() + ACCESS_TOKEN_EXPIRY_SKEW_MS
  ) {
    return {
      ok: true as const,
      accessToken: decryptGoHighLevelToken(credential.encrypted_access_token),
      credential,
      refreshed: false,
    };
  }

  const refresh = await refreshGoHighLevelOAuthToken({
    refreshToken: decryptGoHighLevelToken(credential.encrypted_refresh_token),
    fetchImpl,
  });

  if (!refresh.ok) {
    const { data: concurrentlyRefreshed } = await serviceClient
      .from("gohighlevel_oauth_credentials")
      .select("*")
      .eq("id", credential.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (
      concurrentlyRefreshed &&
      concurrentlyRefreshed.encrypted_refresh_token !==
        credential.encrypted_refresh_token &&
      new Date(concurrentlyRefreshed.token_expires_at).getTime() >
        Date.now() + ACCESS_TOKEN_EXPIRY_SKEW_MS
    ) {
      return {
        ok: true as const,
        accessToken: decryptGoHighLevelToken(
          concurrentlyRefreshed.encrypted_access_token,
        ),
        credential: concurrentlyRefreshed,
        refreshed: true,
      };
    }

    await serviceClient
      .from("integration_connections")
      .update({ status: "needs_reauth", last_error: refresh.error })
      .eq("id", integrationConnectionId);
    return { ok: false as const, error: refresh.error };
  }

  const scopes = validateGoHighLevelGrantedScopes(refresh.payload.scopes);

  if (!scopes.ok || refresh.payload.locationId !== credential.external_location_id) {
    await serviceClient
      .from("integration_connections")
      .update({
        status: "needs_reauth",
        last_error: "HighLevel refreshed the token with an invalid scope or location binding.",
      })
      .eq("id", integrationConnectionId);
    return {
      ok: false as const,
      error: "HighLevel refreshed the token with an invalid scope or location binding.",
    };
  }

  const update = {
    encrypted_access_token: encryptGoHighLevelToken(refresh.payload.accessToken),
    encrypted_refresh_token: encryptGoHighLevelToken(refresh.payload.refreshToken),
    token_type: refresh.payload.tokenType,
    scopes: refresh.payload.scopes,
    token_expires_at: getGoHighLevelTokenExpiry(refresh.payload.expiresIn),
    last_refreshed_at: new Date().toISOString(),
  };
  const { data: refreshedCredential, error: updateError } = await serviceClient
    .from("gohighlevel_oauth_credentials")
    .update(update)
    .eq("id", credential.id)
    .select("*")
    .single();

  if (updateError || !refreshedCredential) {
    return { ok: false as const, error: "Refreshed HighLevel token could not be saved." };
  }

  return {
    ok: true as const,
    accessToken: refresh.payload.accessToken,
    credential: refreshedCredential as GoHighLevelOauthCredentialRecord,
    refreshed: true,
  };
}

function validBase64(value: string) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0;
}

export function verifyGoHighLevelWebhookSignature({
  rawBody,
  ghlSignature,
  legacySignature,
  ed25519PublicKey = GHL_ED25519_PUBLIC_KEY,
  legacyPublicKey = GHL_LEGACY_RSA_PUBLIC_KEY,
}: {
  rawBody: string;
  ghlSignature?: string | null;
  legacySignature?: string | null;
  ed25519PublicKey?: string;
  legacyPublicKey?: string;
}): GoHighLevelWebhookVerification {
  if (ghlSignature) {
    if (!validBase64(ghlSignature)) {
      return { ok: false, signatureVersion: null, reason: "Invalid webhook signature." };
    }

    try {
      const ok = crypto.verify(
        null,
        Buffer.from(rawBody, "utf8"),
        ed25519PublicKey,
        Buffer.from(ghlSignature, "base64"),
      );
      return ok
        ? { ok: true, signatureVersion: "ed25519" }
        : { ok: false, signatureVersion: null, reason: "Invalid webhook signature." };
    } catch {
      return { ok: false, signatureVersion: null, reason: "Invalid webhook signature." };
    }
  }

  if (legacySignature) {
    if (!validBase64(legacySignature)) {
      return { ok: false, signatureVersion: null, reason: "Invalid webhook signature." };
    }

    try {
      const verifier = crypto.createVerify("SHA256");
      verifier.update(rawBody);
      verifier.end();
      const ok = verifier.verify(legacyPublicKey, legacySignature, "base64");
      return ok
        ? { ok: true, signatureVersion: "rsa_legacy" }
        : { ok: false, signatureVersion: null, reason: "Invalid webhook signature." };
    } catch {
      return { ok: false, signatureVersion: null, reason: "Invalid webhook signature." };
    }
  }

  return { ok: false, signatureVersion: null, reason: "Webhook signature is missing." };
}

function truncate(value: unknown, length: number) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, length)
    : null;
}

export function buildGoHighLevelWebhookSummary(payload: Record<string, unknown>) {
  return {
    type: truncate(payload.type, 80),
    locationId: truncate(payload.locationId, 128),
    contactId: truncate(payload.contactId, 128),
    conversationId: truncate(payload.conversationId, 128),
    messageId: truncate(payload.messageId, 128),
    messageType: truncate(payload.messageType, 40),
    direction: truncate(payload.direction, 20),
    status: truncate(payload.status, 80),
    from: truncate(payload.from, 80),
    to: truncate(payload.to, 80),
    bodyPreview: truncate(payload.body ?? payload.message, 500),
    callStatus: truncate(payload.callStatus, 80),
    callDuration:
      typeof payload.callDuration === "number" ? payload.callDuration : null,
    timestamp: truncate(payload.timestamp ?? payload.dateAdded, 80),
  };
}

export function createGoHighLevelFingerprint(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
