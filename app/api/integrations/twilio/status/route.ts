import { NextRequest } from "next/server";
import { handleTwilioWebhook } from "../../../../../lib/twilio/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleTwilioWebhook(request, "sms_status");
}
