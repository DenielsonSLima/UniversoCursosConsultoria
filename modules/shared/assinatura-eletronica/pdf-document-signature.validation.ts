import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  type ElectronicSignatureStampContentLayout,
} from "./assinatura-eletronica.contract.ts";
import {
  SIGNATURE_STAMP_COORDINATE_SCALE,
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
} from "./signature-stamp-placement.ts";
import type {
  AppliedSignatureStamp,
  PreparedSignatureStamp,
} from "./pdf-document-signature.types.ts";
import { stampRoleLabel } from "./pdf-document-signature.roles.ts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MASKED_CPF_PATTERN =
  /^(?:\d{2}\*[.]\*{3}[.]\*{2}\d-\d{2}|\*{3}[.]\*{3}[.]\*{3}-\d{2})$/u;
const SIGNED_AT_WITH_SECONDS_PATTERN =
  /T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const assertSafeSingleLine = (
  value: string,
  label: string,
  maximumLength: number,
) => {
  const normalized = String(value || "").trim().replace(/\s+/gu, " ");
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!normalized || normalized.length > maximumLength || hasControlCharacter) {
    throw new Error(`${label} do carimbo é inválido.`);
  }
  return normalized;
};

const validateCanonicalVerificationUrl = (rawUrl: string) => {
  const normalized = assertSafeSingleLine(rawUrl, "A URL de verificação", 500);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("A URL de verificação do carimbo é inválida.");
  }
  const parameters = [...url.searchParams.entries()];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/validador" ||
    parameters.length !== 1 ||
    parameters[0][0] !== "code" ||
    !parameters[0][1] ||
    url.toString() !== normalized
  ) {
    throw new Error(
      "A URL de verificação do carimbo não corresponde ao validador público.",
    );
  }
  return url.toString();
};

const prepareIndividualVerification = (
  stamp: AppliedSignatureStamp,
  documentVerificationUrl: string,
) => {
  const signatureEventId = assertSafeSingleLine(
    stamp.signatureEventId,
    "O identificador do evento de assinatura",
    36,
  ).toLowerCase();
  if (!UUID_PATTERN.test(signatureEventId)) {
    throw new Error(
      "O identificador do evento individual do carimbo é inválido.",
    );
  }
  const verificationCode = assertSafeSingleLine(
    stamp.verificationCode,
    "O código individual de verificação",
    40,
  );
  const expectedVerificationCode = `SIG-${signatureEventId.toUpperCase()}`;
  if (verificationCode !== expectedVerificationCode) {
    throw new Error(
      "O código individual do carimbo diverge do evento de assinatura.",
    );
  }
  const verificationUrl = validateCanonicalVerificationUrl(
    stamp.verificationUrl,
  );
  const individualUrl = new URL(verificationUrl);
  const documentUrl = new URL(documentVerificationUrl);
  if (
    individualUrl.origin !== documentUrl.origin ||
    individualUrl.pathname !== documentUrl.pathname ||
    individualUrl.searchParams.get("code") !== verificationCode
  ) {
    throw new Error(
      "A URL individual do carimbo diverge da validação pública autorizada.",
    );
  }
  return { signatureEventId, verificationCode, verificationUrl };
};

const assertPlacement = (stamp: AppliedSignatureStamp) => {
  const placement = stamp.placement;
  const values = [
    placement.xBp,
    placement.yBp,
    placement.widthBp,
    placement.heightBp,
  ];
  if (
    placement.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
    values.some((value) => !Number.isInteger(value)) ||
    placement.widthBp < SIGNATURE_STAMP_MIN_WIDTH_BP ||
    placement.widthBp > SIGNATURE_STAMP_MAX_WIDTH_BP ||
    placement.heightBp < SIGNATURE_STAMP_MIN_HEIGHT_BP ||
    placement.heightBp > SIGNATURE_STAMP_MAX_HEIGHT_BP ||
    placement.xBp < 0 ||
    placement.yBp < 0 ||
    placement.xBp + placement.widthBp > SIGNATURE_STAMP_COORDINATE_SCALE ||
    placement.yBp + placement.heightBp > SIGNATURE_STAMP_COORDINATE_SCALE
  ) {
    throw new Error(
      `A posição do carimbo de ${stampRoleLabel(stamp.role)} é inválida.`,
    );
  }
};

export const formatSignatureStampDateTime = (
  signedAt: string,
  timeZone: string,
) => {
  if (!SIGNED_AT_WITH_SECONDS_PATTERN.test(String(signedAt || ""))) {
    throw new Error(
      "A data da assinatura precisa conter segundos e offset explícito.",
    );
  }
  const instant = new Date(signedAt);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("A data da assinatura é inválida.");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new Error("O fuso horário da assinatura é inválido.");
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const displayedUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((displayedUtc - instant.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} UTC${sign}${offsetHours}:${offsetRemainder} (${timeZone})`;
};

export const prepareContentLayout = (
  contentLayout: ElectronicSignatureStampContentLayout,
) => {
  if (!contentLayout || typeof contentLayout !== "object") {
    throw new Error("A distribuição interna do carimbo não foi informada.");
  }
  const keys = [
    "sealScalePercent",
    "lineSpacingPercent",
    "qrScalePercent",
  ] as const;
  keys.forEach((key) => {
    const value = contentLayout[key];
    const limit = ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS[key];
    if (
      !Number.isInteger(value) || value < limit.min || value > limit.max ||
      value % limit.step !== 0
    ) {
      throw new Error(`O ajuste ${key} do carimbo é inválido.`);
    }
  });
  return { ...contentLayout };
};

export const toPlacementContract = (stamp: AppliedSignatureStamp) => ({
  pageTarget: "LAST_PAGE" as const,
  coordinateSpace: stamp.placement.coordinateSpace,
  xBp: stamp.placement.xBp,
  yBp: stamp.placement.yBp,
  widthBp: stamp.placement.widthBp,
  heightBp: stamp.placement.heightBp,
});

export const prepareStamps = (
  stamps: readonly AppliedSignatureStamp[],
  verificationUrl: string,
) => {
  if (
    !Array.isArray(stamps) || stamps.length < 1 ||
    stamps.length > ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS.maxSigners
  ) {
    throw new Error(
      "A quantidade de carimbos excede a capacidade segura do modelo global.",
    );
  }
  stamps.forEach(assertPlacement);
  for (let leftIndex = 0; leftIndex < stamps.length; leftIndex += 1) {
    const left = toPlacementContract(stamps[leftIndex]);
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < stamps.length;
      rightIndex += 1
    ) {
      const right = toPlacementContract(stamps[rightIndex]);
      if (
        left.xBp < right.xBp + right.widthBp &&
        left.xBp + left.widthBp > right.xBp &&
        left.yBp < right.yBp + right.heightBp &&
        left.yBp + left.heightBp > right.yBp
      ) {
        throw new Error("Os carimbos automáticos não podem se sobrepor.");
      }
    }
  }
  const canonicalVerificationUrl = validateCanonicalVerificationUrl(
    verificationUrl,
  );
  const prepared = stamps.map((stamp) => ({
    ...stamp,
    role: assertSafeSingleLine(stamp.role, "O papel do signatário", 80),
    participantId: (() => {
      if (!UUID_PATTERN.test(stamp.participantId)) {
        throw new Error(
          "O identificador do participante do carimbo é inválido.",
        );
      }
      return stamp.participantId;
    })(),
    signerName: assertSafeSingleLine(
      stamp.signerName,
      "O nome do signatário",
      160,
    ),
    signerCpfMasked: assertSafeSingleLine(
      stamp.signerCpfMasked,
      "O CPF mascarado do signatário",
      14,
    ),
    signatureHash: assertSafeSingleLine(
      stamp.signatureHash,
      "O hash individual da assinatura",
      64,
    ).toLowerCase(),
    ...prepareIndividualVerification(stamp, canonicalVerificationUrl),
    formattedSignedAt: formatSignatureStampDateTime(
      stamp.signedAt,
      stamp.timeZone,
    ),
  })) as Array<AppliedSignatureStamp & { formattedSignedAt: string }>;
  prepared.forEach((stamp) => {
    if (!MASKED_CPF_PATTERN.test(stamp.signerCpfMasked)) {
      throw new Error(
        "O CPF do carimbo precisa permanecer mascarado no formato NN*.***.**N-NN ou no formato histórico ***.***.***-NN.",
      );
    }
    if (!SHA256_PATTERN.test(stamp.signatureHash)) {
      throw new Error("O hash individual da assinatura é inválido.");
    }
  });
  if (
    new Set(prepared.map((stamp) => stamp.signatureEventId)).size !==
      prepared.length ||
    new Set(prepared.map((stamp) => stamp.signatureHash)).size !==
      prepared.length ||
    new Set(prepared.map((stamp) => stamp.verificationCode)).size !==
      prepared.length ||
    new Set(prepared.map((stamp) => stamp.verificationUrl)).size !==
      prepared.length
  ) {
    throw new Error(
      "Cada carimbo precisa possuir prova e validação públicas individuais.",
    );
  }
  return prepared as readonly PreparedSignatureStamp[];
};

