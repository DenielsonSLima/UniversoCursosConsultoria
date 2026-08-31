import {
  normalizeBanesePixPayload,
  normalizeBanesePixQrImage,
} from "../../internal/pix-validation.ts";
import { renderOfficialBanesePixQr } from "../../internal/official-pix-qr.ts";
import { type AdapterCreateChargeResult, BaneseAdapterError } from "./types.ts";
import { asRecord, markRemotePaymentMayExist } from "./utils.ts";

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
  const pixFieldShapes = new Set<string>();
  let visited = 0;

  const visit = (value: unknown, parentPath: string[], depth: number) => {
    if (depth > 4 || visited > 120 || !value || typeof value !== "object") {
      return;
    }
    visited += 1;

    if (Array.isArray(value)) {
      for (const child of value) visit(child, parentPath, depth + 1);
      return;
    }

    for (const [key, child] of Object.entries(asRecord(value))) {
      const normalizedKey = normalizedFieldName(key);
      const path = [...parentPath, normalizedKey];
      const pixScoped = path.some((part) =>
        /pix|qr|brcode|emv|copia/.test(part)
      );
      if (pixScoped && pixFieldShapes.size < 40) {
        const valueType = child === null
          ? "null"
          : Array.isArray(child)
          ? "array"
          : typeof child;
        pixFieldShapes.add(`${path.join(".")}:${valueType}`);
      }

      if (typeof child === "string") {
        const candidate = child.trim();
        if (!candidate) continue;

        // O GET do Banese pode embrulhar o BolePix em objetos com nomes de
        // folha diferentes dos usados no POST (por exemplo, texto/conteudo).
        // Dentro de um ramo inequivocamente Pix/QR, encaminhamos o texto aos
        // dois validadores. Eles continuam sendo a fronteira de seguranca:
        // somente EMV oficial valido ou imagem QR valida e aceita abaixo.
        if (pixScoped) {
          payloadCandidates.push(candidate);
          imageCandidates.push(candidate);
        }

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
  return {
    payloadCandidates,
    imageCandidates,
    pixFieldShapes: [...pixFieldShapes],
  };
};

export const normalizeBanesePixFromResponse = async (
  raw: unknown,
  amount: number,
) => {
  const { payloadCandidates, imageCandidates, pixFieldShapes } =
    pixReturnCandidates(raw);
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
      // Somente nomes normalizados/categorias de tipo; nunca conteúdo Pix.
      pixFieldShapes,
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

export const withRequiredBaneseProductionPix = (
  result: AdapterCreateChargeResult,
  pix: Awaited<ReturnType<typeof normalizeBanesePixFromResponses>>,
): AdapterCreateChargeResult => {
  if (!pix.pixPayload || !pix.pixEncodedImage) {
    throw markRemotePaymentMayExist(
      new BaneseAdapterError(
        "O titulo Banese existe, mas o retorno oficial ainda nao trouxe um QrCode Pix valido. A cobranca permanece pendente de conciliacao e nenhum novo POST deve ser enviado.",
      ),
    );
  }
  return {
    ...result,
    pixPayload: pix.pixPayload,
    pixEncodedImage: pix.pixEncodedImage,
    raw: {
      ...asRecord(result.raw),
      // Diagnóstico deliberadamente sem payload, imagem ou credenciais.
      pixDiagnostic: pix.diagnostic,
    },
  };
};
