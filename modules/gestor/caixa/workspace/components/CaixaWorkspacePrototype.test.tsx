import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CaixaWorkspaceAvailableSection,
  CaixaWorkspaceConsideredSource,
  CaixaWorkspaceIncompleteCode,
  CaixaWorkspaceLaterSection,
  CaixaWorkspacePayload,
} from '../caixa-workspace.types.ts';
import { CaixaWorkspacePrototype } from './CaixaWorkspacePrototype.tsx';

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

const availableSection = <T,>(
  dados: T,
  complete: boolean,
): CaixaWorkspaceAvailableSection<T> => complete
  ? {
    disponivel: true,
    completo: true,
    motivo: null,
    observacao: 'Dados canônicos disponíveis nesta etapa.',
    dados,
  }
  : {
    disponivel: true,
    completo: false,
    motivo: 'DADOS_INCOMPLETOS',
    observacao: 'Parte das fontes exige conferência.',
    dados,
  };

const createPayload = (incompleteReason?: CaixaWorkspaceIncompleteCode): CaixaWorkspacePayload => {
  const reasons = incompleteReason ? [incompleteReason] : [];
  const complete = reasons.length === 0;

  return {
    versao: 2,
    meta: {
      empresa_id: '33333333-3333-3333-3333-333333333333',
      competencia: '2026-09-01',
      periodo_inicio: '2026-09-01',
      periodo_fim_exclusivo: '2026-10-01',
      data_corte: '2026-09-27',
      data_institucional: '2026-09-27',
      timezone: 'America/Maceio',
      snapshot_id: 'caixa-v2-0123456789abcdef0123456789abcdef',
      gerado_em: '2026-09-27T18:30:00-03:00',
      escopo_tipo: 'POLO',
      polo_id: '44444444-4444-4444-4444-444444444444',
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
            motivos_incompletude: reasons,
            criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
            unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO',
            contas_competencia: { valor: '9007199254740993.07', quantidade: 12 },
            pagas_competencia: {
              valor: '2500.00',
              quantidade: 4,
              criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE',
            },
            a_vencer_competencia: { valor: '1200.50', quantidade: 3 },
            em_atraso: {
              valor: '300.25',
              quantidade: 2,
              data_mais_antiga: '2026-09-05',
            },
          }, complete),
          contas_a_receber: laterSection(),
          inadimplencia: laterSection(),
          agenda_financeira: availableSection({
            fontes_consideradas: consideredSources(),
            fontes_indisponiveis: [],
            motivos_incompletude: reasons,
            unidade_quantidade: 'TITULO_FISICO_SEM_DUPLICACAO',
            hoje: { data: '2026-09-27', valor: '50.00', quantidade: 1 },
            proximos_sete_dias: {
              periodo_inicio: '2026-09-28',
              periodo_fim_exclusivo: '2026-10-05',
              valor: '700.50',
              quantidade: 3,
            },
            dias: [
              '2026-09-27',
              '2026-09-28',
              '2026-09-29',
              '2026-09-30',
              '2026-10-01',
              '2026-10-02',
              '2026-10-03',
              '2026-10-04',
            ].map((data, index) => ({
              data,
              valor: index === 0 ? '50.00' : '100.00',
              quantidade: index === 0 ? 1 : 0,
            })),
          }, complete),
        },
      },
      fluxo: laterSection(),
      cobertura: laterSection(),
      posicoes: laterSection(),
      operacoes: laterSection(),
      qualidade_dados: availableSection({
        fontes_consideradas: consideredSources(),
        fontes_indisponiveis: [],
        motivos_incompletude: reasons,
        historico_contas_pagar_completo: true,
        obrigacoes_sem_vencimento: 0,
        obrigacoes_sem_data_registro: 0,
        pagamentos_sem_data: 0,
        pagamentos_sem_valor: incompleteReason === 'PAGAMENTOS_SEM_VALOR' ? 1 : 0,
        pagamentos_parciais_sem_estado: 0,
      }, complete),
    },
  };
};

const renderWorkspace = (payload = createPayload()) => renderToStaticMarkup(
  <CaixaWorkspacePrototype payload={payload} scopeLabel="Aracaju/SE" />,
);

test('primeira dobra apresenta urgência, competência e oito dias canônicos', () => {
  const html = renderWorkspace();

  assert.match(html, /Mesa de tesouraria/);
  assert.match(html, /Aracaju\/SE/);
  assert.match(html, /Em atraso no corte/);
  assert.match(html, /R\$ 300,25/);
  assert.match(html, /Contas da competência/);
  assert.match(html, /R\$ 9\.007\.199\.254\.740\.993,07/);
  assert.match(html, /Pagamentos realizados/);
  assert.match(html, /Valor inclui pagamentos parciais; quantidade exige quitação integral/);
  assert.match(html, /Agenda financeira/);
  assert.equal((html.match(/data-agenda-day=/g) || []).length, 8);
  assert.match(html, /Vencimentos de hoje aos próximos sete dias/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('estado incompleto mantém valores e explicita o motivo canônico', () => {
  const html = renderWorkspace(createPayload('PAGAMENTOS_SEM_VALOR'));

  assert.match(html, /data-workspace-state="incomplete"/);
  assert.match(html, /Contas a pagar em conferência/);
  assert.match(html, /Leitura parcial — dados em conferência/);
  assert.match(html, /Pagamentos sem valor confirmado/);
  assert.match(html, /R\$ 2\.500,00/);
  assert.match(html, /R\$ 700,50/);
});

test('zero canônico de atraso não sugere ausência de data', () => {
  const payload = createPayload();
  payload.secoes.compromissos.dados.contas_a_pagar.dados.em_atraso = {
    valor: '0.00',
    quantidade: 0,
    data_mais_antiga: null,
  };
  const html = renderWorkspace(payload);

  assert.match(html, /R\$ 0,00/);
  assert.match(html, /Nenhum título vencido no corte/);
  assert.doesNotMatch(html, /sem data vencida informada/);
});

test('camadas futuras exibem indisponibilidade e nunca simulam gráficos ou zeros', () => {
  const html = renderWorkspace();

  assert.equal((html.match(/data-workspace-state="unavailable"/g) || []).length, 3);
  assert.match(html, /Contas a receber: indisponível/);
  assert.match(html, /Inadimplência: indisponível/);
  assert.match(html, /Fluxo de caixa: indisponível/);
  assert.match(html, /Série temporal não fornecida/);
  assert.match(html, /Sem valor disponível/);
  assert.doesNotMatch(html, /<canvas|<svg[^>]+aria-label="Gráfico/);
});

test('componentes de apresentação não recalculam dinheiro, percentuais ou séries', () => {
  const componentsDir = join(
    process.cwd(),
    'modules/gestor/caixa/workspace/components',
  );
  const source = [
    'CaixaWorkspacePrototype.tsx',
    'CaixaWorkspaceAgenda.tsx',
    'CaixaWorkspaceSectionState.tsx',
  ].map((file) => readFileSync(join(componentsDir, file), 'utf8')).join('\n');

  assert.doesNotMatch(source, /parseFloat|parseInt|BigInt|\.reduce\(|Math\./);
  assert.doesNotMatch(source, /\.valor\s*[+*/-]|[+*/-]\s*[^\n;]*\.valor/);
  assert.doesNotMatch(source, /percentual|porcentagem/i);
});

test('cards financeiros oferecem acesso semântico ao drill-down quando integrados', () => {
  const html = renderToStaticMarkup(
    <CaixaWorkspacePrototype
      payload={createPayload()}
      scopeLabel="Aracaju/SE"
      onOpenPayables={() => undefined}
    />,
  );

  assert.equal((html.match(/aria-haspopup="dialog"/g) || []).length, 4);
  assert.equal((html.match(/aria-controls="caixa-workspace-payables-dialog"/g) || []).length, 4);
  assert.match(html, /Contas da competência/);
  assert.match(html, /Pagamentos realizados/);
  assert.match(html, /A vencer na competência/);
  assert.match(html, /Ver contas em atraso/);

  const source = readFileSync(join(
    process.cwd(),
    'modules/gestor/caixa/workspace/components/CaixaWorkspacePrototype.tsx',
  ), 'utf8');
  assert.match(source, /filter: 'COMPETENCIA'/);
  assert.match(source, /filter: 'PAGAS_COMPETENCIA'/);
  assert.match(source, /filter: 'A_VENCER_COMPETENCIA'/);
  assert.match(source, /onOpenPayables\('ATRASADAS'\)/);
});
