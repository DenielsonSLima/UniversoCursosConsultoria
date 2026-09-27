import type { CaixaConveniosResumo } from '../caixa-convenios.service';
import {
  assertCaixaConveniosResumoRequest,
  mapCaixaConveniosResumo,
} from '../caixa-convenios.service';

export type CaixaReportConvenios =
  | { disponivel: true; dados: CaixaConveniosResumo }
  | { disponivel: false; motivo: 'ACESSO_RESTRITO' };

export const mapCaixaReportConvenios = (
  value: unknown,
  poloId: string | null,
  competencia: string,
): CaixaReportConvenios => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Contrato inválido do relatório do Caixa: convenios.');
  }
  const payload = value as Record<string, unknown>;
  if (payload.disponivel === false) {
    if (payload.motivo !== 'ACESSO_RESTRITO') {
      throw new Error('Contrato inválido do relatório do Caixa: convenios.motivo.');
    }
    return { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  }
  if (payload.disponivel !== true) {
    throw new Error('Contrato inválido do relatório do Caixa: convenios.disponivel.');
  }
  const dados = mapCaixaConveniosResumo(payload.dados);
  assertCaixaConveniosResumoRequest(dados, poloId, competencia);
  return { disponivel: true, dados };
};
