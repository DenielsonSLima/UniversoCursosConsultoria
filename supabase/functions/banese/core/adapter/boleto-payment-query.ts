import type { BaneseAccessToken } from "./types.ts";
import { BaneseAdapterError } from "./types.ts";
import { asRecord, awaitBaneseRead, readResponseBody } from "./utils.ts";

export const queryBaneseEffectivePayments = async (input: {
  baseEndpoint: string;
  token: BaneseAccessToken;
  signal?: AbortSignal;
  allowFailure: boolean;
  strict?: boolean;
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
    // Mantém o tratamento legado de 404 como lista vazia. A expiração EAD
    // exige uma resposta oficial válida e não usa essa inferência.
    if (response.status === 404 && !input.strict) {
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
    if (input.strict && (
      !Array.isArray(record.PagamentosEfetivados) ||
      (record.Erros != null &&
        (!Array.isArray(record.Erros) || record.Erros.length > 0)) ||
      record.PagamentosEfetivados.some((item: unknown) =>
        !item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).length === 0)
    )) {
      throw new BaneseAdapterError(
        "PagamentosEfetivados não retornou uma lista oficial válida; o pagamento não pôde ser descartado.",
      );
    }
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
