import { NextRequest, NextResponse } from "next/server";
import {
  getTwilioConfigCheckResult,
  normalizeTwilioTestRecipient,
  sendTwilioTestSms,
  type TwilioTestSmsResult,
} from "../../../../../lib/twilio/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TwilioTestRequestBody = {
  safeTestMode?: unknown;
  testRecipient?: unknown;
  message?: unknown;
};

type TwilioTestResponse = ReturnType<typeof getTwilioConfigCheckResult> & {
  communicationsSent: boolean;
  testSms: TwilioTestSmsResult;
};

function getOptionalMessage(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const message = value.trim();

  if (!message) {
    return undefined;
  }

  return message.slice(0, 320);
}

async function getJsonBody(request: NextRequest): Promise<TwilioTestRequestBody> {
  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object") {
      return body as TwilioTestRequestBody;
    }
  } catch {
    return {};
  }

  return {};
}

function createResponse(
  testSms: TwilioTestSmsResult,
  status: number,
  communicationsSent = false,
) {
  const config = getTwilioConfigCheckResult();
  const responseBody: TwilioTestResponse = {
    ...config,
    communicationsSent,
    testSms,
  };

  return NextResponse.json(responseBody, { status });
}

export async function GET() {
  const config = getTwilioConfigCheckResult();

  return NextResponse.json(
    {
      ...config,
      communicationsSent: false,
      testSms: {
        attempted: false,
        sent: false,
        message:
          "No SMS was sent. To explicitly request a safe test SMS, set safeTestMode to true and include testRecipient in E.164 format.",
      },
    } satisfies TwilioTestResponse,
    { status: config.ok ? 200 : 503 },
  );
}

export async function POST(request: NextRequest) {
  const config = getTwilioConfigCheckResult();
  const body = await getJsonBody(request);
  const safeTestMode = body.safeTestMode === true;
  const recipient = normalizeTwilioTestRecipient(body.testRecipient);

  if (safeTestMode && !recipient) {
    return createResponse(
      {
        attempted: false,
        sent: false,
        message:
          "No SMS was sent. safeTestMode requires testRecipient in E.164 format, such as +14805550123.",
      },
      400,
    );
  }

  if (!safeTestMode) {
    return createResponse(
      {
        attempted: false,
        sent: false,
        message:
          "No SMS was sent. Set safeTestMode to true and provide testRecipient to explicitly request a safe test SMS.",
      },
      config.ok ? 200 : 503,
    );
  }

  if (!config.ok) {
    return createResponse(
      {
        attempted: false,
        sent: false,
        message:
          "No SMS was sent because Twilio server configuration is incomplete.",
      },
      503,
    );
  }

  if (!config.outboundReady) {
    return createResponse(
      {
        attempted: false,
        sent: false,
        message:
          "No SMS was sent because TWILIO_FROM_NUMBER is blank. Add or port a sender number before outbound testing.",
      },
      200,
    );
  }

  const testSms = await sendTwilioTestSms({
    recipient: recipient ?? "",
    body: getOptionalMessage(body.message),
  });

  return createResponse(testSms, testSms.sent ? 200 : 502, testSms.sent);
}
