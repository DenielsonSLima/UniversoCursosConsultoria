// Provider identifier for the bank named Banese Card; CREDIT_CARD is not supported.
import type { BaneseFinancialTermsInput } from "../../internal/financial-terms.ts";

export const BANESE_PROVIDER_CODE = "banese_card" as const;

export type Environment = "sandbox" | "production";
export type PaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";

export type SupabaseAdminRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type AdapterPayer = Record<string, unknown> & {
  name?: string | null;
  nome?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  cpf_cnpj?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
};

export type AdapterReceivable = Record<string, unknown> & {
  id?: string | number | null;
};

export type AdapterCreateChargeInput = {
  admin: SupabaseAdminRpcClient;
  supabaseUrl: string;
  environment: Environment;
  paymentMethod: PaymentMethod;
  receivable: AdapterReceivable;
  payer: AdapterPayer;
  description: string;
  amount: number;
  dueDate?: string | null;
  successUrl?: string | null;
  pendingUrl?: string | null;
  financialTerms?: BaneseFinancialTermsInput | null;
};

export type AdapterCreateChargeResult = {
  id: string;
  link: string | null;
  bankSlipUrl?: string | null;
  pixPayload?: string | null;
  pixEncodedImage?: string | null;
  bankSlipDigitableLine?: string | null;
  bankSlipBarcode?: string | null;
  bankSlipOurNumber?: string | null;
  financialTerms?: Record<string, unknown> | null;
  status: string;
  raw: unknown;
};

export type BaneseClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export type BaneseBoletoCredentials = BaneseClientCredentials;

export type BanesePixCredentials = BaneseClientCredentials & {
  crtAccessToken: string;
};

export type BaneseAccessToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number | null;
  scope: string | null;
  raw: unknown;
};

export class BaneseAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaneseAdapterError";
  }
}

export class BaneseAdapterConfigurationError extends BaneseAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "BaneseAdapterConfigurationError";
  }
}

export class BaneseAdapterNotImplementedError extends Error {
  constructor(feature: string) {
    super(`Adapter Banese Card ainda nao implementado para ${feature}.`);
    this.name = "BaneseAdapterNotImplementedError";
  }
}

export const BANESE_BOLETO_ENDPOINTS: Record<Environment, {
  baseUrl: string;
  tokenUrl: string;
}> = {
  sandbox: {
    baseUrl: "https://sandbox.banese.b.br/cobranca/v1",
    tokenUrl: "https://sandbox.banese.b.br/autenticacao/oauth/v1/token",
  },
  production: {
    baseUrl: "https://webapi.banese.b.br/cobranca/v1",
    tokenUrl: "https://webapi.banese.b.br/autenticacao/oauth/v1/token",
  },
};

export const BANESE_PIX_ENDPOINTS: Record<Environment, {
  baseUrl: string;
  tokenUrl: string;
  terminal: string;
}> = {
  sandbox: {
    baseUrl: "https://apipix-h.banese.b.br/guias/v1",
    tokenUrl: "https://apipix-h.banese.b.br/security/v3/oauth/token",
    terminal: "99000090054",
  },
  production: {
    baseUrl: "https://apipix.banese.b.br/guias/v1",
    tokenUrl: "https://apipix.banese.b.br/security/v3/oauth/token",
    terminal: "99000090049",
  },
};

export const BANESE_BOLETO_STATUS: Record<number, string> = {
  0: "REGISTERING",
  1: "REJECTED",
  2: "PENDING",
  3: "PAID",
  4: "EXPIRED",
  5: "CANCELED",
  6: "PROTESTED",
  7: "CANCELED_BY_BANK",
  8: "REJECTED_TIMEOUT",
};
