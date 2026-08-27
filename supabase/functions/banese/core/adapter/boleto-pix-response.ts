import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../../internal/pix-validation.ts";
import { renderOfficialBanesePixQr } from "../../internal/official-pix-qr.ts";
import { asRecord } from "./utils.ts";

const PIX_PAYLOAD_FIELD_NAMES = new Set([
  "brcodeemv",
  "dsurl",
  "brcode",
  "copiacola",
  "pixpayload",
  "qrtext",
  "emv",
]);

const PIX_IMAGE_FIELD_NAMES = new Set([
  "base64",
  "qrcode",
  "qrcodebase64",
  "qrcodeimage",
  "pixqrcode",
  "piximagem",
  "imagemqrcode",
]);

const normalizedFieldName = (value: string) =>
  value.replace(/[^a-z0-9]/gi, "").toLowerCase();

const pixReturnCandidates = (raw: unknown) => {
  const payloadCandidates: string[] = [];
  const imageCandidates: string[] = [];
  let visited = 0;

  const visit = (value: unknown, parentPath: string[], depth: number) => {
    if (depth > 4 || visited > 120 || !value || typeof value !== "object") {
      return;
    }
    visited += 1;

    for (const [key, child] of Object.entries(asRecord(value))) {
      const normalizedKey = normalizedFieldName(key);
      const path = [...parentPath, normalizedKey];
      const pixScoped = path.some((part) =>
        /pix|qr|brcode|emv|copia/.test(part)
      );

      if (typeof child === "string") {
        const candidate = child.trim();
        if (!candidate) continue;

        if (
          PIX_PAYLOAD_FIELD_NAMES.has(normalizedKey) ||
          (normalizedKey === "payload" && pixScoped)
        ) {
          payloadCandidates.push(candidate);
        }
        if (
          PIX_IMAGE_FIELD_NAMES.has(normalizedKey) ||
          (normalizedKey === "imagem" && pixScoped)
        ) {
          imageCandidates.push(candidate);
        }
        // Alguns contratos chamam o conteúdo simplesmente de QRCode. O
        // validador abaixo distingue EMV textual de imagem codificada.
        if (normalizedKey === "qrcode") {
          payloadCandidates.push(candidate);
        }
        continue;
      }

      visit(child, path, depth + 1);
    }
  };

  visit(raw, [], 0);
  return { payloadCandidates, imageCandidates };
};

export const normalizeBanesePixFromResponse = async (
  raw: unknown,
  amount: number,
) => {
  const { payloadCandidates, imageCandidates } = pixReturnCandidates(raw);
  let pixPayload: string | null = null;
  let pixEncodedImage: string | null = null;

  for (const candidate of payloadCandidates) {
    try {
      pixPayload = normalizeBanesePixPayload(candidate, amount).payload;
      break;
    } catch {
      // O diagnóstico persiste apenas presença/validade, nunca o conteúdo.
    }
  }
  for (const candidate of imageCandidates) {
    try {
      pixEncodedImage = normalizeBanesePixQrImage(candidate);
      break;
    } catch {
      // O diagnóstico persiste apenas presença/validade, nunca o conteúdo.
    }
  }

  let imageSource: "bank" | "generated_from_official_emv" | null =
    pixEncodedImage ? "bank" : null;
  if (pixPayload && !pixEncodedImage) {
    pixEncodedImage = await renderOfficialBanesePixQr(pixPayload);
    imageSource = "generated_from_official_emv";
  }

  const complete = Boolean(pixPayload && pixEncodedImage);
  return {
    pixPayload: complete ? pixPayload : null,
    pixEncodedImage: complete ? pixEncodedImage : null,
    diagnostic: {
      payloadCandidatePresent: payloadCandidates.length > 0,
      imageCandidatePresent: imageCandidates.length > 0,
      payloadValid: Boolean(pixPayload),
      imageValid: Boolean(pixEncodedImage),
      imageSource,
      complete,
    },
  };
};

export const normalizeBanesePixFromResponses = async (
  responses: Array<{ source: "creation" | "confirmation"; raw: unknown }>,
  amount: number,
) => {
  const diagnostics: Array<Record<string, unknown>> = [];
  for (const response of responses) {
    const normalized = await normalizeBanesePixFromResponse(
      response.raw,
      amount,
    );
    diagnostics.push({ source: response.source, ...normalized.diagnostic });
    if (normalized.pixPayload && normalized.pixEncodedImage) {
      return {
        pixPayload: normalized.pixPayload,
        pixEncodedImage: normalized.pixEncodedImage,
        diagnostic: {
          source: response.source,
          complete: true,
          attempts: diagnostics,
        },
      };
    }
  }
  return {
    pixPayload: null,
    pixEncodedImage: null,
    diagnostic: {
      source: null,
      complete: false,
      attempts: diagnostics,
    },
  };
};
