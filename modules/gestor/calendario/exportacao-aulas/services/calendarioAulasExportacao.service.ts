import { supabase } from '../../../../../lib/supabase';
import type {
  CalendarioAulasTurmaModulo, CalendarioAulasExportacaoPayload, CalendarioAulasModalidade,
  CalendarioAulasTurma, PrepararCalendarioAulasExportacaoInput,
} from '../types';
import { asRows, mapTurma, mapTurmaModulo, mapCalendarioAulasExportacaoPayload } from './calendarioAulasExportacao.mapper';
import { toMonthReference, shiftMonthReference, lineMonthReference, mergeAndSortLinhas, dedupeLinhas } from './calendarioAulasExportacao.legacy';

export { mapCalendarioAulasExportacaoPayload } from './calendarioAulasExportacao.mapper';

type PostgrestErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  status?: unknown;
};

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isPostgrestFunctionUnavailable = (error: unknown) => {
  const parsed = error && typeof error === 'object'
    ? error as PostgrestErrorLike
    : {};
  const code = asText(parsed.code);
  const message = asText(parsed.message).toLowerCase();
  const details = asText(parsed.details).toLowerCase();
  const status = Number(parsed.status);

  return (
    code === '42883'
    || status === 404
    || message.includes('could not find the function')
    || message.includes('does not exist')
    || details.includes('could not find the function')
    || details.includes('does not exist')
  );
};

const mapTurmaModuloFromFallback = (row: any): CalendarioAulasTurmaModulo | null => {
  const modulo = row?.disciplinas?.modulos;
  if (!modulo || typeof modulo !== 'object') return null;
  const moduloId = modulo.id;
  const moduloNome = modulo.nome;
  if (typeof moduloId !== 'string' || typeof moduloNome !== 'string') return null;
  const moduloOrdem = typeof modulo.ordem === 'number' && Number.isFinite(modulo.ordem)
    ? modulo.ordem
    : null;

  return {
    moduloId,
    moduloNome: moduloNome.trim() || 'Módulo',
    moduloOrdem,
  };
};

const listTurmaModulosFallback = async (turmaId: string) => {
  const { data, error } = await supabase
    .from('turmas_disciplinas')
    .select('disciplinas!inner(modulos!inner(id, nome, ordem))')
    .eq('turma_id', turmaId);

  if (error) throw error;

  const moduloMap = new Map<string, CalendarioAulasTurmaModulo>();
  for (const row of data || []) {
    const modulo = mapTurmaModuloFromFallback(row);
    if (!modulo) continue;
    if (!moduloMap.has(modulo.moduloId)) moduloMap.set(modulo.moduloId, modulo);
  }

  return [...moduloMap.values()].sort((a, b) => {
    if (a.moduloOrdem !== b.moduloOrdem) {
      return (a.moduloOrdem ?? Number.MAX_SAFE_INTEGER) - (b.moduloOrdem ?? Number.MAX_SAFE_INTEGER);
    }
    return a.moduloNome.localeCompare(b.moduloNome, 'pt-BR');
  });
};

export const calendarioAulasExportacaoService = {
  async listarTurmas(
    poloId: string,
    modalidade: CalendarioAulasModalidade,
  ): Promise<CalendarioAulasTurma[]> {
    const { data, error } = await supabase.rpc(
      'listar_turmas_calendario_aulas_secure',
      {
        p_polo_id: poloId,
        p_modalidade: modalidade,
      },
    );

    if (error) throw error;
    return asRows(data, 'turmas elegíveis').map(mapTurma);
  },

  async listarModulos(
    poloId: string,
    turmaId: string,
  ): Promise<CalendarioAulasTurmaModulo[]> {
    const { data, error } = await supabase.rpc(
      'listar_modulos_calendario_aulas_secure',
      {
        p_polo_id: poloId,
        p_turma_id: turmaId,
      },
    );

    if (error) {
      // Em algumas bases antigas, a função pode ainda não existir; para não
      // travar a exportação, devolvemos lista vazia.
      if (isPostgrestFunctionUnavailable(error)) {
        return listTurmaModulosFallback(turmaId);
      }

      throw error;
    }
    return asRows(data, 'módulos da turma').map(mapTurmaModulo);
  },

  async preparar(
    input: PrepararCalendarioAulasExportacaoInput,
  ): Promise<CalendarioAulasExportacaoPayload> {
    if (input.modoExportacao === 'CRONOLOGICO') {
      if (input.modalidade !== 'TECNICO') {
        throw new Error('O calendário cronológico está disponível para turmas técnicas.');
      }
      const { data, error } = await supabase.rpc('preparar_calendario_aulas_cronologico_secure', {
        p_polo_id: input.poloId,
        p_modalidade: input.modalidade,
        p_turma_id: input.turmaId,
        p_modulo_ids: input.moduloIds ?? null,
        p_data_inicio: input.dataInicio || null,
        p_data_fim: input.dataFim || null,
      });
      if (error) throw error;
      const prepared = mapCalendarioAulasExportacaoPayload(data);
      if (prepared.status === 'PRONTO' && prepared.documento?.modoExportacao !== 'CRONOLOGICO') {
        throw new Error('O servidor não retornou um calendário cronológico compatível.');
      }
      return prepared;
    }
    const moduloId = input.moduloId?.trim() || null;

    const callWithModulo = async (
      moduloFilter: string | null,
      mesReferencia: string,
    ) => supabase.rpc(
      'preparar_calendario_aulas_exportacao_secure',
      {
        p_polo_id: input.poloId,
        p_modalidade: input.modalidade,
        p_turma_id: input.turmaId,
        p_mes_referencia: mesReferencia,
        p_modulo_id: moduloFilter || null,
      },
    );

    const { data, error } = await callWithModulo(moduloId, input.mesReferencia);

    if (error && isPostgrestFunctionUnavailable(error)) {
      if (moduloId) {
        throw new Error(
          'Função de exportação por módulo ainda não está atualizada no ambiente. '
          + 'Aplique a migration mais recente de calendário de aulas antes de exportar por módulo técnico.',
        );
      }

      const fallback = await supabase.rpc(
        'preparar_calendario_aulas_exportacao_secure',
        {
          p_polo_id: input.poloId,
          p_modalidade: input.modalidade,
          p_turma_id: input.turmaId,
          p_mes_referencia: input.mesReferencia,
        },
      );

      if (fallback.error) throw fallback.error;
      return mapCalendarioAulasExportacaoPayload(fallback.data);
    }

    if (error) throw error;

    const prepared = mapCalendarioAulasExportacaoPayload(data);
    if (
      prepared.status !== 'PRONTO'
      || input.modalidade !== 'TECNICO'
      || !moduloId
    ) {
      return prepared;
    }

    const selectedMonth = toMonthReference(input.mesReferencia);
    if (!selectedMonth) {
      return prepared;
    }

    const onlySelectedMonth = prepared.linhas.every((
      linha,
    ) => lineMonthReference(linha.dataExibicao) === selectedMonth);

    if (!onlySelectedMonth) {
      return prepared;
    }

    const mergedByMonths = dedupeLinhas(prepared.linhas);
    const offsets = [
      1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6,
      7, -7, 8, -8, 9, -9, 10, -10, 11, -11, 12, -12,
    ];

    for (const offset of offsets) {
      const monthReference = shiftMonthReference(input.mesReferencia, offset);
      const response = await callWithModulo(moduloId, monthReference);
      if (response.error) continue;

      const payloadByMonth = mapCalendarioAulasExportacaoPayload(response.data);
      if (payloadByMonth.status !== 'PRONTO') continue;
      mergedByMonths.push(...payloadByMonth.linhas);
    }

    const merged = mergeAndSortLinhas(mergedByMonths);
    return {
      ...prepared,
      linhas: merged,
    };
  },
};
