import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CaixaWorkspaceAvailableSection,
  CaixaWorkspaceConsideredSource,
  CaixaWorkspaceLaterSection,
  CaixaWorkspacePayload,
} from '../caixa-workspace.types.ts';
import { caixaWorkspaceV2QueryOptions } from '../caixa-workspace.queries.ts';
import {
  CaixaWorkspaceErrorState,
  CaixaWorkspaceView,
} from './CaixaWorkspaceView.tsx';

const empresaId = '33333333-3333-3333-3333-333333333333';
const poloId = '44444444-4444-4444-4444-444444444444';
const competencia = '2026-09-01';

const consideredSources = (): CaixaWorkspaceConsideredSource[] => [
  { fonte: 'public.contas_pagar', finalidade: 'TITULOS_LEGADOS' },
  { fonte: 'public.despesas_lancamentos', finalidade: 'DESPESAS' },
  {
    fonte: 'public.despesas_lancamentos_rateios',
    finalidade: 'RATEIO_ECONOMICO',
  },
];

const laterSection = (): CaixaWorkspaceLaterSection => ({
  disponivel: false,
  completo: false,
  motivo: 'ETAPA_POSTERIOR',
  observacao: 'Seção reservada para uma etapa posterior do contrato v2.',
  dados: null,
});

const availableSection = <T,>(dados: T): CaixaWorkspaceAvailableSection<T> => ({
  disponivel: true,
  completo: true,
  motivo: null,
  observacao: 'Dados canônicos disponíveis nesta etapa.',
  dados,
});

const payload = (): CaixaWorkspacePayload => ({
  versao: 2,
  meta: {
    empresa_id: empresaId,
    competencia,
    periodo_inicio: competencia,
    periodo_fim_exclusivo: '2026-10-01',
    data_corte: '2026-09-27',
    data_institucional: '2026-09-27',
    timezone: 'America/Maceio',
    snapshot_id: 'caixa-v2-0123456789abcdef0123456789abcdef',
    gerado_em: '2026-09-27T18:30:00-03:00',
    escopo_tipo: 'POLO',
    polo_id: poloId,
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
      observacao: 'Contas a pagar e agenda estão disponíveis nesta etapa.',
      dados: {
        fontes_consideradas: consideredSources(),
        fontes_indisponiveis: [
          { fonte: 'CONTAS_A_RECEBER_CANONICA', motivo: 'ETAPA_POSTERIOR' },
          { fonte: 'INADIMPLENCIA_CANONICA', motivo: 'ETAPA_POSTERIOR' },
        ],
        contas_a_pagar: availableSection({
          fontes_consideradas: consideredSources(),
          fontes_indisponiveis: [],
          motivos_incompletude: [],
          criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
          unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO',
          contas_competencia: { valor: '9007199254740993.07', quantidade: 12 },
          pagas_competencia: {
            valor: '2500.00',
            quantidade: 4,
            criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE',
          },
          a_vencer_competencia: { valor: '1200.50', quantidade: 3 },
          em_atraso: { valor: '300.25', quantidade: 2, data_mais_antiga: '2026-09-05' },
        }),
        contas_a_receber: laterSection(),
        inadimplencia: laterSection(),
        agenda_financeira: availableSection({
          fontes_consideradas: consideredSources(),
          fontes_indisponiveis: [],
          motivos_incompletude: [],
          unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO',
          hoje: { data: '2026-09-27', valor: '50.00', quantidade: 1 },
          proximos_sete_dias: {
            periodo_inicio: '2026-09-28',
            periodo_fim_exclusivo: '2026-10-05',
            valor: '700.50',
            quantidade: 3,
          },
          dias: [
            '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
            '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
          ].map((data) => ({ data, valor: '100.00', quantidade: 1 })),
        }),
      },
    },
    fluxo: laterSection(),
    cobertura: laterSection(),
    posicoes: laterSection(),
    operacoes: laterSection(),
    qualidade_dados: availableSection({
      fontes_consideradas: consideredSources(),
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

const request = (selectedPoloId = poloId) => ({
  empresaId,
  poloId: selectedPoloId,
  competencia,
  mesesHistorico: 6,
});

const renderView = (client: QueryClient, selectedPoloId = poloId) => renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <CaixaWorkspaceView
      empresaId={empresaId}
      poloId={selectedPoloId}
      competencia={competencia}
      scopeLabel="Aracaju/SE"
      companyPoloIds={[poloId]}
    />
  </QueryClientProvider>,
);

test('sem cache renderiza skeleton estável e acessível', () => {
  const client = new QueryClient();
  try {
    const html = renderView(client);
    assert.match(html, /Carregando mesa de tesouraria/);
    assert.match(html, /aria-busy="true"/);
    assert.equal((html.match(/data-skeleton-agenda-day/g) || []).length, 8);
    assert.doesNotMatch(html, /Mesa de tesouraria indisponível/);
  } finally {
    client.clear();
  }
});

test('cache canônico do escopo renderiza somente o protótipo v2', () => {
  const client = new QueryClient();
  try {
    client.setQueryData(caixaWorkspaceV2QueryOptions(request()).queryKey, payload());
    const html = renderView(client);
    assert.match(html, /Mesa de tesouraria/);
    assert.match(html, /Aracaju\/SE/);
    assert.match(html, /R\$ 300,25/);
    assert.doesNotMatch(html, /Carregando mesa de tesouraria/);
  } finally {
    client.clear();
  }
});

test('troca de polo não reutiliza dados do escopo anterior', () => {
  const client = new QueryClient();
  try {
    client.setQueryData(caixaWorkspaceV2QueryOptions(request()).queryKey, payload());
    const html = renderView(client, '55555555-5555-5555-5555-555555555555');
    assert.match(html, /Carregando mesa de tesouraria/);
    assert.doesNotMatch(html, /R\$ 300,25|Aracaju\/SE/);
  } finally {
    client.clear();
  }
});

test('erro fica isolado e oferece retry sem fallback legado', () => {
  const html = renderToStaticMarkup(
    <CaixaWorkspaceErrorState isRetrying={false} onRetry={() => undefined} />,
  );
  assert.match(html, /Mesa de tesouraria indisponível/);
  assert.match(html, /Tentar novamente/);
  assert.match(html, /Nenhum dado parcial deste workspace foi exibido/);

  const source = readFileSync(join(
    process.cwd(),
    'modules/gestor/caixa/workspace/components/CaixaWorkspaceView.tsx',
  ), 'utf8');
  assert.match(source, /useQuery\(caixaWorkspaceV2QueryOptions\(request\)\)/);
  assert.match(source, /useCaixaWorkspaceRealtime\(\{/);
  assert.match(source, /void workspaceQuery\.refetch\(\)/);
  assert.doesNotMatch(source, /placeholderData|keepPreviousData/);
  assert.doesNotMatch(source, /CaixaStatementSection|CaixaContasPagarResumoCard|fallback/i);
  assert.doesNotMatch(source, /parseFloat|parseInt|\.reduce\(|Math\./);
});
