import type { BaneseBoletoDocumentInput } from "../types.ts";
import {
  baneseDueDateFactor,
  calculateBaneseAsbaceDoubleDigit,
  calculateBaneseOurNumberDigit,
} from "../bank-fields.ts";

export const BANESE_DOCUMENT_FIXTURE: BaneseBoletoDocumentInput = {
  receivableId: "11111111-1111-4111-8111-111111111111",
  environment: "sandbox",
  digitableLine: "04793303180064900000704681047223515390002000000",
  barcode: "04795153900020000003303100649000000468104722",
  ourNumber: "000004681",
  documentNumber: "HOMOL-TESTE",
  issueDate: "2026-07-16",
  processingDate: "2026-07-16",
  dueDate: "2026-08-15",
  amount: 20_000,
  beneficiary: {
    name: "UNIVERSO CURSOS E CONSULTORIA LTDA",
    document: "13278137000154",
    agency: "033",
    account: "03/100649-0",
    agreement: "15528",
    beneficiaryCode: "03/100649-0",
    wallet: "8",
    address: {
      street: "RUA C, S/N",
      district: "CENTRO",
      city: "JAPOATA",
      state: "SE",
      postalCode: "49950000",
    },
  },
  payer: {
    name: "PAGADOR DE HOMOLOGAÇÃO",
    document: "85742355004",
    address: {
      street: "RUA DE TESTE, 100",
      district: "CENTRO",
      city: "ARACAJU",
      state: "SE",
      postalCode: "49000000",
    },
  },
  speciesCode: 21,
  speciesLabel: "ME",
  acceptance: "A",
  instructions: ["Documento exclusivo para homologação Banese."],
  financialTerms: {
    nominalAmount: 20_000,
    dueDate: "2026-08-15",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 5 },
    penalty: { type: "fixed", value: 5 },
  },
};

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

const generalDigit = (barcode: string) => {
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

const lineFromBarcode = (barcode: string) => {
  const field1 = `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`;
  const field2 = barcode.slice(24, 34);
  const field3 = barcode.slice(34, 44);
  return `${field1}${modulo10Digit(field1)}${field2}${
    modulo10Digit(field2)
  }${field3}${modulo10Digit(field3)}${barcode[4]}${barcode.slice(5, 19)}`;
};

export const baneseDocumentFixtureAt = (
  index: number,
  dueDate = BANESE_DOCUMENT_FIXTURE.dueDate,
  nominalAmount = BANESE_DOCUMENT_FIXTURE.amount,
): BaneseBoletoDocumentInput => {
  const numberWithoutDigit = String(468 + index).padStart(8, "0");
  const ourNumber = `${numberWithoutDigit}${
    calculateBaneseOurNumberDigit(
      BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
      numberWithoutDigit,
    )
  }`;
  const account = BANESE_DOCUMENT_FIXTURE.beneficiary.account.replace(
    /\D/g,
    "",
  );
  const asbaceBase = `${
    BANESE_DOCUMENT_FIXTURE.beneficiary.agency.slice(-2)
  }${account}${ourNumber}047`;
  const freeField = `${asbaceBase}${
    calculateBaneseAsbaceDoubleDigit(asbaceBase)
  }`;
  const amount = String(
    Math.round(nominalAmount * 100),
  ).padStart(10, "0");
  const withPlaceholder = `04790${
    baneseDueDateFactor(dueDate)
  }${amount}${freeField}`;
  const barcode = `${withPlaceholder.slice(0, 4)}${
    generalDigit(withPlaceholder)
  }${withPlaceholder.slice(5)}`;
  return {
    ...BANESE_DOCUMENT_FIXTURE,
    receivableId: `11111111-1111-4111-8111-${
      String(index + 1).padStart(12, "0")
    }`,
    documentNumber: `PARC-${String(index + 1).padStart(2, "0")}`,
    ourNumber,
    dueDate,
    amount: nominalAmount,
    financialTerms: BANESE_DOCUMENT_FIXTURE.financialTerms
      ? {
        ...BANESE_DOCUMENT_FIXTURE.financialTerms,
        nominalAmount,
        dueDate,
      }
      : null,
    barcode,
    digitableLine: lineFromBarcode(barcode),
  };
};
