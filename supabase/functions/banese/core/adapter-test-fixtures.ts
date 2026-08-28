import {
  BANESE_DOCUMENT_FIXTURE,
} from "../internal/testing/document-fixture.ts";
import {
  baneseDueDateFactor,
  calculateBaneseAsbaceDoubleDigit,
} from "../internal/bank-fields.ts";

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

export const makeBaneseBarcodePack = (amount: number, dueDate: string) => {
  const amountValue = String(Math.round(amount * 100)).padStart(10, "0");
  const agreement = BANESE_DOCUMENT_FIXTURE.beneficiary.agreement;
  const agency = BANESE_DOCUMENT_FIXTURE.beneficiary.agency;
  const account = BANESE_DOCUMENT_FIXTURE.beneficiary.account.replace(
    /\D/g,
    "",
  );
  const asbaceBase = `${
    agency.slice(-2)
  }${account}${BANESE_DOCUMENT_FIXTURE.ourNumber}047`;
  const freeField = `${asbaceBase}${
    calculateBaneseAsbaceDoubleDigit(asbaceBase)
  }`;
  const withPlaceholder = `04790${
    baneseDueDateFactor(dueDate)
  }${amountValue}${freeField}`;
  const barcode = `${withPlaceholder.slice(0, 4)}${
    barcodeGeneralDigit(withPlaceholder)
  }${withPlaceholder.slice(5)}`;
  const fieldOne = `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`;
  const fieldTwo = barcode.slice(24, 34);
  const fieldThree = barcode.slice(34, 44);
  const digitableLine = `${fieldOne}${modulo10Digit(fieldOne)}${fieldTwo}${
    modulo10Digit(fieldTwo)
  }${fieldThree}${modulo10Digit(fieldThree)}${barcode[4]}${
    barcode.slice(5, 19)
  }`;
  return { agreement, barcode, digitableLine };
};

export const validInput = {
  admin: { rpc: async () => ({ data: null, error: null }) },
  supabaseUrl: "https://example.supabase.co",
  environment: "sandbox" as const,
  paymentMethod: "BOLETO" as const,
  receivable: {
    id: "11111111-1111-4111-8111-111111111111",
    baneseAgencia: "033",
    baneseNossoNumero: "000000015",
    baneseCodigoEspecie: 21,
  },
  payer: {
    name: "Aluno Teste",
    document: "12345678901",
    address: "Rua de Teste, 100",
    postalCode: "49000000",
    district: "Centro",
    city: "Aracaju",
    state: "SE",
  },
  description: "Homologacao",
  amount: 15.9,
  dueDate: "2026-08-15",
  financialTerms: {
    nominalAmount: 15.9,
    dueDate: "2026-08-15",
    discount: { type: "fixed" as const, value: 1.9 },
    interest: { type: "monthly-percentage" as const, value: 5 },
    penalty: { type: "fixed" as const, value: 1 },
  },
};

export const adminForBaneseReservation = (
  alreadyReserved: boolean,
  bankRangeConfirmed = true,
) => ({
  rpc: async (fn: string) => {
    if (fn === "reserve_banese_nosso_numero_for_receivable") {
      return {
        data: {
          nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
          convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
          agencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
          alreadyReserved,
          bankRangeConfirmed,
        },
        error: null,
      };
    }
    if (fn === "payment_gateway_get_secret") {
      return { data: "credencial-homologacao", error: null };
    }
    throw new Error(`RPC inesperada no teste Banese: ${fn}`);
  },
});

export const reservedBoletoInput = (
  alreadyReserved: boolean,
  bankRangeConfirmed = true,
) => ({
  ...validInput,
  admin: adminForBaneseReservation(alreadyReserved, bankRangeConfirmed),
  receivable: {
    ...validInput.receivable,
    id: BANESE_DOCUMENT_FIXTURE.receivableId,
    baneseBoletoConvenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
    baneseAgencia: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
    baneseConta: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
  },
  amount: BANESE_DOCUMENT_FIXTURE.amount,
  dueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  financialTerms: null,
});

export const baneseResponseIdentity = {
  NumeroDocumento: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 15),
  IdTituloEmpresa: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 25),
  Pagador: { NumeroCPFCNPJ: Number(validInput.payer.document) },
};

export const makeBaneseTitleResponse = (
  amount = BANESE_DOCUMENT_FIXTURE.amount,
  dueDate = BANESE_DOCUMENT_FIXTURE.dueDate,
  overrides: Record<string, unknown> = {},
) => {
  const values = makeBaneseBarcodePack(amount, dueDate);
  return {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: values.digitableLine,
    NumeroCodigoBarras: values.barcode,
    CodigoSituacaoBoleto: 2,
    ValorNominal: amount,
    DataVencimento: dueDate,
    convenio: values.agreement,
    ...baneseResponseIdentity,
    ...overrides,
  };
};

export type BaneseFetchCall = { url: string; method: string };

export const creationFetch = (
  creationResponse: Record<string, unknown>,
  confirmationResponse = creationResponse,
) => {
  let created = false;
  const calls: BaneseFetchCall[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    calls.push({ url, method });
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    if (method === "GET" && !created) {
      return new Response(
        JSON.stringify({ Codigo: "ERRO_BOLETO_NAO_ENCONTRADO" }),
        { status: 404 },
      );
    }
    if (method === "POST") {
      created = true;
      return new Response(JSON.stringify(creationResponse), { status: 200 });
    }
    return new Response(JSON.stringify(confirmationResponse), { status: 200 });
  };
  return { calls, fetcher };
};
