import { supabase } from '../../../lib/supabase';
import { mapTurma } from './gestao.mappers';
import { PlanoFinanceiroUnicoInput, Turma } from './gestao.types';

export type CreateTurmaInput = Omit<Turma, 'id' | 'alunosMatriculados'> & {
  codigoCondicaoIndividual?: string;
  planoFinanceiroUnico?: PlanoFinanceiroUnicoInput;
};

export async function createTurma(
  turma: CreateTurmaInput,
  requestId?: string,
): Promise<Turma> {
  if (turma.modalidade !== 'EAD' && !turma.poloId) {
    throw new Error('Informe o polo da turma antes de abrir inscrições.');
  }

  const isTechnical = turma.modalidade === 'TECNICO';
  const isSinglePlanClass = turma.modalidade === 'LIVRE'
    || turma.modalidade === 'ESPECIALIZACAO';

  if (
    turma.modalidade === 'TECNICO'
    && turma.aceitaConcomitante === false
    && turma.aceitaSubsequente === false
  ) {
    throw new Error('A turma técnica deve aceitar ingresso concomitante, subsequente ou ambos.');
  }

  const dbData = {
    codigo: turma.codigo,
    nome: turma.nome,
    curso_id: turma.cursoId,
    polo_id: turma.poloId || '44444444-4444-4444-4444-444444444444', // fallback apenas para EAD
    data_inicio: turma.dataInicio || null,
    data_previsao_termino: turma.dataPrevisaoTermino || null,
    data_inicio_inscricao: turma.dataInicioInscricao || null,
    data_fim_inscricao: turma.dataFimInscricao || null,
    publicar_no_site: turma.publicarNoSite ?? false,
    permitir_inscricoes_online: turma.permitirInscricoesOnline ?? false,
    exige_matricula: turma.exigeMatricula === false ? false : true,
    aceita_concomitante: turma.modalidade === 'TECNICO'
      ? turma.aceitaConcomitante ?? true
      : false,
    aceita_subsequente: turma.modalidade === 'TECNICO'
      ? turma.aceitaSubsequente ?? true
      : true,
    serie_minima_ensino_medio: Number(turma.serieMinimaEnsinoMedio ?? 2),
    qtd_vagas_minima: turma.qtdVagasMinima === null || turma.qtdVagasMinima === undefined
      ? null
      : Number(turma.qtdVagasMinima),
    frequencia_minima_percent: Number(turma.frequenciaMinimaPercent ?? 75),
    media_minima: Number(turma.mediaMinima ?? 6),
    bloquear_matriculas_apos_completar_vagas: turma.bloquearMatriculasAposCompletarVagas ?? true,
    turno: turma.turno,
    status: turma.status || 'EM_ANDAMENTO',
    valor_matricula: Number(turma.valorMatricula ?? 0),
    valor_rematricula: Number(turma.valorRematricula ?? 0),
    qtd_parcelas: Number(turma.qtdParcelas ?? 0),
    valor_parcela: Number(turma.valorParcela ?? 0),
    desconto_pontualidade: Number(turma.descontoPontualidade ?? 0),
    juros_atraso: Number(turma.jurosAtraso ?? 0),
    multa_atraso: Number(turma.multaAtraso ?? 0),
    dia_vencimento_padrao: Number(turma.diaVencimentoPadrao || 10),
    primeiro_vencimento_padrao: turma.primeiroVencimentoPadrao || turma.dataInicio || null,
    cronograma_financeiro: Array.isArray(turma.cronogramaFinanceiro) ? turma.cronogramaFinanceiro : [],
    vagas_totais: Number(turma.vagasTotais) || 40,
    origem_financeira: turma.origemFinanceira || 'NORMAL',
    financeiro_herdado: turma.financeiroHerdado || false,
    gerar_cobrancas_futuras: turma.gerarCobrancasFuturas ?? isTechnical,
    sincronizar_asaas_futuro: turma.sincronizarAsaasFuturo ?? (isTechnical ? false : true),
    obs_financeira_origem: turma.obsFinanceiraOrigem || null,
    ...(isTechnical ? {
      cobrar_matricula: turma.cobrarMatricula ?? Number(turma.valorMatricula || 0) > 0,
      cobrar_rematricula: turma.cobrarRematricula ?? Number(turma.valorRematricula || 0) > 0,
      multa_atraso_percentual: Number(turma.multaAtrasoPercentual ?? 0),
      aplicar_desconto_matricula: turma.aplicarDescontoMatricula ?? false,
      aplicar_multa_juros_matricula: turma.aplicarMultaJurosMatricula ?? false,
      aplicar_desconto_mensalidade: turma.aplicarDescontoMensalidade ?? true,
      aplicar_multa_juros_mensalidade: turma.aplicarMultaJurosMensalidade ?? true,
      aplicar_desconto_rematricula: turma.aplicarDescontoRematricula ?? false,
      aplicar_multa_juros_rematricula: turma.aplicarMultaJurosRematricula ?? false,
      instrucao_boleto_carne: turma.instrucaoBoletoCarne?.trim(),
    } : {}),
  };

  if (isTechnical) {
    if (!turma.codigoCondicaoIndividual) {
      throw new Error('Defina o código de autorização das condições individuais.');
    }
    const { data: secureResult, error: secureError } = await supabase.rpc(
      'criar_turma_tecnica_com_codigo_condicao_secure',
      {
        p_request_id: requestId || crypto.randomUUID(),
        p_turma: dbData,
        p_codigo: turma.codigoCondicaoIndividual,
      },
    );
    if (secureError) {
      console.error('Erro ao criar turma técnica protegida:', secureError);
      throw secureError;
    }
    const created = (secureResult as { turma?: any } | null)?.turma;
    if (!created?.id) throw new Error('O banco não confirmou a criação da turma técnica.');
    return mapTurma({
      ...created,
      cursos: { nome: turma.cursoNome, modalidade: 'TECNICO' },
      polos: { nome: turma.poloNome },
      matriculas: [],
    });
  }

  if (isSinglePlanClass) {
    const plano = turma.planoFinanceiroUnico;
    if (!plano) {
      throw new Error('Defina o plano financeiro único antes de abrir a turma.');
    }

    const { data: secureResult, error: secureError } = await supabase.rpc(
      'criar_turma_plano_financeiro_unico_secure',
      {
        p_request_id: requestId || crypto.randomUUID(),
        p_turma: {
          codigo: dbData.codigo,
          nome: dbData.nome,
          curso_id: dbData.curso_id,
          polo_id: dbData.polo_id,
          data_inicio: dbData.data_inicio,
          data_previsao_termino: dbData.data_previsao_termino,
          data_inicio_inscricao: dbData.data_inicio_inscricao,
          data_fim_inscricao: dbData.data_fim_inscricao,
          publicar_no_site: dbData.publicar_no_site,
          permitir_inscricoes_online: dbData.permitir_inscricoes_online,
          serie_minima_ensino_medio: dbData.serie_minima_ensino_medio,
          qtd_vagas_minima: dbData.qtd_vagas_minima,
          frequencia_minima_percent: dbData.frequencia_minima_percent,
          media_minima: dbData.media_minima,
          bloquear_matriculas_apos_completar_vagas: dbData.bloquear_matriculas_apos_completar_vagas,
          turno: dbData.turno,
          status: dbData.status,
          vagas_totais: dbData.vagas_totais,
        },
        p_plano: plano,
      },
    );
    if (secureError) {
      console.error('Erro ao criar turma com plano financeiro único:', secureError);
      throw secureError;
    }
    const created = (secureResult as { turma?: any } | null)?.turma;
    if (!created?.id) {
      throw new Error('O banco não confirmou a criação da turma com plano financeiro.');
    }
    return mapTurma({
      ...created,
      cursos: { nome: turma.cursoNome, modalidade: turma.modalidade },
      polos: { nome: turma.poloNome },
      matriculas: [],
    });
  }

  const { data, error } = await supabase
    .from('turmas')
    .insert(dbData)
    .select('*, cursos(*), polos(nome)')
    .single();

  if (error) {
    console.error('Erro ao criar turma:', error);
    throw error;
  }

  return {
    id: data.id,
    codigo: data.codigo,
    nome: data.nome,
    cursoId: data.curso_id,
    cursoNome: data.cursos?.nome || '',
    modalidade: data.cursos?.modalidade || 'TECNICO',
    poloId: data.polo_id,
    poloNome: data.polos?.nome || '',
    dataInicio: data.data_inicio,
    dataPrevisaoTermino: data.data_previsao_termino,
    dataInicioInscricao: data.data_inicio_inscricao || null,
    dataFimInscricao: data.data_fim_inscricao || null,
    publicarNoSite: data.publicar_no_site ?? false,
    permitirInscricoesOnline: data.permitir_inscricoes_online ?? false,
    exigeMatricula: data.exige_matricula ?? true,
    aceitaConcomitante: data.aceita_concomitante ?? false,
    aceitaSubsequente: data.aceita_subsequente ?? true,
    serieMinimaEnsinoMedio: Number(data.serie_minima_ensino_medio ?? 2),
    bloquearMatriculasAposCompletarVagas: data.bloquear_matriculas_apos_completar_vagas ?? true,
    qtdVagasMinima: data.qtd_vagas_minima === null || data.qtd_vagas_minima === undefined
      ? undefined
      : Number(data.qtd_vagas_minima),
    frequenciaMinimaPercent: Number(data.frequencia_minima_percent ?? 75),
    mediaMinima: Number(data.media_minima ?? 6),
    turno: data.turno,
    status: data.status,
    alunosMatriculados: 0,
    alunosAtivos: 0,
    alunosInativos: 0,
    vagasTotais: data.vagas_totais,
    cobrarMatricula: data.cobrar_matricula ?? Number(data.valor_matricula || 0) > 0,
    valorMatricula: Number(data.valor_matricula),
    cobrarRematricula: data.cobrar_rematricula ?? Number(data.valor_rematricula || 0) > 0,
    valorRematricula: Number(data.valor_rematricula),
    qtdParcelas: Number(data.qtd_parcelas),
    valorParcela: Number(data.valor_parcela),
    descontoPontualidade: Number(data.desconto_pontualidade),
    jurosAtraso: Number(data.juros_atraso),
    multaAtraso: Number(data.multa_atraso),
    multaAtrasoPercentual: Number(data.multa_atraso_percentual || 0),
    aplicarDescontoMatricula: data.aplicar_desconto_matricula ?? false,
    aplicarMultaJurosMatricula: data.aplicar_multa_juros_matricula ?? false,
    aplicarDescontoMensalidade: data.aplicar_desconto_mensalidade ?? true,
    aplicarMultaJurosMensalidade: data.aplicar_multa_juros_mensalidade ?? true,
    aplicarDescontoRematricula: data.aplicar_desconto_rematricula ?? false,
    aplicarMultaJurosRematricula: data.aplicar_multa_juros_rematricula ?? false,
    diaVencimentoPadrao: Number(data.dia_vencimento_padrao || 10),
    primeiroVencimentoPadrao: data.primeiro_vencimento_padrao || '',
    instrucaoBoletoCarne: data.instrucao_boleto_carne || '',
    origemFinanceira: data.origem_financeira === 'LEGADO' ? 'LEGADO' : 'NORMAL',
    financeiroHerdado: data.financeiro_herdado || false,
    gerarCobrancasFuturas: data.gerar_cobrancas_futuras || false,
    sincronizarAsaasFuturo: data.sincronizar_asaas_futuro ?? true,
    obsFinanceiraOrigem: data.obs_financeira_origem || '',
  };
}
