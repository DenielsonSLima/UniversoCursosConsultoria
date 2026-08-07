/* global CompressionStream, TextDecoder */

import assert from "node:assert/strict";
import {
  MAX_IMAGE_BYTES,
  sanitizePng,
  validateAndSanitizeImage,
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

const asciiOffset = (bytes: Uint8Array, type: string) => {
  const target = new TextEncoder().encode(type);
  for (let offset = 0; offset <= bytes.length - target.length; offset += 1) {
    if (target.every((value, index) => bytes[offset + index] === value)) {
      return offset - 4;
    }
  }
  throw new Error(`Chunk ${type} ausente no fixture.`);
};

const compress = async (bytes: Uint8Array) => {
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(
    new CompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const png = async (withMetadata = false) => {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 2);
  view.setUint32(4, 3);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const rawPixels = new Uint8Array(3 * (1 + 2 * 4));
  rawPixels[0] = 0;
  rawPixels[9] = 0;
  rawPixels[18] = 0;
  const imageData = await compress(rawPixels);
  return join(
    signature,
    chunk("IHDR", ihdr),
    ...(withMetadata
      ? [chunk("tEXt", new TextEncoder().encode("Author=private"))]
      : []),
    chunk("IDAT", imageData),
    chunk("IEND", new Uint8Array()),
  );
};

Deno.test("accepts a decodable PNG and reads dimensions", async () => {
  const result = await validateAndSanitizeImage(await png());
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.width, 2);
  assert.equal(result.height, 3);
});

Deno.test("removes textual PNG metadata", async () => {
  const original = await png(true);
  const result = sanitizePng(original);
  assert.equal(result.bytes.length < original.length, true);
  assert.equal(
    new TextDecoder().decode(result.bytes).includes("Author=private"),
    false,
  );
});

Deno.test("rejects SVG even when the caller could declare an image MIME", async () => {
  await assert.rejects(
    () => validateAndSanitizeImage(new TextEncoder().encode("<svg></svg>")),
    /JPG ou PNG/,
  );
});

Deno.test("rejects files above one megabyte before parsing", async () => {
  await assert.rejects(
    () => validateAndSanitizeImage(new Uint8Array(MAX_IMAGE_BYTES + 1)),
    /maior que 1 MB/,
  );
});

Deno.test("rejects a truncated PNG", async () => {
  const image = await png();
  await assert.rejects(() => validateAndSanitizeImage(image.slice(0, 30)));
});

Deno.test("rejects a PNG with an invalid checksum", async () => {
  const image = await png();
  image[30] ^= 0xff;
  await assert.rejects(
    () => validateAndSanitizeImage(image),
    /checksum invalido/,
  );
});

Deno.test("rejects a structurally plausible but undecodable PNG", async () => {
  const image = await png();
  const idatOffset = asciiOffset(image, "IDAT");
  image[idatOffset + 8] ^= 0xff;
  const length = new DataView(image.buffer).getUint32(idatOffset);
  const crc = crc32(image.slice(idatOffset + 4, idatOffset + 8 + length));
  new DataView(image.buffer).setUint32(idatOffset + 8 + length, crc);
  await assert.rejects(
    () => validateAndSanitizeImage(image),
    /corrompida ou nao pode ser decodificada/,
  );
});
