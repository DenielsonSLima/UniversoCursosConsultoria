import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCaixaDetailedReport } from './caixa-report.mapper';

const totals = (quantity: number) => ({
  valor_base: quantity === 0 ? 0 : 14.9,
  juros_identificados: 0,
  multa_identificada: 0,
  acrescimo_identificado: 0,
  desconto_identificado: 0,
  diferenca_nao_discriminada: 0,
  valor_final: quantity === 0 ? 0 : 14.9,
  quantidade: quantity,
  quantidade_nao_discriminada: 0,
});

const summary = {
  versao: 2,
  meta: {
    competencia: '2026-07-01',
    periodo_inicio: '2026-07-01',
    periodo_fim_exclusivo: '2026-08-01',
    gerado_em: '2026-07-27T23:00:00Z',
    escopo_tipo: 'GLOBAL',
    polo_id: null,
    escopo_rotulo: 'Resultado geral',
    fonte_saldo: 'CONTABIL_SISTEMA',
    extrato_bancario_disponivel: false,
  },
  saldos_hoje: {
    registrado_total: 14.9,
    bancario_registrado: 14.9,
    caixa_local: 0,
    compartilhado_total: 14.9,
    posicao_compartilhada_escopo: 14.9,
    nao_atribuido: 0,
  },
  resumo_competencia: {
    entradas_recebidas_brutas: 14.9,
    tarifas_bancarias_confirmadas: 0,
    saidas_pagas: 0,
    resultado: 14.9,
    resultado_status: 'POSITIVO',
    quantidade_recebimentos: 1,
    quantidade_pagamentos: 0,
  },
  compromissos: {
    a_receber: 0,
    receber_vencido: 0,
    a_pagar: 0,
    pagar_vencido: 0,
  },
  receitas_por_modalidade: [
    { codigo: 'EAD', rotulo: 'Cursos EAD', valor: 14.9, quantidade: 1, percentual: 100 },
    { codigo: 'LIVRE', rotulo: 'Cursos livres', valor: 0, quantidade: 0, percentual: 0 },
    { codigo: 'TECNICO', rotulo: 'Cursos técnicos', valor: 0, quantidade: 0, percentual: 0 },
    { codigo: 'ESPECIALIZACAO', rotulo: 'Especialização', valor: 0, quantidade: 0, percentual: 0 },
  ],
  despesas_por_categoria: [],
  serie_mensal: [],
  contas: [],
  classificacao: {},
  conciliacao: {},
  qualidade_dados: {},
};

const receipt = {
  id: '11111111-1111-1111-1111-111111111111',
  data_pagamento: '2026-07-25',
  data_vencimento: '2026-07-25',
  descricao: 'Matrícula EAD',
  pagador: 'Aluno Teste',
  polo: 'Japoatã/SE',
  curso: 'Auxiliar Administrativo',
  modalidade: 'EAD',
  turma: 'EAD',
  parcela_numero: null,
  total_parcelas: null,
  tipo_lancamento: 'MATRICULA',
  forma_pagamento: 'BOLETO',
  conta: 'BANESE · Ag. 033 · Conta 03/100649-0',
  valor_base: 14.9,
  juros: 0,
  multa: 0,
  acrescimo: 0,
  desconto: 0,
  diferenca_nao_discriminada: 0,
  composicao_status: 'SEM_DIFERENCA_FINANCEIRA',
  valor_recebido: 14.9,
};

const makePayload = () => ({
  versao: 3,
  gerado_em: '2026-07-27T23:00:00Z',
  completo: true,
  confidencial: true,
  limite_por_tabela: 300,
  limite_total: 300,
  institucional: {
    id: '22222222-2222-2222-2222-222222222222',
    nome: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    cidade: 'Japoatã',
    estado: 'SE',
    endereco: '',
    numero: '',
    bairro: '',
    cep: '',
    telefone: '',
    email: '',
    logo_url: null,
    is_matriz: true,
    watermark_url: null,
    watermark_opacity: 0.1,
    watermark_scale: 50,
    watermark_rotate: true,
    landscape_watermark_url: null,
    landscape_watermark_opacity: 0.1,
    landscape_watermark_scale: 50,
    landscape_watermark_rotate: false,
  },
  resumo: JSON.parse(JSON.stringify(summary)) as typeof summary,
  totais_recebimentos: totals(1),
  totais_despesas: totals(0),
  resumo_cursos: {
    itens: [{
      curso_id: '33333333-3333-3333-3333-333333333333',
      curso: 'Técnico em Enfermagem',
      modalidade: 'TECNICO',
      previsto_no_mes: 900,
      recebido_no_mes: 750,
      em_atraso: 150,
      quantidade_parcelas: 6,
      quantidade_recebidas: 5,
      quantidade_em_atraso: 1,
      quantidade_turmas: 2,
      quantidade_alunos: 6,
    }],
    quantidade_cursos: 1,
    quantidade_omitidas: 0,
    totais: {
      previsto_no_mes: 900,
      recebido_no_mes: 750,
      em_atraso: 150,
      quantidade_turmas: 2,
      quantidade_alunos: 6,
    },
  },
  analise_recorrente: {
    modalidades: [{
      modalidade: 'TECNICO',
      rotulo: 'Cursos técnicos',
      previsto_no_mes: 900,
      recebido_no_mes: 750,
      em_atraso: 150,
      valor_base_recebido: 720,
      juros: 10,
      multa: 20,
      acrescimo: 0,
      desconto: 0,
      diferenca_nao_discriminada: 0,
      quantidade_parcelas: 6,
      quantidade_recebidas: 5,
      quantidade_em_atraso: 1,
      quantidade_cursos: 1,
      quantidade_turmas: 2,
      quantidade_alunos: 6,
    }],
    turmas: [{
      turma_id: '44444444-4444-4444-4444-444444444444',
      turma: 'TEC-ENF-2026.1 · Enfermagem Noturno',
      curso_id: '33333333-3333-3333-3333-333333333333',
      curso: 'Técnico em Enfermagem',
      modalidade: 'TECNICO',
      previsto_no_mes: 900,
      recebido_no_mes: 750,
      em_atraso: 150,
      valor_base_recebido: 720,
      juros: 10,
      multa: 20,
      acrescimo: 0,
      desconto: 0,
      diferenca_nao_discriminada: 0,
      quantidade_parcelas: 6,
      quantidade_recebidas: 5,
      quantidade_em_atraso: 1,
      quantidade_cursos: 1,
      quantidade_turmas: 1,
      quantidade_alunos: 6,
    }],
    totais: {
      previsto_no_mes: 900,
      recebido_no_mes: 750,
      em_atraso: 150,
      valor_base_recebido: 720,
      juros: 10,
      multa: 20,
      acrescimo: 0,
      desconto: 0,
      diferenca_nao_discriminada: 0,
      quantidade_parcelas: 6,
      quantidade_recebidas: 5,
      quantidade_em_atraso: 1,
      quantidade_cursos: 1,
      quantidade_turmas: 2,
      quantidade_alunos: 6,
    },
  },
  recebimentos: [{ ...receipt }],
  despesas: [],
});

test('aceita o contrato canônico completo sem recalcular valores', () => {
  const report = mapCaixaDetailedReport(makePayload());
  assert.equal(report.recebimentos[0].valorRecebido, 14.9);
  assert.equal(report.recebimentos[0].tipoLancamento, 'MATRICULA');
  assert.equal(report.resumoCursos.itens[0].recebidoNoMes, 750);
  assert.equal(report.analiseRecorrente.turmas[0].juros, 10);
});

test('recusa coerção de número enviado como texto', () => {
  const payload = makePayload();
  (payload.recebimentos[0] as any).valor_recebido = '14.90';
  assert.throws(() => mapCaixaDetailedReport(payload), /Contrato inválido/);
});

test('recusa contagem incompatível e IDs duplicados', () => {
  const countMismatch = makePayload();
  countMismatch.totais_recebimentos.quantidade = 2;
  assert.throws(() => mapCaixaDetailedReport(countMismatch), /truncado/);

  const duplicate = makePayload();
  duplicate.recebimentos.push({ ...receipt });
  duplicate.totais_recebimentos.quantidade = 2;
  assert.throws(() => mapCaixaDetailedReport(duplicate), /IDs duplicados/);
});
