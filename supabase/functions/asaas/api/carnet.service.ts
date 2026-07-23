import { createTecnicoCarnetService } from "../tecnico/carnet.ts";
import { isTecnicoCourseModality } from "../core/modality.ts";
import type { AsaasRuntime } from "./asaas-http.ts";

const one = (value: any) => Array.isArray(value) ? value[0] : value;

export const createAsaasCarnetService = (
  admin: any,
  _syncReceivable: unknown,
) => {
  const tecnicoCarnet = createTecnicoCarnetService(admin);

  const ensureTecnicoScope = async (receivableIds: string[]) => {
    const ids = Array.from(new Set(receivableIds.filter(Boolean)));
    if (!ids.length) {
      throw new Error("Selecione ao menos uma cobrança para gerar o carnê.");
    }

    const { data, error } = await admin
      .from("contas_receber")
      .select("id, tipo_lancamento, turmas(cursos(modalidade))")
      .in("id", ids)
      .order("data_vencimento", { ascending: true });
    if (error) throw error;
    if ((data || []).length !== ids.length) {
      throw new Error(
        "Uma ou mais cobranças selecionadas não foram encontradas.",
      );
    }

    const invalidItems = (data || []).filter((item: any) => {
      const turma = one(item?.turmas);
      const modalidade = String(turma?.cursos?.modalidade || "").toUpperCase();
      if (!isTecnicoCourseModality(modalidade)) {
        return true;
      }
      const launchType = String(item.tipo_lancamento || "").toUpperCase();
      return !["PARCELA", "MENSALIDADE", "REMATRICULA"].includes(launchType);
    });
    if (invalidItems.length) {
      throw new Error(
        "Selecione apenas cobranças técnicas (PARCELA, MENSALIDADE ou REMATRICULA) com modalidade TECNICO para gerar carnê.",
      );
    }
  };

  return {
    generateOfficialCarnet: async (
      runtime: AsaasRuntime,
      receivableIds: string[],
    ) => {
      await ensureTecnicoScope(receivableIds);
      return tecnicoCarnet.generateOfficialCarnet(runtime, receivableIds);
    },
  };
};
