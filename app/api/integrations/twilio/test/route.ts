import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  getTwilioConfigCheckResult,
  type TwilioTestSmsResult,
} from "../../../../../lib/twilio/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TwilioTestResponse = ReturnType<typeof getTwilioConfigCheckResult> & {
  communicationsSent: false;
  testSms: TwilioTestSmsResult;
};

async function requireOwner() {
  const sessionClient = await getSupabaseServerClient();

  if (!sessionClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before checking Twilio configuration." },
      { status: 401 },
    );
  }

  const { data: ownerMemberships } = await sessionClient
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userResult.user.id)
    .eq("role", "owner")
    .limit(1);

  if (!ownerMemberships?.length) {
    return NextResponse.json(
      { ok: false, message: "A company owner must check Twilio configuration." },
      { status: 403 },
    );
  }

  return null;
}

function createNoSendResponse(status = 200) {
  const config = getTwilioConfigCheckResult();

  return NextResponse.json(
    {
      ...config,
      credentials: {
        ...config.credentials,
        fromNumber: null,
      },
      businessNumbers: [],
      communicationsSent: false,
      testSms: {
        attempted: false,
        sent: false,
        message:
          "Twilio outbound SMS is unavailable in the inbound-only production phase. No provider request was made.",
      },
    } satisfies TwilioTestResponse,
    { status },
  );
}

export async function GET() {
  const authorizationFailure = await requireOwner();

  if (authorizationFailure) {
    return authorizationFailure;
  }

  return createNoSendResponse();
}

export async function POST() {
  const authorizationFailure = await requireOwner();

  if (authorizationFailure) {
    return authorizationFailure;
  }

  return createNoSendResponse(405);
}
