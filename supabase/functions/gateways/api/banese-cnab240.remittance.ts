import type {
  BaneseFinancialTermsInput,
  NormalizedBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import { normalizeBaneseFinancialTerms } from "../../banese/internal/financial-terms.ts";
import { calculateBaneseNossoNumero } from "../../banese/core/adapter/utils.ts";
import {
  cnab240ByteLength,
  encodeCnab240File,
} from "./banese-cnab240.codec.ts";

const BANK_CODE = "047";
const FILE_LAYOUT = "101";
const LOT_LAYOUT = "060";
const SERVICE_LOT = "0001";
const MAX_TITLES = 99_999;
const DOCUMENT_SPECIES = new Set([
  "02",
  "04",
  "08",
  "09",
  "10",
  "11",
  "12",
  "17",
  "20",
  "21",
  "22",
  "23",
  "99",
]);

export type BaneseCnab240RegistrationType = "CNAB240_NEW_TITLE";

export type BaneseCnab240BeneficiaryInput = {
  name: string;
  document: string;
  agency: string;
  agencyDigit?: string | null;
  accountNumber?: string | null;
  accountDigit?: string | null;
};

export type BaneseCnab240PayerInput = {
  name: string;
  document: string;
  address: string;
  district: string;
  postalCode: string;
  city: string;
  state: string;
};

export type BaneseCnab240RemittanceTitleInput = {
  entryType: BaneseCnab240RegistrationType;
  registeredByApi: false;
  ourNumber: string;
  documentNumber: string;
  companyControlNumber: string;
  documentSpecies: string | number;
  issueDate: string;
  writeOffDays: number;
  payer: BaneseCnab240PayerInput;
  financialTerms: BaneseFinancialTermsInput;
};

export type BaneseCnab240RemittanceInput = {
  edi7: string;
  agreement: string;
  nsa: number;
  generatedAt?: string | Date;
  beneficiary: BaneseCnab240BeneficiaryInput;
  titles: BaneseCnab240RemittanceTitleInput[];
};

export type BaneseCnab240RemittanceResult = {
  fileName: string;
  records: string[];
  bytes: Uint8Array;
  titleCount: number;
  recordCount: number;
  totalAmount: number;
};

type NormalizedBeneficiary = {
  name: string;
  document: string;
  registrationType: "1" | "2";
  agency: string;
  agencyDigit: string;
  accountNumber: string;
  accountDigit: string;
};

type NormalizedPayer = BaneseCnab240PayerInput & {
  document: string;
  registrationType: "1" | "2";
  postalCode: string;
  state: string;
};

type NormalizedTitle =
  & Omit<
    BaneseCnab240RemittanceTitleInput,
    "documentSpecies" | "financialTerms" | "payer"
  >
  & {
    documentSpecies: string;
    financialTerms: NormalizedBaneseFinancialTerms;
    payer: NormalizedPayer;
  };

const blankRecord = () => " ".repeat(240);
const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const requiredText = (value: unknown, field: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} e obrigatorio.`);
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${field} nao pode conter quebra de linha.`);
  }
  return normalized;
};

const alphaField = (value: unknown, width: number, field: string) => {
  const normalized = String(value ?? "");
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${field} nao pode conter quebra de linha.`);
  }
  const byteLength = cnab240ByteLength(normalized);
  if (byteLength === null) {
    throw new Error(`${field} contem caractere fora de ANSI/Windows-1252.`);
  }
  if (byteLength > width) {
    throw new Error(`${field} excede ${width} bytes.`);
  }
  return normalized.padEnd(width, " ");
};

const numericField = (value: unknown, width: number, field: string) => {
  const normalized = String(value ?? "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${field} deve conter somente digitos.`);
  }
  if (normalized.length > width) {
    throw new Error(`${field} excede ${width} digitos.`);
  }
  return normalized.padStart(width, "0");
};

const put = (
  record: string,
  start: number,
  end: number,
  value: string,
) => record.slice(0, start - 1) + value + record.slice(end);

const putAlpha = (
  record: string,
  start: number,
  end: number,
  value: unknown,
  field: string,
) => put(record, start, end, alphaField(value, end - start + 1, field));

const putNumeric = (
  record: string,
  start: number,
  end: number,
  value: unknown,
  field: string,
) => put(record, start, end, numericField(value, end - start + 1, field));

const assertIsoDate = (value: unknown, field: string) => {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} deve estar no formato YYYY-MM-DD.`);
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${field} nao representa uma data valida.`);
  }
  return normalized;
};

const toDDMMYYYY = (isoDate: string) =>
  `${isoDate.slice(8, 10)}${isoDate.slice(5, 7)}${isoDate.slice(0, 4)}`;

const baneseDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    isoDate: `${year}-${month}-${day}`,
    fileDate: `${year}${month}${day}`,
    time: `${get("hour")}${get("minute")}${get("second")}`,
  };
};

const decimalField = (
  value: number,
  width: number,
  field: string,
) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} deve ser um numero finito nao negativo.`);
  }
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-7) {
    throw new Error(`${field} deve possuir no maximo duas casas decimais.`);
  }
  return numericField(String(rounded), width, field);
};

const normalizeDocument = (value: unknown, field: string) => {
  const document = onlyDigits(value);
  if (![11, 14].includes(document.length)) {
    throw new Error(`${field} deve possuir CPF com 11 ou CNPJ com 14 digitos.`);
  }
  return {
    document,
    registrationType: (document.length === 11 ? "1" : "2") as "1" | "2",
  };
};

const normalizeBeneficiary = (
  input: BaneseCnab240BeneficiaryInput,
): NormalizedBeneficiary => {
  if (!input || typeof input !== "object") {
    throw new Error("Beneficiario da remessa e obrigatorio.");
  }
  const registration = normalizeDocument(
    input.document,
    "Documento do beneficiario",
  );
  const agency = onlyDigits(input.agency);
  if (
    !/^\d{1,5}$/.test(agency) || Number(agency) === 0 || Number(agency) > 999
  ) {
    throw new Error(
      "Agencia Banese deve representar codigo de 1 a 3 digitos, com zeros opcionais.",
    );
  }
  const accountNumber = input.accountNumber == null
    ? "0"
    : onlyDigits(input.accountNumber);
  if (!/^\d{1,12}$/.test(accountNumber)) {
    throw new Error("Conta do beneficiario deve possuir de 1 a 12 digitos.");
  }
  const agencyDigit = input.agencyDigit == null
    ? ""
    : requiredText(input.agencyDigit, "DV da agencia");
  const accountDigit = input.accountDigit == null
    ? ""
    : requiredText(input.accountDigit, "DV da conta");
  alphaField(agencyDigit, 1, "DV da agencia");
  alphaField(accountDigit, 1, "DV da conta");
  const name = requiredText(input.name, "Nome do beneficiario");
  alphaField(name, 30, "Nome do beneficiario");
  return {
    name,
    ...registration,
    agency,
    agencyDigit,
    accountNumber,
    accountDigit,
  };
};

const normalizePayer = (input: BaneseCnab240PayerInput): NormalizedPayer => {
  if (!input || typeof input !== "object") {
    throw new Error("Pagador da remessa e obrigatorio.");
  }
  const registration = normalizeDocument(
    input.document,
    "Documento do pagador",
  );
  const name = requiredText(input.name, "Nome do pagador");
  const address = requiredText(input.address, "Endereco do pagador");
  const district = requiredText(input.district, "Bairro do pagador");
  const city = requiredText(input.city, "Cidade do pagador");
  const postalCode = onlyDigits(input.postalCode);
  const state = requiredText(input.state, "UF do pagador").toUpperCase();
  if (!/^\d{8}$/.test(postalCode)) {
    throw new Error("CEP do pagador deve possuir exatamente 8 digitos.");
  }
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("UF do pagador deve possuir duas letras ASCII.");
  }
  alphaField(name, 40, "Nome do pagador");
  alphaField(address, 40, "Endereco do pagador");
  alphaField(district, 15, "Bairro do pagador");
  alphaField(city, 15, "Cidade do pagador");
  return {
    ...input,
    ...registration,
    name,
    address,
    district,
    city,
    postalCode,
    state,
  };
};

const normalizeTitle = (
  input: BaneseCnab240RemittanceTitleInput,
  beneficiary: NormalizedBeneficiary,
): NormalizedTitle => {
  if (!input || typeof input !== "object") {
    throw new Error("Titulo da remessa e obrigatorio.");
  }
  if (input.entryType !== "CNAB240_NEW_TITLE") {
    throw new Error("Titulo deve declarar entrada CNAB240_NEW_TITLE.");
  }
  if (input.registeredByApi !== false) {
    throw new Error(
      "Titulo registrado ou possivelmente registrado por API nao pode entrar na remessa.",
    );
  }
  const ourNumber = onlyDigits(input.ourNumber);
  if (!/^\d{9}$/.test(ourNumber) || /^0+$/.test(ourNumber)) {
    throw new Error("Nosso Numero da remessa deve possuir 8 digitos mais DV.");
  }
  const expectedOurNumber = calculateBaneseNossoNumero(
    beneficiary.agency,
    ourNumber.slice(0, 8),
  );
  if (expectedOurNumber !== ourNumber) {
    throw new Error("DV do Nosso Numero da remessa nao confere com a agencia.");
  }
  const documentNumber = requiredText(
    input.documentNumber,
    "Numero do documento",
  );
  const companyControlNumber = requiredText(
    input.companyControlNumber,
    "Controle do titulo na empresa",
  );
  alphaField(documentNumber, 15, "Numero do documento");
  alphaField(companyControlNumber, 25, "Controle do titulo na empresa");
  const documentSpecies = String(input.documentSpecies ?? "").padStart(2, "0");
  if (!DOCUMENT_SPECIES.has(documentSpecies)) {
    throw new Error("Especie do titulo nao pertence ao dominio Banese v1.16.");
  }
  const issueDate = assertIsoDate(input.issueDate, "Data de emissao");
  if (
    !Number.isInteger(input.writeOffDays) || input.writeOffDays < 0 ||
    input.writeOffDays > 180
  ) {
    throw new Error("Prazo de baixa deve ser inteiro entre 0 e 180 dias.");
  }
  const financialTerms = normalizeBaneseFinancialTerms(input.financialTerms);
  if (issueDate > financialTerms.dueDate) {
    throw new Error("Data de emissao nao pode ser posterior ao vencimento.");
  }
  if (
    input.writeOffDays === 0 &&
    (financialTerms.interest || financialTerms.penalty)
  ) {
    throw new Error("Prazo de baixa zero exige juros e multa isentos.");
  }
  decimalField(financialTerms.nominalAmount, 15, "Valor nominal");
  if (financialTerms.discount) {
    decimalField(financialTerms.discount.value, 15, "Desconto");
  }
  if (financialTerms.interest) {
    decimalField(financialTerms.interest.value, 15, "Juros");
  }
  if (financialTerms.penalty) {
    decimalField(financialTerms.penalty.value, 15, "Multa");
  }
  return {
    ...input,
    ourNumber,
    documentNumber,
    companyControlNumber,
    documentSpecies,
    issueDate,
    payer: normalizePayer(input.payer),
    financialTerms,
  };
};

const withBaneseBlankAccount = (
  recordValue: string,
  offset: 0 | 1,
) => {
  let record = recordValue;
  record = putNumeric(
    record,
    53 + offset,
    57 + offset,
    "0",
    "Agencia",
  );
  record = putAlpha(
    record,
    58 + offset,
    58 + offset,
    "",
    "DV agencia",
  );
  record = putNumeric(
    record,
    59 + offset,
    70 + offset,
    "0",
    "Conta",
  );
  record = putAlpha(
    record,
    71 + offset,
    71 + offset,
    "",
    "DV conta",
  );
  return record;
};

const buildFileHeader = (
  input: BaneseCnab240RemittanceInput,
  beneficiary: NormalizedBeneficiary,
  generated: ReturnType<typeof baneseDateParts>,
) => {
  let record = blankRecord();
  record = putNumeric(record, 1, 3, BANK_CODE, "Banco");
  record = putNumeric(record, 4, 7, "0", "Lote header arquivo");
  record = putNumeric(record, 8, 8, "0", "Tipo header arquivo");
  record = putNumeric(
    record,
    18,
    18,
    beneficiary.registrationType,
    "Tipo inscricao",
  );
  record = putAlpha(
    record,
    19,
    32,
    beneficiary.document,
    "Documento beneficiario",
  );
  record = putNumeric(record, 33, 52, input.agreement, "Convenio");
  record = withBaneseBlankAccount(record, 0);
  record = putAlpha(record, 73, 102, beneficiary.name, "Nome beneficiario");
  record = putAlpha(record, 103, 132, "BANESE", "Nome banco");
  record = putNumeric(record, 143, 143, "1", "Codigo remessa");
  record = putNumeric(
    record,
    144,
    151,
    toDDMMYYYY(generated.isoDate),
    "Data geracao",
  );
  record = putNumeric(record, 152, 157, generated.time, "Hora geracao");
  record = putNumeric(record, 158, 163, input.nsa, "NSA");
  record = putNumeric(record, 164, 166, FILE_LAYOUT, "Layout arquivo");
  record = putNumeric(record, 167, 171, "0", "Densidade");
  return record;
};

const buildLotHeader = (
  input: BaneseCnab240RemittanceInput,
  beneficiary: NormalizedBeneficiary,
) => {
  let record = blankRecord();
  record = putNumeric(record, 1, 3, BANK_CODE, "Banco");
  record = putNumeric(record, 4, 7, SERVICE_LOT, "Lote");
  record = putNumeric(record, 8, 8, "1", "Tipo header lote");
  record = putAlpha(record, 9, 9, "R", "Operacao remessa");
  record = putNumeric(record, 10, 11, "01", "Servico cobranca");
  record = putNumeric(record, 14, 16, LOT_LAYOUT, "Layout lote");
  record = putNumeric(
    record,
    18,
    18,
    beneficiary.registrationType,
    "Tipo inscricao",
  );
  record = putAlpha(
    record,
    19,
    33,
    beneficiary.document,
    "Documento beneficiario",
  );
  record = putNumeric(record, 34, 53, input.agreement, "Convenio");
  record = withBaneseBlankAccount(record, 1);
  record = putAlpha(record, 74, 103, beneficiary.name, "Nome beneficiario");
  record = putNumeric(record, 184, 191, "0", "Numero remessa");
  record = putNumeric(record, 192, 199, "0", "Data gravacao");
  record = putNumeric(record, 200, 207, "0", "Data credito");
  return record;
};

const detailPrefix = (sequence: number, segment: "P" | "Q" | "R") => {
  let record = blankRecord();
  record = putNumeric(record, 1, 3, BANK_CODE, "Banco");
  record = putNumeric(record, 4, 7, SERVICE_LOT, "Lote");
  record = putNumeric(record, 8, 8, "3", "Tipo detalhe");
  record = putNumeric(record, 9, 13, sequence, "G038");
  record = putAlpha(record, 14, 14, segment, "Segmento");
  record = putNumeric(record, 16, 17, "01", "Movimento entrada");
  return record;
};

const buildSegmentP = (
  title: NormalizedTitle,
  beneficiary: NormalizedBeneficiary,
  sequence: number,
) => {
  const terms = title.financialTerms;
  let record = detailPrefix(sequence, "P");
  record = putNumeric(record, 18, 22, "0", "Agencia");
  record = putAlpha(record, 23, 23, "", "DV agencia");
  record = putNumeric(record, 24, 35, "0", "Conta");
  record = putAlpha(record, 36, 36, "", "DV conta");
  record = putNumeric(record, 38, 57, title.ourNumber, "Nosso Numero");
  record = putNumeric(record, 58, 58, "1", "Carteira");
  record = putNumeric(record, 59, 59, "1", "Cadastramento");
  record = putAlpha(record, 60, 60, "2", "Tipo documento");
  record = putNumeric(record, 61, 61, "2", "Emissao boleto");
  record = putAlpha(record, 62, 62, "2", "Distribuicao boleto");
  record = putAlpha(record, 63, 77, title.documentNumber, "Numero documento");
  record = putNumeric(record, 78, 85, toDDMMYYYY(terms.dueDate), "Vencimento");
  record = put(
    record,
    86,
    100,
    decimalField(terms.nominalAmount, 15, "Valor nominal"),
  );
  record = putNumeric(record, 101, 105, "0", "Agencia cobradora");
  record = putNumeric(
    record,
    107,
    108,
    title.documentSpecies,
    "Especie titulo",
  );
  record = putAlpha(record, 109, 109, "A", "Aceite");
  record = putNumeric(
    record,
    110,
    117,
    toDDMMYYYY(title.issueDate),
    "Data emissao",
  );
  if (terms.interest) {
    record = putNumeric(
      record,
      118,
      118,
      terms.interest.type === "daily-fixed" ? "1" : "2",
      "Codigo juros",
    );
    record = putNumeric(
      record,
      119,
      126,
      toDDMMYYYY(terms.interest.startsOn),
      "Data juros",
    );
    record = put(
      record,
      127,
      141,
      decimalField(terms.interest.value, 15, "Juros"),
    );
  } else {
    record = putNumeric(record, 118, 118, "3", "Codigo juros");
    record = putNumeric(record, 119, 126, "0", "Data juros");
    record = putNumeric(record, 127, 141, "0", "Juros");
  }
  if (terms.discount) {
    record = putNumeric(
      record,
      142,
      142,
      terms.discount.type === "fixed" ? "1" : "2",
      "Codigo desconto",
    );
    record = putNumeric(
      record,
      143,
      150,
      toDDMMYYYY(terms.discount.validUntil),
      "Data desconto",
    );
    record = put(
      record,
      151,
      165,
      decimalField(terms.discount.value, 15, "Desconto"),
    );
  } else {
    record = putNumeric(record, 142, 142, "0", "Codigo desconto");
    record = putNumeric(record, 143, 150, "0", "Data desconto");
    record = putNumeric(record, 151, 165, "0", "Desconto");
  }
  record = putNumeric(record, 166, 180, "0", "IOF");
  record = putNumeric(record, 181, 195, "0", "Abatimento");
  record = putAlpha(
    record,
    196,
    220,
    title.companyControlNumber,
    "Controle empresa",
  );
  record = putNumeric(record, 221, 221, "3", "Codigo protesto");
  record = putNumeric(record, 222, 223, "0", "Prazo protesto");
  record = putNumeric(record, 224, 224, "1", "Codigo baixa");
  record = putNumeric(record, 225, 227, title.writeOffDays, "Prazo baixa");
  record = putNumeric(record, 228, 229, "09", "Moeda");
  record = putNumeric(record, 230, 239, "0", "Contrato credito");
  record = putAlpha(record, 240, 240, "1", "Uso livre");
  return record;
};

const buildSegmentQ = (title: NormalizedTitle, sequence: number) => {
  const payer = title.payer;
  let record = detailPrefix(sequence, "Q");
  record = putNumeric(record, 18, 18, payer.registrationType, "Tipo pagador");
  record = putAlpha(record, 19, 33, payer.document, "Documento pagador");
  record = putAlpha(record, 34, 73, payer.name, "Nome pagador");
  record = putAlpha(record, 74, 113, payer.address, "Endereco pagador");
  record = putAlpha(record, 114, 128, payer.district, "Bairro pagador");
  record = putNumeric(record, 129, 133, payer.postalCode.slice(0, 5), "CEP");
  record = putNumeric(
    record,
    134,
    136,
    payer.postalCode.slice(5),
    "Sufixo CEP",
  );
  record = putAlpha(record, 137, 151, payer.city, "Cidade pagador");
  record = putAlpha(record, 152, 153, payer.state, "UF pagador");
  record = putNumeric(record, 154, 154, "0", "Tipo sacador");
  record = putAlpha(record, 155, 169, "0".repeat(15), "Documento sacador");
  record = putNumeric(record, 210, 212, "0", "Banco correspondente");
  record = putNumeric(record, 213, 232, "0", "Nosso numero correspondente");
  return record;
};

const buildSegmentR = (title: NormalizedTitle, sequence: number) => {
  const penalty = title.financialTerms.penalty!;
  let record = detailPrefix(sequence, "R");
  record = putNumeric(record, 18, 18, "0", "Codigo desconto 2");
  record = putNumeric(record, 19, 26, "0", "Data desconto 2");
  record = putNumeric(record, 27, 41, "0", "Desconto 2");
  record = putNumeric(record, 42, 42, "0", "Codigo desconto 3");
  record = putNumeric(record, 43, 50, "0", "Data desconto 3");
  record = putNumeric(record, 51, 65, "0", "Desconto 3");
  record = putNumeric(
    record,
    66,
    66,
    penalty.type === "fixed" ? "1" : "2",
    "Codigo multa",
  );
  record = putNumeric(
    record,
    67,
    74,
    toDDMMYYYY(penalty.startsOn),
    "Data multa",
  );
  record = put(record, 75, 89, decimalField(penalty.value, 15, "Multa"));
  record = putNumeric(record, 200, 207, "0", "Ocorrencia pagador");
  record = putNumeric(record, 208, 210, "0", "Banco debito");
  record = putNumeric(record, 211, 215, "0", "Agencia debito");
  record = putAlpha(record, 216, 216, "0", "DV agencia debito");
  record = putNumeric(record, 217, 228, "0", "Conta debito");
  record = putNumeric(record, 231, 231, "0", "Aviso debito");
  return record;
};

const buildLotTrailer = (
  titleCount: number,
  detailCount: number,
  totalCents: number,
) => {
  let record = blankRecord();
  record = putNumeric(record, 1, 3, BANK_CODE, "Banco");
  record = putNumeric(record, 4, 7, SERVICE_LOT, "Lote");
  record = putNumeric(record, 8, 8, "5", "Tipo trailer lote");
  record = putNumeric(record, 18, 23, detailCount + 2, "Registros lote");
  record = putNumeric(record, 24, 29, titleCount, "Titulos simples");
  record = putNumeric(record, 30, 46, totalCents, "Valor titulos simples");
  record = putNumeric(record, 47, 52, "0", "Titulos vinculados");
  record = putNumeric(record, 53, 69, "0", "Valor vinculado");
  record = putNumeric(record, 70, 75, "0", "Titulos caucionados");
  record = putNumeric(record, 76, 92, "0", "Valor caucionado");
  record = putNumeric(record, 93, 98, "0", "Titulos descontados");
  record = putNumeric(record, 99, 115, "0", "Valor descontado");
  return record;
};

const buildFileTrailer = (recordCount: number) => {
  let record = blankRecord();
  record = putNumeric(record, 1, 3, BANK_CODE, "Banco");
  record = putNumeric(record, 4, 7, "9999", "Lote trailer arquivo");
  record = putNumeric(record, 8, 8, "9", "Tipo trailer arquivo");
  record = putNumeric(record, 18, 23, "1", "Quantidade lotes");
  record = putNumeric(record, 24, 29, recordCount, "Quantidade registros");
  record = putNumeric(record, 30, 35, "0", "Contas conciliacao");
  return record;
};

export const buildBaneseCnab240Remittance = (
  input: BaneseCnab240RemittanceInput,
): BaneseCnab240RemittanceResult => {
  if (!input || typeof input !== "object") {
    throw new Error("Dados da remessa CNAB240 sao obrigatorios.");
  }
  if (!/^\d{6}$/.test(String(input.edi7 ?? ""))) {
    throw new Error("EDI7 deve possuir exatamente 6 digitos.");
  }
  if (!/^\d{5}$/.test(String(input.agreement ?? ""))) {
    throw new Error(
      "Convenio deve possuir exatamente 5 digitos para o nome do arquivo.",
    );
  }
  if (!Number.isInteger(input.nsa) || input.nsa < 1 || input.nsa > 99_999) {
    throw new Error("NSA deve ser inteiro entre 1 e 99999.");
  }
  if (!Array.isArray(input.titles) || !input.titles.length) {
    throw new Error("Remessa CNAB240 deve possuir ao menos um titulo.");
  }
  if (input.titles.length > MAX_TITLES) {
    throw new Error(
      `Remessa CNAB240 excede o limite de ${MAX_TITLES} titulos.`,
    );
  }

  if (
    typeof input.generatedAt === "string" &&
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(input.generatedAt)
  ) {
    throw new Error("Data de geracao textual deve ser ISO com fuso horario.");
  }
  const generatedAt = input.generatedAt == null
    ? new Date()
    : new Date(input.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("Data de geracao da remessa e invalida.");
  }
  const generated = baneseDateParts(generatedAt);
  const beneficiary = normalizeBeneficiary(input.beneficiary);
  const titles = input.titles.map((title) =>
    normalizeTitle(title, beneficiary)
  );
  const ourNumbers = new Set<string>();
  const companyControls = new Set<string>();
  for (const title of titles) {
    if (ourNumbers.has(title.ourNumber)) {
      throw new Error(
        `Nosso Numero ${title.ourNumber} esta duplicado na remessa.`,
      );
    }
    ourNumbers.add(title.ourNumber);
    if (companyControls.has(title.companyControlNumber)) {
      throw new Error(
        `Controle ${title.companyControlNumber} esta duplicado na remessa.`,
      );
    }
    companyControls.add(title.companyControlNumber);
  }

  const details: string[] = [];
  let totalCents = 0;
  titles.forEach((title, index) => {
    const sequence = index + 1;
    details.push(buildSegmentP(title, beneficiary, sequence));
    details.push(buildSegmentQ(title, sequence));
    if (title.financialTerms.penalty) {
      details.push(buildSegmentR(title, sequence));
    }
    totalCents += Math.round(title.financialTerms.nominalAmount * 100);
  });
  if (!Number.isSafeInteger(totalCents)) {
    throw new Error(
      "Valor total da remessa excede a precisao numerica segura.",
    );
  }

  const records = [
    buildFileHeader(input, beneficiary, generated),
    buildLotHeader(input, beneficiary),
    ...details,
    buildLotTrailer(titles.length, details.length, totalCents),
  ];
  records.push(buildFileTrailer(records.length + 1));
  const bytes = encodeCnab240File(records, "\r\n");
  const fileName = `COB.240.${input.edi7}.${generated.fileDate}.${
    String(input.nsa).padStart(5, "0")
  }.${input.agreement}.REM`;

  return {
    fileName,
    records,
    bytes,
    titleCount: titles.length,
    recordCount: records.length,
    totalAmount: totalCents / 100,
  };
};
