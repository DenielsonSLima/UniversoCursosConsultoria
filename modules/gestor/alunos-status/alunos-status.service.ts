import { supabase } from '../../../lib/supabase';
import {
  assertAlunosStatusAccess,
  normalizeAlunosStatusKpis,
  type AlunosStatusConsumer,
  type AlunosStatusKpis,
} from './alunos-status.model';

interface GetAlunosStatusKpisInput {
  poloId?: string | null;
  includeGlobal?: boolean;
  consumer: AlunosStatusConsumer;
}

export const alunosStatusService = {
  async getKpis(input: GetAlunosStatusKpisInput): Promise<AlunosStatusKpis> {
    const { data, error } = await supabase.rpc('get_student_status_kpis_secure', {
      p_polo_id: input.poloId && input.poloId !== 'todos' ? input.poloId : null,
      p_include_global: Boolean(input.includeGlobal),
      p_consumer: input.consumer,
    });

    if (error) {
      throw new Error(error.message || 'Não foi possível carregar os indicadores de alunos.');
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row !== 'object') {
      throw new Error('O backend não retornou os indicadores de alunos.');
    }

    const metrics = normalizeAlunosStatusKpis(row as Record<string, unknown>);
    assertAlunosStatusAccess(metrics, input.consumer);

    return metrics;
  },
};

export type { AlunosStatusConsumer, AlunosStatusKpis } from './alunos-status.model';
