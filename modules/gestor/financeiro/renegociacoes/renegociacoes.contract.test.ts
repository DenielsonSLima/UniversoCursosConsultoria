import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('serviço usa apenas RPCs canônicos e save envia CAS sem snapshot do cliente', async () => {
  const [service, payloads] = await Promise.all([
    read('./renegociacoes.service.ts'),
    read('./renegociacoes.payloads.ts'),
  ]);
  for (const rpc of [
    'get_receivable_renegotiation_readiness_secure',
    'list_receivable_renegotiation_candidate_groups_secure',
    'list_receivable_renegotiation_candidate_items_secure',
    'preview_receivable_renegotiation_secure',
    'save_receivable_renegotiation_proposal_secure',
    'list_receivable_renegotiation_proposals_secure',
    'get_receivable_renegotiation_proposal_secure',
    'discard_receivable_renegotiation_proposal_secure',
  ])
    assert.match(service, new RegExp(rpc));
  assert.match(payloads, /p_expected_proposal_fingerprint/);
  assert.match(payloads, /p_expected_version/);
  assert.doesNotMatch(payloads, /snapshot|totals|schedule/);
});

test('interface não simula ativação e informa escopo inicial', async () => {
  const [tab, wizard, detail] = await Promise.all([
    read('./RenegociacoesTab.tsx'),
    read('./components/RenegociacaoWizard.tsx'),
    read('./components/ProposalDetail.tsx'),
  ]);
  assert.match(tab, /Escopo inicial/);
  assert.match(tab, /Proesc, EAD e parcelas com pagamento parcial/);
  assert.match(wizard.replace(/\s+/g, ' '), /Nenhum título original será cancelado, substituído ou enviado ao banco/);
  assert.match(detail.replace(/\s+/g, ' '), /ativação e a emissão dos novos títulos ficarão disponíveis/);
  assert.doesNotMatch(`${tab}${wizard}${detail}`, /activate_receivable|cancel_source|issue_replacement/i);
});

test('realtime cobre fontes da renegociação e recupera reconexão', async () => {
  const source = await read('./hooks/useRenegociacoesRealtime.ts');
  assert.match(source, /finance_realtime_events/);
  assert.match(source, /contas_receber/);
  assert.match(source, /receivable_renegotiation_agreements/);
  assert.match(source, /receivable_renegotiation_events/);
  assert.match(source, /status === 'SUBSCRIBED'/);
  assert.match(source, /}, 250\)/);
});

test('navegação e modais usam composição fullscreen responsiva com pilha de foco', async () => {
  const [panels, wizard, detail, focusHook, steps] = await Promise.all([
    read('./components/RenegociacaoPanels.tsx'),
    read('./components/RenegociacaoWizard.tsx'),
    read('./components/ProposalDetail.tsx'),
    read('./hooks/useRenegociacaoDialogFocus.ts'),
    read('./components/WizardSteps.tsx'),
  ]);
  assert.match(panels, /grid-cols-2/);
  assert.match(panels, /sm:grid-cols-4/);
  assert.doesNotMatch(panels, /overflow-x-auto|min-w-max/);
  assert.match(wizard, /h-\[100dvh\] w-screen/);
  assert.doesNotMatch(wizard, /94vh|sm:max-w-5xl/);
  assert.match(detail, /createPortal/);
  assert.match(detail, /h-\[100dvh\] w-screen/);
  assert.match(focusHook, /openDialogs/);
  assert.match(focusHook, /isTopDialog/);
  assert.match(steps, /Não calculado|formatCandidateAmount/);
  assert.match(steps, /disabled=\{blocked\}/);
});
