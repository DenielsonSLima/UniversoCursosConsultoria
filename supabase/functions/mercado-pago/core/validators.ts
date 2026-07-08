import { MercadoPagoAdapterError } from "./errors.ts";
import type { Environment, PaymentMethod } from "./types.ts";
import { onlyDigits } from "./utils.ts";

const cpfDigit = (base: string, weight: number) => {
  const rest =
    (base.split("").reduce((sum, item) => sum + Number(item) * weight--, 0) *
      10) % 11;
  return rest === 10 ? 0 : rest;
};

export const isValidCpf = (value: unknown) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  return cpfDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    cpfDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const normalizeInstallments = (value: unknown) => {
  const parsed = Number(value || 1);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new MercadoPagoAdapterError(
      "Quantidade de parcelas Mercado Pago invalida.",
    );
  }
  if (parsed > 21) {
    throw new MercadoPagoAdapterError(
      "Mercado Pago aceita no maximo 21 parcelas nesta integracao.",
    );
  }
  return parsed;
};

export const assertEnvironment = (environment: Environment) => {
  if (environment !== "sandbox" && environment !== "production") {
    throw new MercadoPagoAdapterError("Ambiente Mercado Pago invalido.");
  }
};

export const assertPaymentMethod = (paymentMethod: PaymentMethod) => {
  if (
    paymentMethod !== "PIX" &&
    paymentMethod !== "BOLETO" &&
    paymentMethod !== "CREDIT_CARD"
  ) {
    throw new MercadoPagoAdapterError(
      "Forma de pagamento Mercado Pago invalida.",
    );
  }
};

export const assertAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MercadoPagoAdapterError(
      "Valor da cobranca Mercado Pago deve ser maior que zero.",
    );
  }
};
