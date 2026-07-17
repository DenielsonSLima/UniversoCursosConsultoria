const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const modulo10Digit = (value: string) => {
  let weight = 2;
  let total = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const product = Number(value[index]) * weight;
    total += product > 9 ? product - 9 : product;
    weight = weight === 2 ? 1 : 2;
  }
  return String((10 - (total % 10)) % 10);
};

const barcodeGeneralDigit = (barcode: string) => {
  let weight = 2;
  let total = 0;
  for (let index = barcode.length - 1; index >= 0; index -= 1) {
    if (index === 4) continue;
    total += Number(barcode[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = total % 11;
  return String(remainder < 2 ? 1 : 11 - remainder);
};

export const barcodeFromBaneseDigitableLine = (value: unknown) => {
  const line = onlyDigits(value);
  if (line.length !== 47) {
    throw new Error("Linha digitavel Banese deve possuir 47 digitos.");
  }
  return `${line.slice(0, 4)}${line[32]}${line.slice(33)}${line.slice(4, 9)}${
    line.slice(10, 20)
  }${line.slice(21, 31)}`;
};

export const assertBaneseBankNumbers = (
  digitableLineValue: unknown,
  barcodeValue: unknown,
) => {
  const digitableLine = onlyDigits(digitableLineValue);
  const barcode = onlyDigits(barcodeValue);
  if (digitableLine.length !== 47) {
    throw new Error("Linha digitavel Banese deve possuir 47 digitos.");
  }
  if (barcode.length !== 44) {
    throw new Error("Codigo de barras Banese deve possuir 44 digitos.");
  }
  if (!digitableLine.startsWith("0479") || !barcode.startsWith("0479")) {
    throw new Error(
      "Documento nao pertence ao banco Banese 047 em moeda Real.",
    );
  }
  if (barcodeFromBaneseDigitableLine(digitableLine) !== barcode) {
    throw new Error(
      "Linha digitavel e codigo de barras Banese nao representam o mesmo titulo.",
    );
  }

  const fields = [
    [digitableLine.slice(0, 9), digitableLine[9]],
    [digitableLine.slice(10, 20), digitableLine[20]],
    [digitableLine.slice(21, 31), digitableLine[31]],
  ];
  for (const [field, digit] of fields) {
    if (modulo10Digit(field) !== digit) {
      throw new Error(
        "Digito verificador de campo da linha digitavel Banese e invalido.",
      );
    }
  }
  if (barcodeGeneralDigit(barcode) !== barcode[4]) {
    throw new Error(
      "Digito geral modulo 11 do codigo de barras Banese e invalido.",
    );
  }
  return { digitableLine, barcode };
};

const dayNumber = (isoDate: string) =>
  Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

export const baneseDueDateFactor = (dueDate: string) => {
  const legacyStart = "2000-07-03";
  const legacyEnd = "2025-02-21";
  const currentStart = "2025-02-22";
  const currentEnd = "2049-10-13";

  if (dueDate >= legacyStart && dueDate <= legacyEnd) {
    return String(dayNumber(dueDate) - dayNumber("1997-10-07")).padStart(
      4,
      "0",
    );
  }
  if (dueDate >= currentStart && dueDate <= currentEnd) {
    return String(1000 + dayNumber(dueDate) - dayNumber(currentStart)).padStart(
      4,
      "0",
    );
  }
  throw new Error(
    "Data de vencimento fora dos ciclos de fator FEBRABAN documentados.",
  );
};

export const assertBaneseDueDateFactor = (
  barcode: string,
  dueDate: string,
) => {
  const expected = baneseDueDateFactor(dueDate);
  if (barcode.slice(5, 9) !== expected) {
    throw new Error(
      "Fator de vencimento do codigo de barras diverge da data de vencimento.",
    );
  }
};

export const calculateBaneseOurNumberDigit = (
  agency: string,
  numberWithoutDigit: string,
) => {
  const value = `${onlyDigits(agency).padStart(3, "0").slice(-3)}${
    onlyDigits(numberWithoutDigit)
  }`;
  if (value.length !== 11) {
    throw new Error("Base do Nosso Numero Banese deve possuir 11 digitos.");
  }
  let total = 0;
  let weight = 2;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    total += Number(value[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = total % 11;
  return String(remainder < 2 ? 0 : 11 - remainder);
};

export const calculateBaneseAsbaceDoubleDigit = (baseValue: string) => {
  const base = onlyDigits(baseValue);
  if (base.length !== 23) {
    throw new Error("Base da chave ASBACE Banese deve possuir 23 digitos.");
  }

  let modulo10Total = 0;
  for (let index = 0; index < base.length; index += 1) {
    const product = Number(base[index]) * (index % 2 === 0 ? 2 : 1);
    modulo10Total += product > 9 ? product - 9 : product;
  }
  let firstDigit = (10 - (modulo10Total % 10)) % 10;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let modulo11Total = 0;
    let weight = 2;
    const value = `${base}${firstDigit}`;
    for (let index = value.length - 1; index >= 0; index -= 1) {
      modulo11Total += Number(value[index]) * weight;
      weight = weight === 7 ? 2 : weight + 1;
    }
    const remainder = modulo11Total % 11;
    if (remainder === 1) {
      firstDigit = (firstDigit + 1) % 10;
      continue;
    }
    return `${firstDigit}${remainder === 0 ? 0 : 11 - remainder}`;
  }
  throw new Error("Nao foi possivel calcular o duplo digito ASBACE Banese.");
};

export const assertBaneseAsbaceField = (
  barcode: string,
  input: { agency: string; account: string; ourNumber: string },
) => {
  const agency = onlyDigits(input.agency).padStart(3, "0").slice(-3);
  const account = onlyDigits(input.account);
  const ourNumber = onlyDigits(input.ourNumber);
  if (account.length !== 9) {
    throw new Error("Conta do beneficiario Banese deve possuir 9 digitos.");
  }
  if (ourNumber.length !== 9) {
    throw new Error("Nosso Numero Banese deve possuir 9 digitos.");
  }
  if (
    calculateBaneseOurNumberDigit(agency, ourNumber.slice(0, 8)) !==
      ourNumber[8]
  ) {
    throw new Error("Digito verificador do Nosso Numero Banese e invalido.");
  }

  const field = barcode.slice(19, 44);
  const base = `${agency.slice(-2)}${account}${ourNumber}047`;
  if (field.slice(0, 2) !== agency.slice(-2)) {
    throw new Error("Agencia diverge da chave ASBACE do codigo de barras.");
  }
  if (field.slice(2, 11) !== account) {
    throw new Error("Conta diverge da chave ASBACE do codigo de barras.");
  }
  if (field.slice(11, 20) !== ourNumber) {
    throw new Error(
      "Nosso Numero diverge da chave ASBACE do codigo de barras.",
    );
  }
  if (field.slice(20, 23) !== "047") {
    throw new Error("Banco da chave ASBACE do codigo de barras nao e 047.");
  }
  if (field.slice(23, 25) !== calculateBaneseAsbaceDoubleDigit(base)) {
    throw new Error("Duplo digito da chave ASBACE Banese e invalido.");
  }
};
