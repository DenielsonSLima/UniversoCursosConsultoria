const DIGIT_PATTERNS: Record<string, string> = {
  "0": "nnwwn",
  "1": "wnnnw",
  "2": "nwnnw",
  "3": "wwnnn",
  "4": "nnwnw",
  "5": "wnwnn",
  "6": "nwwnn",
  "7": "nnnww",
  "8": "wnnwn",
  "9": "nwnwn",
};

export type BaneseBarcodeBar = { x: number; width: number };

export const buildBaneseInterleaved2of5 = (
  value: unknown,
  narrowWidth = 72 * 0.3 / 25.4,
) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 44 || digits.length % 2 !== 0) {
    throw new Error(
      "Codigo de barras Banese deve possuir 44 digitos para o padrao 2 de 5 intercalado.",
    );
  }
  if (!Number.isFinite(narrowWidth) || narrowWidth <= 0) {
    throw new Error("Modulo estreito do codigo de barras Banese e invalido.");
  }

  const wideWidth = narrowWidth * 3;
  const bars: BaneseBarcodeBar[] = [];
  let x = 0;
  const append = (width: number, draw: boolean) => {
    if (draw) bars.push({ x, width });
    x += width;
  };

  append(narrowWidth, true);
  append(narrowWidth, false);
  append(narrowWidth, true);
  append(narrowWidth, false);

  for (let pairIndex = 0; pairIndex < digits.length; pairIndex += 2) {
    const barPattern = DIGIT_PATTERNS[digits[pairIndex]];
    const spacePattern = DIGIT_PATTERNS[digits[pairIndex + 1]];
    for (let index = 0; index < 5; index += 1) {
      append(barPattern[index] === "w" ? wideWidth : narrowWidth, true);
      append(spacePattern[index] === "w" ? wideWidth : narrowWidth, false);
    }
  }

  append(wideWidth, true);
  append(narrowWidth, false);
  append(narrowWidth, true);

  return {
    value: digits,
    bars,
    width: x,
    narrowWidth,
    wideWidth,
    quietZone: 72 * 5 / 25.4,
  };
};
