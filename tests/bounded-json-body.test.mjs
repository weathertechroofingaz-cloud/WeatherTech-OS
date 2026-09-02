import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-bounded-json-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function streamRequest(chunks, headers = {}) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request("http://weathertech.test/bounded", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules", ".bin", "tsc"),
    [
      "lib/http/boundedJson.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--outDir",
      outDir,
    ],
    { cwd, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    throw new Error(`Could not compile bounded JSON helper.\n${compile.stdout}\n${compile.stderr}`);
  }

  const bounded = await import(pathToFileURL(join(outDir, "boundedJson.js")));
  const encoder = new TextEncoder();

  const valid = await bounded.readBoundedJsonBody(
    streamRequest([
      encoder.encode('{"message":"'),
      encoder.encode("safe 😀"),
      encoder.encode('"}'),
    ]),
    128,
  );
  assert(valid.ok && valid.value.message === "safe 😀", "Chunked UTF-8 JSON must parse within the byte cap");

  const forgedLength = await bounded.readBoundedJsonBody(
    streamRequest([encoder.encode(JSON.stringify({ padding: "x".repeat(256) }))], {
      "content-length": "2",
    }),
    64,
  );
  assert(
    !forgedLength.ok && forgedLength.reason === "too_large",
    "Actual streamed bytes must defeat a forged small Content-Length",
  );

  const declaredOversize = await bounded.readBoundedJsonBody(
    streamRequest([encoder.encode("{}")], { "content-length": "999" }),
    64,
  );
  assert(
    !declaredOversize.ok && declaredOversize.reason === "too_large",
    "An oversized declared body must fail before parsing",
  );

  const malformed = await bounded.readBoundedJsonBody(
    streamRequest([encoder.encode("{not-json")]),
    64,
  );
  assert(
    !malformed.ok && malformed.reason === "invalid",
    "Malformed JSON must fail closed",
  );

  console.log("Bounded JSON request-body regression passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
