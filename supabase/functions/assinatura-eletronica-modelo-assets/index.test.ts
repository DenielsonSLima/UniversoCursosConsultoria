/* global CompressionStream, ReadableStream, TextDecoder */

import assert from "node:assert/strict";
import {
  MAX_JSON_BODY_BYTES,
  MAX_MULTIPART_BYTES,
  MAX_PNG_BYTES,
  publicMetadata,
  readBodyBounded,
  reconcileModelAssets,
  RequestBodyTooLargeError,
  sanitizePng,
  sha256Hex,
  SIGNATURE_MODEL_ASSET_BUCKET,
  validateAndSanitizePng,
} from "./index.ts";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array) => {
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) {
    result[4 + index] = type.charCodeAt(index);
  }
  result.set(data, 8);
  view.setUint32(8 + data.length, crc32(result.slice(4, 8 + data.length)));
  return result;
};

const join = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const compress = async (bytes: Uint8Array) => {
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(
    new CompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const fixturePng = async (
  extras: Array<{ type: string; data?: Uint8Array }> = [],
) => {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 2);
  view.setUint32(4, 3);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rawPixels = new Uint8Array(3 * (1 + 2 * 4));
  rawPixels[0] = 0;
  rawPixels[9] = 0;
  rawPixels[18] = 0;
  return join(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    ...extras.map(({ type, data }) => chunk(type, data || new Uint8Array())),
    chunk("IDAT", await compress(rawPixels)),
    chunk("IEND", new Uint8Array()),
  );
};

Deno.test("uses an isolated private-bucket identifier", () => {
  assert.equal(
    SIGNATURE_MODEL_ASSET_BUCKET,
    "assinatura-eletronica-modelo-assets",
  );
});

Deno.test("accepts a decodable PNG and preserves dimensions", async () => {
  const validated = await validateAndSanitizePng(await fixturePng());
  assert.equal(validated.mimeType, "image/png");
  assert.equal(validated.width, 2);
  assert.equal(validated.height, 3);
});

Deno.test("strips textual, EXIF, time and color-profile metadata", async () => {
  const original = await fixturePng([
    { type: "tEXt", data: new TextEncoder().encode("Author=private") },
    { type: "eXIf", data: new Uint8Array([1, 2, 3]) },
    { type: "tIME", data: new Uint8Array(7) },
    { type: "iCCP", data: new TextEncoder().encode("profile") },
    { type: "vpAg", data: new TextEncoder().encode("private-ancillary") },
  ]);
  const sanitized = sanitizePng(original);
  assert.equal(sanitized.bytes.length < original.length, true);
  const decoded = new TextDecoder().decode(sanitized.bytes);
  for (
    const marker of [
      "Author=private",
      "eXIf",
      "tIME",
      "iCCP",
      "private-ancillary",
    ]
  ) {
    assert.equal(decoded.includes(marker), false);
  }
});

Deno.test("rejects non-PNG content even if a caller could forge MIME", async () => {
  await assert.rejects(
    () => validateAndSanitizePng(new TextEncoder().encode("<svg></svg>")),
    /PNG valido/,
  );
});

Deno.test("rejects payloads above one mebibyte before parsing", async () => {
  await assert.rejects(
    () => validateAndSanitizePng(new Uint8Array(MAX_PNG_BYTES + 1)),
    /maior que 1 MiB/,
  );
});

Deno.test("bounds streamed bodies even without Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_JSON_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://example.test/asset", {
    method: "POST",
    body: stream,
  });
  assert.equal(request.headers.has("content-length"), false);
  await assert.rejects(
    () => readBodyBounded(request, MAX_JSON_BODY_BYTES),
    RequestBodyTooLargeError,
  );
  assert.equal(cancelled, true);
});

Deno.test("accepts a body exactly at the multipart bound", async () => {
  const payload = new Uint8Array(MAX_MULTIPART_BYTES);
  payload[0] = 7;
  payload[payload.length - 1] = 9;
  const bounded = await readBodyBounded(
    new Request("https://example.test/asset", {
      method: "POST",
      body: payload,
    }),
    MAX_MULTIPART_BYTES,
  );
  assert.equal(bounded.byteLength, MAX_MULTIPART_BYTES);
  assert.equal(bounded[0], 7);
  assert.equal(bounded[bounded.length - 1], 9);
});

Deno.test("rejects invalid CRC and animated PNG chunks", async () => {
  const corrupt = await fixturePng();
  corrupt[30] ^= 0xff;
  assert.throws(() => sanitizePng(corrupt), /checksum invalido/);

  const animated = await fixturePng([{ type: "acTL" }]);
  await assert.rejects(
    () => validateAndSanitizePng(animated),
    /animado nao e permitido/,
  );
});

Deno.test("rejects unknown critical chunks", async () => {
  const unknownCritical = await fixturePng([{ type: "ABCD" }]);
  assert.throws(
    () => sanitizePng(unknownCritical),
    /bloco critico desconhecido/,
  );
});

Deno.test("rejects out-of-bounds metadata returned by RPCs", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    mimeType: "image/png",
    sizeBytes: 100,
    width: 100,
    height: 100,
    sha256: "a".repeat(64),
  };
  assert.throws(
    () => publicMetadata({ ...base, width: 4097 }),
    /Metadados de asset invalidos/,
  );
  assert.throws(
    () => publicMetadata({ ...base, width: 4000, height: 4000 }),
    /Metadados de asset invalidos/,
  );
});

Deno.test("SHA-256 is stable and lowercase", async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode("universo")),
    "f3b3424b50f51e759ab8e98c2edeb8b789b28161de569d4cea2f3c99f31a7168",
  );
});

Deno.test("reconciliation leaves failed removals pending and never finalizes them", async () => {
  const assetId = "11111111-1111-4111-8111-111111111111";
  let finalized = false;
  const fakeAdmin = {
    rpc(name: string) {
      if (name.includes("reconciliar_reivindicar")) {
        return Promise.resolve({
          data: {
            expiredReservations: 1,
            markedAssets: 1,
            items: [{
              kind: "ASSET",
              assetId,
              bucketId: SIGNATURE_MODEL_ASSET_BUCKET,
              storagePath: `global/${assetId}.png`,
            }],
          },
          error: null,
        });
      }
      finalized = true;
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from() {
        return {
          remove() {
            return Promise.resolve({ data: null, error: new Error("offline") });
          },
        };
      },
    },
  };
  const previousError = console.error;
  console.error = () => {};
  try {
    const report = await reconcileModelAssets(
      fakeAdmin as unknown as Parameters<typeof reconcileModelAssets>[0],
      5,
    );
    assert.deepEqual(report, {
      expiredReservations: 1,
      markedAssets: 1,
      claimed: 1,
      cleaned: 0,
      failed: 1,
    });
    assert.equal(finalized, false);
  } finally {
    console.error = previousError;
  }
});

Deno.test("reconciliation retries a pending asset after finalization failure", async () => {
  const assetId = "22222222-2222-4222-8222-222222222222";
  let finalizeAttempts = 0;
  let removeAttempts = 0;
  const fakeAdmin = {
    rpc(name: string) {
      if (name.includes("reconciliar_reivindicar")) {
        return Promise.resolve({
          data: {
            expiredReservations: 0,
            markedAssets: 0,
            items: [{
              kind: "ASSET",
              assetId,
              bucketId: SIGNATURE_MODEL_ASSET_BUCKET,
              storagePath: `global/${assetId}.png`,
            }],
          },
          error: null,
        });
      }
      finalizeAttempts += 1;
      return Promise.resolve({
        data: null,
        error: finalizeAttempts === 1 ? new Error("timeout") : null,
      });
    },
    storage: {
      from() {
        return {
          remove() {
            removeAttempts += 1;
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  };
  const previousError = console.error;
  console.error = () => {};
  try {
    const first = await reconcileModelAssets(
      fakeAdmin as unknown as Parameters<typeof reconcileModelAssets>[0],
      5,
    );
    const retry = await reconcileModelAssets(
      fakeAdmin as unknown as Parameters<typeof reconcileModelAssets>[0],
      5,
    );
    assert.equal(first.failed, 1);
    assert.equal(first.cleaned, 0);
    assert.equal(retry.failed, 0);
    assert.equal(retry.cleaned, 1);
    assert.equal(removeAttempts, 2);
    assert.equal(finalizeAttempts, 2);
  } finally {
    console.error = previousError;
  }
});
