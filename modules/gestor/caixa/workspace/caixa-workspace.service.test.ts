import assert from 'node:assert/strict';
import test from 'node:test';
import { supabase } from '../../../../lib/supabase.ts';
import type { CaixaWorkspacePayload } from './caixa-workspace.types.ts';
import {
  CaixaWorkspaceV2ClientContractError,
  assertCaixaWorkspaceV2ResponseMatchesRequest,
  getCaixaWorkspaceV2,
} from './caixa-workspace.service.ts';

const EMPRESA_ID = '33333333-3333-3333-3333-333333333333';
const OUTRA_EMPRESA_ID = '55555555-5555-5555-5555-555555555555';
const POLO_ID = '44444444-4444-4444-4444-444444444444';

const laterSection = () => ({
  disponivel: false as const,
  completo: false as const,
  motivo: 'ETAPA_POSTERIOR' as const,
  observacao: 'Seção reservada para etapa posterior.',
  dados: null,
});

const sources = () => ([
  { fonte: 'public.contas_pagar' as const, finalidade: 'TITULOS_LEGADOS' as const },
  { fonte: 'public.despesas_lancamentos' as const, finalidade: 'DESPESAS' as const },
  {
    fonte: 'public.despesas_lancamentos_rateios' as const,
    finalidade: 'RATEIO_ECONOMICO' as const,
  },
]);

const availableSection = <T>(dados: T) => ({
  disponivel: true as const,
  completo: true as const,
  motivo: null,
  observacao: 'Dados canônicos disponíveis.',
  dados,
});

const createPayload = (): CaixaWorkspacePayload => ({
  versao: 2,
  meta: {
    empresa_id: EMPRESA_ID,
    competencia: '2026-09-01',
    periodo_inicio: '2026-09-01',
    periodo_fim_exclusivo: '2026-10-01',
    data_corte: '2026-09-27',
    data_institucional: '2026-09-27',
    timezone: 'America/Maceio',
    snapshot_id: 'caixa-v2-0123456789abcdef0123456789abcdef',
    gerado_em: '2026-09-27T18:30:00-03:00',
    escopo_tipo: 'POLO',
    polo_id: POLO_ID,
    meses_historico: 6,
    criterio_posicao: 'POSICAO_REEXPRESSA_NO_CORTE',
    criterio_historico: 'POSICAO_REEXPRESSA_NO_CORTE',
    criterio_realizado: 'PAGAMENTO_EFETIVO_ATE_CORTE',
  },
  regras: {
    compromissos_abertos_impactam_realizado: false,
    compromissos_abertos_impactam_posicoes: false,
    rateio_economico_duplica_baixa_fisica: false,
    moeda: 'DECIMAL_TEXT_2',
  },
  secoes: {
    resumo_executivo: laterSection(),
    compromissos: {
      disponivel: true,
      completo: false,
      motivo: 'SUBSECOES_EM_ETAPA_POSTERIOR',
      observacao: 'Recebíveis e inadimplência permanecem em etapa posterior.',
      dados: {
        fontes_consideradas: sources(),
        fontes_indisponiveis: [
          { fonte: 'CONTAS_A_RECEBER_CANONICA', motivo: 'ETAPA_POSTERIOR' },
          { fonte: 'INADIMPLENCIA_CANONICA', motivo: 'ETAPA_POSTERIOR' },
        ],
        contas_a_pagar: availableSection({
          fontes_consideradas: sources(),
          fontes_indisponiveis: [],
          motivos_incompletude: [],
          criterio: 'POSICAO_REEXPRESSA_NO_CORTE' as const,
          unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO' as const,
          contas_competencia: { valor: '9007199254740993.07', quantidade: 12 },
          pagas_competencia: {
            valor: '2500.00',
            quantidade: 4,
            criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE' as const,
          },
          a_vencer_competencia: { valor: '1200.50', quantidade: 3 },
          em_atraso: { valor: '300.25', quantidade: 2, data_mais_antiga: '2026-09-05' },
        }),
        contas_a_receber: laterSection(),
        inadimplencia: laterSection(),
        agenda_financeira: availableSection({
          fontes_consideradas: sources(),
          fontes_indisponiveis: [],
          motivos_incompletude: [],
          unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO' as const,
          hoje: { data: '2026-09-27', valor: '50.00', quantidade: 1 },
          proximos_sete_dias: {
            periodo_inicio: '2026-09-28',
            periodo_fim_exclusivo: '2026-10-05',
            valor: '700.50',
            quantidade: 3,
          },
          dias: Array.from({ length: 8 }, (_, index) => ({
            data: `2026-${index < 4 ? '09' : '10'}-${String(index < 4 ? 27 + index : index - 3).padStart(2, '0')}`,
            valor: index === 0 ? '50.00' : '100.00',
            quantidade: index === 0 ? 1 : 0,
          })),
        }),
      },
    },
    fluxo: laterSection(),
    cobertura: laterSection(),
    posicoes: laterSection(),
    operacoes: laterSection(),
    qualidade_dados: availableSection({
      fontes_consideradas: sources(),
      fontes_indisponiveis: [],
      motivos_incompletude: [],
      historico_contas_pagar_completo: true,
      obrigacoes_sem_vencimento: 0,
      obrigacoes_sem_data_registro: 0,
      pagamentos_sem_data: 0,
      pagamentos_sem_valor: 0,
      pagamentos_parciais_sem_estado: 0,
    }),
  },
});

const request = {
  empresaId: EMPRESA_ID,
  poloId: POLO_ID,
  competencia: '2026-09-01',
  mesesHistorico: 6,
};

test('chama a RPC segura com quatro argumentos, propaga AbortSignal e preserva dinheiro textual', async (t) => {
  let name = '';
  let args: Record<string, unknown> = {};
  let receivedSignal: AbortSignal | undefined;
  t.mock.method(supabase, 'rpc', (rpcName: string, rpcArgs: Record<string, unknown>) => {
    name = rpcName;
    args = rpcArgs;
    return {
      abortSignal(signal: AbortSignal) {
        receivedSignal = signal;
        return this;
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: createPayload(), error: null }).then(resolve);
      },
    };
  });
  const controller = new globalThis.AbortController();

  const payload = await getCaixaWorkspaceV2(request, controller.signal);

  assert.equal(name, 'get_caixa_workspace_v2_secure');
  assert.deepEqual(args, {
    p_company_id: EMPRESA_ID,
    p_polo_id: POLO_ID,
    p_competencia: '2026-09-01',
    p_meses_historico: 6,
  });
  assert.equal(receivedSignal, controller.signal);
  assert.equal(
    payload.secoes.compromissos.dados.contas_a_pagar.dados.contas_competencia.valor,
    '9007199254740993.07',
  );
});

test('normaliza o escopo global para polo nulo', async (t) => {
  const payload = createPayload();
  payload.meta.escopo_tipo = 'GLOBAL';
  payload.meta.polo_id = null;
  let args: Record<string, unknown> = {};
  t.mock.method(supabase, 'rpc', (_name: string, rpcArgs: Record<string, unknown>) => {
    args = rpcArgs;
    return Promise.resolve({ data: payload, error: null });
  });

  await getCaixaWorkspaceV2({ ...request, poloId: 'todos' });

  assert.equal(args.p_polo_id, null);
});

test('rejeita resposta válida que não corresponde à empresa, escopo, competência ou histórico', () => {
  const payload = createPayload();
  const mismatches = [
    { ...request, empresaId: OUTRA_EMPRESA_ID },
    { ...request, poloId: null },
    { ...request, competencia: '2026-08-01' },
    { ...request, mesesHistorico: 5 },
  ];
  mismatches.forEach((mismatch) => {
    assert.throws(
      () => assertCaixaWorkspaceV2ResponseMatchesRequest(payload, mismatch),
      CaixaWorkspaceV2ClientContractError,
    );
  });
});

test('rejeita contrato físico inválido antes de expor o payload ao consumidor', async (t) => {
  const payload = createPayload() as unknown as Record<string, unknown>;
  payload.versao = 1;
  t.mock.method(supabase, 'rpc', () => Promise.resolve({ data: payload, error: null }));

  await assert.rejects(
    getCaixaWorkspaceV2(request),
    CaixaWorkspaceV2ClientContractError,
  );
});

test('valida parâmetros antes de abrir a RPC', async (t) => {
  const rpc = t.mock.method(supabase, 'rpc', () => Promise.resolve({ data: null, error: null }));

  await assert.rejects(
    getCaixaWorkspaceV2({ ...request, mesesHistorico: 13 }),
    CaixaWorkspaceV2ClientContractError,
  );
  assert.equal(rpc.mock.callCount(), 0);
});
