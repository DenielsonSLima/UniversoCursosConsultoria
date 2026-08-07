export type BanesePixDocumentData = {
  copyAndPaste: string;
  qrCodeBase64: string;
  txid?: string | null;
};

type EmvField = {
  id: string;
  value: string;
};

const parseEmvFields = (value: string, fieldName: string): EmvField[] => {
  const fields: EmvField[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (cursor + 4 > value.length) {
      throw new Error(`${fieldName} possui estrutura TLV incompleta.`);
    }
    const id = value.slice(cursor, cursor + 2);
    const lengthText = value.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) {
      throw new Error(
        `${fieldName} possui identificador ou tamanho TLV invalido.`,
      );
    }
    const length = Number(lengthText);
    const start = cursor + 4;
    const end = start + length;
    if (end > value.length) {
      throw new Error(`${fieldName} possui tamanho TLV divergente.`);
    }
    fields.push({ id, value: value.slice(start, end) });
    cursor = end;
  }

  return fields;
};

const crc16Ccitt = (value: string) => {
  let result = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result & 0x8000) !== 0
        ? ((result << 1) ^ 0x1021) & 0xffff
        : (result << 1) & 0xffff;
    }
  }
  return result.toString(16).toUpperCase().padStart(4, "0");
};

const findSingleField = (fields: EmvField[], id: string) => {
  const matches = fields.filter((field) => field.id === id);
  if (matches.length > 1) {
    throw new Error(`Pix copia e cola Banese possui campo ${id} duplicado.`);
  }
  return matches[0]?.value ?? null;
};

export const normalizeBanesePixPayload = (
  value: unknown,
  expectedAmount: number,
) => {
  const payload = String(value ?? "").trim();
  if (
    payload.length < 30 || payload.length > 600 ||
    !/^[\x20-\x7E]+$/.test(payload)
  ) {
    throw new Error(
      "Pix copia e cola Banese possui formato ou tamanho invalido.",
    );
  }
  const checksumMatch = payload.match(/6304([0-9A-F]{4})$/i);
  if (!checksumMatch) {
    throw new Error("Pix copia e cola Banese nao possui CRC EMV valido.");
  }
  if (crc16Ccitt(payload.slice(0, -4)) !== checksumMatch[1].toUpperCase()) {
    throw new Error("CRC do Pix copia e cola Banese nao confere.");
  }

  const fields = parseEmvFields(payload, "Pix copia e cola Banese");
  if (fields[0]?.id !== "00" || findSingleField(fields, "00") !== "01") {
    throw new Error("Pix copia e cola Banese nao usa a versao EMV esperada.");
  }
  if (
    findSingleField(fields, "53") !== "986" ||
    findSingleField(fields, "58") !== "BR"
  ) {
    throw new Error(
      "Pix copia e cola Banese nao representa uma cobranca Pix brasileira em reais.",
    );
  }
  const crcFields = fields.filter((field) => field.id === "63");
  if (crcFields.length !== 1 || fields.at(-1)?.id !== "63") {
    throw new Error(
      "CRC do Pix copia e cola Banese deve ser o ultimo campo EMV.",
    );
  }

  const hasPixGui = fields
    .filter((field) => Number(field.id) >= 26 && Number(field.id) <= 51)
    .some((field) => {
      try {
        return findSingleField(
          parseEmvFields(field.value, "Conta Pix Banese"),
          "00",
        )?.toUpperCase() ===
          "BR.GOV.BCB.PIX";
      } catch {
        return false;
      }
    });
  if (!hasPixGui) {
    throw new Error(
      "Pix copia e cola Banese nao contem o identificador BR.GOV.BCB.PIX.",
    );
  }

  const amountText = findSingleField(fields, "54");
  if (amountText) {
    const payloadAmount = Number(amountText);
    if (
      !/^\d{1,10}(?:\.\d{2})?$/.test(amountText) ||
      !Number.isFinite(payloadAmount) ||
      Math.round(payloadAmount * 100) !== Math.round(expectedAmount * 100)
    ) {
      throw new Error(
        "Valor do Pix diverge do valor nominal do boleto Banese.",
      );
    }
  }

  return { payload, fields };
};

export const normalizeBanesePixQrImage = (value: unknown) => {
  const candidate = String(value ?? "").trim();
  const dataImage = candidate.match(
    /^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/=\s]+)$/i,
  );
  const mime = dataImage?.[1]?.toLowerCase() === "jpg"
    ? "jpeg"
    : dataImage?.[1]?.toLowerCase();
  const compact = (dataImage?.[2] ?? candidate).replace(/\s+/g, "");
  if (
    compact.length < 32 || compact.length > 1_500_000 ||
    !/^[a-z0-9+/]+={0,2}$/i.test(compact)
  ) {
    throw new Error("Imagem QR Pix Banese deve ser PNG ou JPEG em base64.");
  }
  const detectedMime = compact.startsWith("iVBORw0KGgo")
    ? "png"
    : compact.startsWith("/9j/")
    ? "jpeg"
    : null;
  if (!detectedMime || (mime && mime !== detectedMime)) {
    throw new Error("Assinatura da imagem QR Pix Banese nao confere.");
  }
  return `data:image/${detectedMime};base64,${compact}`;
};

export const normalizeBanesePixDocumentData = (
  input: BanesePixDocumentData,
  expectedAmount: number,
): BanesePixDocumentData => {
  const { payload, fields } = normalizeBanesePixPayload(
    input.copyAndPaste,
    expectedAmount,
  );
  const txid = String(input.txid ?? "").trim() || null;
  if (txid && txid.length > 35) {
    throw new Error("TXID Pix Banese excede 35 caracteres.");
  }
  const additionalData = findSingleField(fields, "62");
  const payloadTxid = additionalData
    ? findSingleField(
      parseEmvFields(additionalData, "Dados adicionais Pix Banese"),
      "05",
    )
    : null;
  if (txid && payloadTxid && txid !== payloadTxid) {
    throw new Error("TXID informado diverge do Pix copia e cola Banese.");
  }

  return {
    copyAndPaste: payload,
    qrCodeBase64: normalizeBanesePixQrImage(input.qrCodeBase64),
    txid: txid ?? payloadTxid,
  };
};
