import { toNumber } from "./money.ts";

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

export interface CourseFinanceiroConfig {
  parcelasPadrao: number;
  taxaPagaPor: "aluno" | "instituicao";
  metodosRecebimento: {
    pix: boolean;
    boleto: boolean;
    cartao: boolean;
  };
  cartao: {
    aceitar: boolean;
    maxParcelas: number;
    aplicarDescontoPontualidade: boolean;
    repassarCustoParcelamento: boolean;
  };
}

export const normalizeCourseFinanceiroConfig = (config: any = {}): CourseFinanceiroConfig => {
  const metodos = config?.metodosRecebimento || {};
  const cartao = config?.cartao || {};
  const parcelasPadrao = Math.max(1, toNumber(config?.parcelasPadrao, 1));
  const maxParcelas = cartao?.aceitar
    ? Math.max(parcelasPadrao, toNumber(cartao?.maxParcelas, parcelasPadrao))
    : 1;

  return {
    parcelasPadrao,
    taxaPagaPor: config?.taxaPagaPor === "instituicao" ? "instituicao" : "aluno",
    metodosRecebimento: {
      pix: metodos.pix !== false,
      boleto: metodos.boleto !== false,
      cartao: metodos.cartao !== false,
    },
    cartao: {
      aceitar: cartao.aceitar !== false,
      maxParcelas,
      aplicarDescontoPontualidade: cartao.aplicarDescontoPontualidade === true,
      repassarCustoParcelamento: cartao.repassarCustoParcelamento === true,
    },
  };
};

export const resolveBillingType = (
  metodos: CourseFinanceiroConfig["metodosRecebimento"],
): AsaasBillingType => {
  const metodosAtivos = [
    metodos.pix ? "PIX" : null,
    metodos.boleto ? "BOLETO" : null,
    metodos.cartao ? "CREDIT_CARD" : null,
  ].filter(Boolean);

  if (metodosAtivos.length === 0) {
    throw new Error("Nenhuma forma de recebimento configurada para este curso.");
  }

  return metodosAtivos.length === 1 ? metodosAtivos[0] as AsaasBillingType : "UNDEFINED";
};

export const resolveCourseConfiguredPayment = (course: any) => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(course?.financeiro_config || {});
  return {
    financeiroConfig,
    billingType: resolveBillingType(financeiroConfig.metodosRecebimento),
  };
};
