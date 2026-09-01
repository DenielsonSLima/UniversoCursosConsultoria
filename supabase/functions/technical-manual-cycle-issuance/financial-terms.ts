import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type BaneseFinancialTermsInput,
  normalizeBaneseFinancialTerms,
} from "../banese/internal/financial-terms.ts";
import { strictTechnicalManualBaneseFinancialTerms } from "../gateways/api/banese-financial-terms.ts";

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Compara o snapshot recebido pelo Edge com a reconstrução canônica do mesmo
 * recebível e run feita no Postgres. Qualquer ausência ou drift interrompe o
 * fluxo antes que o adapter Banese possa fazer POST.
 */
export const resolveCanonicalManualCycleBaneseTerms = async (
  admin: SupabaseClient,
  receivable: Record<string, unknown>,
): Promise<BaneseFinancialTermsInput> => {
  const local = normalizeBaneseFinancialTerms(
    strictTechnicalManualBaneseFinancialTerms(receivable),
  );
  const receivableId = String(receivable.id || "");
  const { data, error } = await admin.rpc(
    "technical_manual_banese_expected_terms_service",
    { p_receivable_id: receivableId },
  );
  if (error) {
    throw new Error(
      `O ciclo não comprovou os termos financeiros canônicos antes do envio: ${
        error.message || error
      }. Nenhum título Banese foi emitido.`,
    );
  }
  let canonical: ReturnType<typeof normalizeBaneseFinancialTerms>;
  try {
    canonical = normalizeBaneseFinancialTerms(
      data as BaneseFinancialTermsInput,
    );
  } catch (cause) {
    throw new Error(
      `O banco local retornou termos financeiros inválidos: ${
        cause instanceof Error ? cause.message : "erro desconhecido"
      }. Nenhum título Banese foi emitido.`,
      { cause },
    );
  }
  if (!sameJson(local, canonical)) {
    throw new Error(
      "Os termos financeiros do Edge divergiram do ciclo canônico; nenhum título Banese foi emitido.",
    );
  }
  return canonical;
};
