export interface DashboardFinancialAmount {
  valor: string;
  quantidade: number;
}

export interface DashboardFinancialRadar {
  versao: 1;
  competencia: string;
  periodoInicio: string;
  periodoFimExclusivo: string;
  dataCorte: string;
  escopoTipo: 'GLOBAL' | 'POLO';
  poloId: string | null;
  criterio: 'POSICAO_REEXPRESSA_NO_CORTE';
  contasCompetencia: DashboardFinancialAmount;
  pagasCompetencia: DashboardFinancialAmount;
  aVencerCompetencia: DashboardFinancialAmount;
  emAtraso: DashboardFinancialAmount & { dataMaisAntiga: string | null };
  agendaFinanceira: {
    hoje: DashboardFinancialAmount & { data: string };
    proximosSeteDias: DashboardFinancialAmount & {
      periodoInicio: string;
      periodoFimExclusivo: string;
    };
    dias: Array<DashboardFinancialAmount & { data: string }>;
  };
}

export interface DashboardFinancialRadarRequest {
  poloId: string;
  competencia: string;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const requiredDate = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`O Radar financeiro retornou ${field} inválido.`);
  }
  return value;
};

const requiredCount = (value: unknown, field: string) => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`O Radar financeiro retornou ${field} inválido.`);
  }
  return Number(value);
};

const requiredAmount = (
  value: unknown,
  field: string,
): DashboardFinancialAmount => {
  if (!isRecord(value) || typeof value.valor !== 'string' || !DECIMAL_PATTERN.test(value.valor)) {
    throw new Error(`O Radar financeiro retornou ${field} inválido.`);
  }
  return {
    valor: value.valor,
    quantidade: requiredCount(value.quantidade, `${field}.quantidade`),
  };
};

export const mapDashboardFinancialRadar = (
  payload: unknown,
  request?: DashboardFinancialRadarRequest,
): DashboardFinancialRadar => {
  if (!isRecord(payload) || payload.versao !== 1) {
    throw new Error('O Radar financeiro retornou um contrato incompatível.');
  }
  if (payload.escopo_tipo !== 'GLOBAL' && payload.escopo_tipo !== 'POLO') {
    throw new Error('O Radar financeiro retornou um escopo inválido.');
  }
  const poloId = payload.polo_id;
  if (
    (payload.escopo_tipo === 'GLOBAL' && poloId !== null)
    || (payload.escopo_tipo === 'POLO' && typeof poloId !== 'string')
  ) {
    throw new Error('O Radar financeiro retornou um polo inválido.');
  }
  const normalizedPoloId = poloId === null ? null : poloId as string;
  if (payload.criterio !== 'POSICAO_REEXPRESSA_NO_CORTE') {
    throw new Error('O Radar financeiro retornou um critério incompatível.');
  }
  if (!isRecord(payload.em_atraso) || !isRecord(payload.agenda_financeira)) {
    throw new Error('O Radar financeiro retornou um resumo incompleto.');
  }

  const agenda = payload.agenda_financeira;
  if (!isRecord(agenda.hoje) || !isRecord(agenda.proximos_sete_dias) || !Array.isArray(agenda.dias)) {
    throw new Error('O Radar financeiro retornou uma agenda incompleta.');
  }
  if (agenda.dias.length !== 8) {
    throw new Error('O Radar financeiro retornou uma agenda diária incompleta.');
  }
  if (payload.em_atraso.data_mais_antiga !== null
    && typeof payload.em_atraso.data_mais_antiga !== 'string') {
    throw new Error('O Radar financeiro retornou a data mais antiga inválida.');
  }

  const competencia = requiredDate(payload.competencia, 'competência');
  if (
    request
    && (
      payload.escopo_tipo !== 'POLO'
      || normalizedPoloId !== request.poloId
      || competencia !== request.competencia
    )
  ) {
    throw new Error('O Radar financeiro retornou um escopo diferente do solicitado.');
  }

  return {
    versao: 1,
    competencia,
    periodoInicio: requiredDate(payload.periodo_inicio, 'início da competência'),
    periodoFimExclusivo: requiredDate(payload.periodo_fim_exclusivo, 'fim da competência'),
    dataCorte: requiredDate(payload.data_corte, 'data de corte'),
    escopoTipo: payload.escopo_tipo,
    poloId: normalizedPoloId,
    criterio: payload.criterio,
    contasCompetencia: requiredAmount(payload.contas_competencia, 'contas da competência'),
    pagasCompetencia: requiredAmount(payload.pagas_competencia, 'contas pagas'),
    aVencerCompetencia: requiredAmount(payload.a_vencer_competencia, 'contas a vencer'),
    emAtraso: {
      ...requiredAmount(payload.em_atraso, 'contas em atraso'),
      dataMaisAntiga: payload.em_atraso.data_mais_antiga === null
        ? null
        : requiredDate(payload.em_atraso.data_mais_antiga, 'data mais antiga'),
    },
    agendaFinanceira: {
      hoje: {
        ...requiredAmount(agenda.hoje, 'vencimentos de hoje'),
        data: requiredDate(agenda.hoje.data, 'data de hoje'),
      },
      proximosSeteDias: {
        ...requiredAmount(agenda.proximos_sete_dias, 'próximos sete dias'),
        periodoInicio: requiredDate(agenda.proximos_sete_dias.periodo_inicio, 'início dos próximos sete dias'),
        periodoFimExclusivo: requiredDate(agenda.proximos_sete_dias.periodo_fim_exclusivo, 'fim dos próximos sete dias'),
      },
      dias: agenda.dias.map((day, index) => {
        const amount = requiredAmount(day, `agenda diária ${index + 1}`);
        if (!isRecord(day)) throw new Error('O Radar financeiro retornou um dia inválido.');
        return {
          ...amount,
          data: requiredDate(day.data, `data da agenda diária ${index + 1}`),
        };
      }),
    },
  };
};
