export const CNAB240_RECORD_LENGTH = 240;

export type Cnab240Line = {
  lineNumber: number;
  text: string;
  byteLength: number | null;
};

const WINDOWS_1252_BYTES = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const WINDOWS_1252_CODE_POINTS = new Map<number, number>(
  [...WINDOWS_1252_BYTES.entries()].map((
    [codePoint, byte],
  ) => [byte, codePoint]),
);

const toWindows1252Byte = (codePoint: number) => {
  if (codePoint <= 0xff) return codePoint;
  return WINDOWS_1252_BYTES.get(codePoint) ?? null;
};

/**
 * Encodes the one-byte ANSI representation required by the Banese CNAB240
 * manual. It rejects characters that cannot be represented in Windows-1252.
 */
export const encodeCnab240Ansi = (value: string) => {
  const bytes: number[] = [];
  for (const character of String(value ?? "")) {
    const codePoint = character.codePointAt(0) ?? 0;
    const byte = toWindows1252Byte(codePoint);
    if (byte === null) {
      throw new Error(
        `Caractere U+${
          codePoint.toString(16).toUpperCase().padStart(4, "0")
        } ` +
          "nao pode ser representado em ANSI/Windows-1252.",
      );
    }
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
};

export const decodeCnab240Ansi = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) {
    const codePoint = WINDOWS_1252_CODE_POINTS.get(byte) ?? byte;
    value += String.fromCodePoint(codePoint);
  }
  return value;
};

export const cnab240ByteLength = (value: string) => {
  try {
    return encodeCnab240Ansi(value).length;
  } catch (_error) {
    return null;
  }
};

/** Splits CRLF, LF or CR files without counting the final line ending as a record. */
export const splitCnab240Lines = (payload: string): Cnab240Line[] => {
  const parts = String(payload ?? "").split(/\r\n|\n|\r/);
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts.map((text, index) => ({
    lineNumber: index + 1,
    text,
    byteLength: cnab240ByteLength(text),
  }));
};

/** Positions are one-based and inclusive, matching the CNAB manual. */
export const cnab240Field = (line: string, start: number, end: number) => {
  if (
    !Number.isInteger(start) || !Number.isInteger(end) || start < 1 ||
    end < start
  ) {
    throw new Error("Faixa CNAB240 invalida.");
  }
  return line.slice(start - 1, end);
};

export const encodeCnab240File = (
  records: string[],
  lineEnding: "\r\n" | "\n" = "\r\n",
) => {
  if (!records.length) throw new Error("Arquivo CNAB240 sem registros.");
  records.forEach((record, index) => {
    if (/[\r\n]/.test(record)) {
      throw new Error(
        `Registro CNAB240 ${index + 1} contem quebra de linha interna.`,
      );
    }
    const byteLength = cnab240ByteLength(record);
    if (byteLength !== CNAB240_RECORD_LENGTH) {
      const detail = byteLength === null ? "nao ANSI" : `${byteLength} bytes`;
      throw new Error(
        `Registro CNAB240 ${
          index + 1
        } invalido: ${detail}; esperado 240 bytes.`,
      );
    }
  });
  return encodeCnab240Ansi(`${records.join(lineEnding)}${lineEnding}`);
};
