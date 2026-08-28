import type { BaneseAccessToken } from "./types.ts";
import { BaneseAdapterError } from "./types.ts";
import { asRecord, readResponseBody } from "./utils.ts";

export const queryBaneseEffectivePayments = async (input: {
  baseEndpoint: string;
  token: BaneseAccessToken;
  signal?: AbortSignal;
  allowFailure: boolean;
}) => {
  try {
    const response = await fetch(
      `${input.baseEndpoint}/pagamentos/efetivados`,
      {
        headers: {
          Authorization: `${input.token.tokenType} ${input.token.accessToken}`,
        },
        signal: input.signal,
      },
    );
    const raw = await readResponseBody(response);
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
      error: null,
    };
  } catch (error) {
    if (!input.allowFailure) throw error;
    return {
      payments: [] as Array<Record<string, unknown>>,
      error: error instanceof Error ? error : new BaneseAdapterError(
        String(error || "Consulta de pagamentos falhou."),
      ),
    };
  }
};
