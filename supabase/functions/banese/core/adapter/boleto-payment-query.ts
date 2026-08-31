import type { BaneseAccessToken } from "./types.ts";
import { BaneseAdapterError } from "./types.ts";
import { asRecord, awaitBaneseRead, readResponseBody } from "./utils.ts";

export const queryBaneseEffectivePayments = async (input: {
  baseEndpoint: string;
  token: BaneseAccessToken;
  signal?: AbortSignal;
  allowFailure: boolean;
}) => {
  try {
    const response = await awaitBaneseRead(
      fetch(
        `${input.baseEndpoint}/pagamentos/efetivados`,
        {
          headers: {
            Authorization:
              `${input.token.tokenType} ${input.token.accessToken}`,
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
          signal: input.signal,
        },
      ),
      input.signal,
    );
    // HTTP 404 significa que nenhum pagamento foi efetuado ainda (boleto pendente).
    // Não é um erro de consulta — o titulo está ativo e em aberto no banco.
    if (response.status === 404) {
      return {
        payments: [] as Array<Record<string, unknown>>,
        raw: null,
        error: null,
      };
    }
    const raw = await awaitBaneseRead(readResponseBody(response), input.signal);
    if (!response.ok) {
      throw new BaneseAdapterError(
        `A consulta canônica de PagamentosEfetivados do Banese falhou (${response.status}); o estado financeiro do boleto não pôde ser confirmado.`,
      );
    }
    const record = asRecord(raw);
    const items = Array.isArray(raw)
      ? raw
      : record.PagamentosEfetivados ?? record.pagamentosEfetivados ?? [];
    return {
      payments: Array.isArray(items)
        ? items.map(asRecord).filter((item) => Object.keys(item).length > 0)
        : [],
      // O envelope oficial pode repetir dados BolePix do mesmo título. O
      // chamador o inspeciona apenas com os validadores de Pix/identidade e
      // nunca o persiste integralmente.
      raw,
      error: null,
    };
  } catch (error) {
    if (!input.allowFailure) throw error;
    return {
      payments: [] as Array<Record<string, unknown>>,
      raw: null,
      error: error instanceof Error ? error : new BaneseAdapterError(
        String(error || "Consulta de pagamentos falhou."),
      ),
    };
  }
};
