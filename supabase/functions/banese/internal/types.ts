import {
  assertBaneseAsbaceField,
  assertBaneseBankNumbers,
  assertBaneseDueDateFactor,
  barcodeFromBaneseDigitableLine,
} from "./bank-fields.ts";
import {
  type BanesePixDocumentData,
  normalizeBanesePixDocumentData,
} from "./pix-validation.ts";
import {
  type BaneseFinancialTermsInput,
  normalizeBaneseFinancialTerms,
} from "./financial-terms.ts";

export type { BanesePixDocumentData } from "./pix-validation.ts";

export { assertBaneseBankNumbers, barcodeFromBaneseDigitableLine };

export type BaneseDocumentAddress = {
  street: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
};

export type BaneseDocumentParty = {
  name: string;
  document: string;
  address: BaneseDocumentAddress;
};

export type BaneseDocumentBranding = {
  bankLogoBase64?: string | null;
  companyLogoBase64?: string | null;
};

export type BaneseBoletoDocumentInput = {
  receivableId: string;
  environment: "sandbox" | "production";
  digitableLine: string;
  barcode: string;
  ourNumber: string;
  documentNumber: string;
  issueDate: string;
  processingDate: string;
  dueDate: string;
  amount: number;
  installment?: {
    current: number;
    total: number;
  } | null;
  beneficiary: BaneseDocumentParty & {
    agency: string;
    account: string;
    agreement: string;
    /**
     * Codigo confirmado pelo Banese para impressao no boleto. Ele deve ser
     * informado explicitamente e nunca e inferido a partir da conta.
     */
    beneficiaryCode: string;
    wallet?: string | null;
  };
  payer: BaneseDocumentParty;
  speciesCode?: number | null;
  speciesLabel?: string | null;
  acceptance?: "A" | "N";
  instructions?: string[];
  financialTerms?: BaneseFinancialTermsInput | null;
  pix?: BanesePixDocumentData | null;
};

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const assertText = (value: unknown, field: string, maxLength: number) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${field} e obrigatorio no documento Banese.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(
      `${field} excede ${maxLength} caracteres no documento Banese.`,
    );
  }
  return normalized;
};

const assertIsoDate = (value: unknown, field: string) => {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} deve estar no formato YYYY-MM-DD.`);
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    year < 1 || month < 1 || month > 12 || day < 1 ||
    day > daysByMonth[month - 1]
  ) {
    throw new Error(`${field} nao representa uma data de calendario valida.`);
  }
  return normalized;
};

const normalizeInstallment = (
  value: BaneseBoletoDocumentInput["installment"],
) => {
  if (!value) return null;
  const current = Number(value.current);
  const total = Number(value.total);
  if (
    !Number.isInteger(current) || current <= 0 ||
    !Number.isInteger(total) || total <= 0 ||
    current > total
  ) {
    throw new Error(
      "Parcela do documento Banese deve informar posicao e total validos.",
    );
  }
  return { current, total };
};

const normalizeAddress = (
  value: BaneseDocumentAddress,
  prefix: string,
): BaneseDocumentAddress => {
  const postalCode = onlyDigits(value?.postalCode);
  const state = String(value?.state || "").trim().toUpperCase();
  if (postalCode.length !== 8) {
    throw new Error(`CEP do ${prefix} deve possuir 8 digitos.`);
  }
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error(`UF do ${prefix} deve possuir 2 letras.`);
  }
  return {
    street: assertText(value?.street, `Endereco do ${prefix}`, 100),
    district: assertText(value?.district, `Bairro do ${prefix}`, 40),
    city: assertText(value?.city, `Cidade do ${prefix}`, 40),
    state,
    postalCode,
  };
};

export const normalizeBaneseBoletoDocument = (
  input: BaneseBoletoDocumentInput,
): BaneseBoletoDocumentInput => {
  if (!(["sandbox", "production"] as const).includes(input.environment)) {
    throw new Error("Ambiente do documento Banese e invalido.");
  }
  const bankNumbers = assertBaneseBankNumbers(
    input.digitableLine,
    input.barcode,
  );
  const dueDate = assertIsoDate(input.dueDate, "Data de vencimento");
  const ourNumber = onlyDigits(input.ourNumber);
  if (ourNumber.length !== 9) {
    throw new Error("Nosso Numero Banese deve possuir 9 digitos.");
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valor do documento Banese deve ser maior que zero.");
  }
  if (amount > 99_999_999.99) {
    throw new Error(
      "Valor do documento Banese excede o limite de 10 posicoes do codigo de barras.",
    );
  }
  const barcodeAmount = Number(bankNumbers.barcode.slice(9, 19)) / 100;
  if (Math.abs(barcodeAmount - amount) > 0.001) {
    throw new Error(
      "Valor nominal diverge do valor codificado no retorno Banese.",
    );
  }

  const beneficiaryDocument = onlyDigits(input.beneficiary?.document);
  const payerDocument = onlyDigits(input.payer?.document);
  if (![11, 14].includes(beneficiaryDocument.length)) {
    throw new Error("CPF/CNPJ do beneficiario Banese e invalido.");
  }
  if (![11, 14].includes(payerDocument.length)) {
    throw new Error("CPF/CNPJ do pagador Banese e invalido.");
  }
  const beneficiaryAgency = onlyDigits(input.beneficiary?.agency)
    .padStart(3, "0").slice(-3);
  if (beneficiaryAgency === "000") {
    throw new Error("Agencia do beneficiario Banese e invalida.");
  }
  const beneficiaryCode = assertText(
    input.beneficiary?.beneficiaryCode,
    "Codigo do beneficiario Banese",
    20,
  );
  const beneficiaryAccount = assertText(
    input.beneficiary?.account,
    "Conta do beneficiario",
    20,
  );
  assertBaneseDueDateFactor(bankNumbers.barcode, dueDate);
  assertBaneseAsbaceField(bankNumbers.barcode, {
    agency: beneficiaryAgency,
    account: beneficiaryAccount,
    ourNumber,
  });
  const pix = input.environment === "production" && input.pix
    ? normalizeBanesePixDocumentData(input.pix, amount)
    : null;
  const instructions = (input.instructions || [])
    .map((instruction) => String(instruction || "").trim())
    .filter(Boolean);
  if (instructions.length > 5) {
    throw new Error("O boleto Banese aceita no máximo 5 instruções.");
  }

  return {
    ...input,
    receivableId: assertText(
      input.receivableId,
      "Identificador do recebivel",
      64,
    ),
    digitableLine: bankNumbers.digitableLine,
    barcode: bankNumbers.barcode,
    ourNumber,
    documentNumber: assertText(input.documentNumber, "Numero do documento", 15),
    issueDate: assertIsoDate(input.issueDate, "Data do documento"),
    processingDate: assertIsoDate(
      input.processingDate,
      "Data de processamento",
    ),
    dueDate,
    amount: Number(amount.toFixed(2)),
    installment: normalizeInstallment(input.installment),
    beneficiary: {
      ...input.beneficiary,
      name: assertText(input.beneficiary?.name, "Nome do beneficiario", 80),
      document: beneficiaryDocument,
      address: normalizeAddress(input.beneficiary?.address, "beneficiario"),
      agency: beneficiaryAgency,
      account: beneficiaryAccount,
      agreement: assertText(
        input.beneficiary?.agreement,
        "Convenio Banese",
        20,
      ),
      beneficiaryCode,
      wallet: String(input.beneficiary?.wallet || "").trim() || null,
    },
    payer: {
      ...input.payer,
      name: assertText(input.payer?.name, "Nome do pagador", 80),
      document: payerDocument,
      address: normalizeAddress(input.payer?.address, "pagador"),
    },
    speciesCode: Number.isInteger(Number(input.speciesCode))
      ? Number(input.speciesCode)
      : null,
    speciesLabel: String(input.speciesLabel || "DM").trim().slice(0, 8),
    acceptance: input.acceptance === "N" ? "N" : "A",
    instructions,
    financialTerms: input.financialTerms
      ? normalizeBaneseFinancialTerms({
        ...input.financialTerms,
        nominalAmount: amount,
        dueDate,
      })
      : null,
    // O Banese informou que o Pix nao opera na homologacao. Qualquer payload
    // recebido nesse ambiente e descartado para impedir QR/copia-e-cola
    // acidentalmente escaneavel no documento de teste.
    pix,
  };
};

export const formatBaneseDigitableLine = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length !== 47) return digits;
  return `${digits.slice(0, 5)}.${digits.slice(5, 10)} ${
    digits.slice(10, 15)
  }.${digits.slice(15, 21)} ${digits.slice(21, 26)}.${digits.slice(26, 32)} ${
    digits[32]
  } ${digits.slice(33)}`;
};

export const formatBaneseDocumentDate = (value: unknown) => {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};

export const formatBaneseDocumentAmount = (value: unknown) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatBaneseDocumentId = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return digits;
};
