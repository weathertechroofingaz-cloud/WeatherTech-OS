export type BoundedJsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid" | "too_large" };

export type BoundedTextReadResult =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid" | "too_large" };

export async function readBoundedTextBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedTextReadResult> {
  const contentLengthValue = request.headers.get("content-length");
  if (contentLengthValue) {
    const contentLength = Number(contentLengthValue);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > maxBytes
    ) {
      return { ok: false, reason: "too_large" };
    }
  }

  if (!request.body) {
    return { ok: true, value: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export async function readBoundedJsonBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonReadResult> {
  const body = await readBoundedTextBody(request, maxBytes);
  if (!body.ok) {
    return body;
  }
  try {
    return { ok: true, value: body.value ? JSON.parse(body.value) : {} };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
