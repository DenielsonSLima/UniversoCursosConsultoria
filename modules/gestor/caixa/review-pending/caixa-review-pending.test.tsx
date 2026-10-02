import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supabase } from '../../../../lib/supabase';
import { parseCaixaReviewPage, type CaixaReviewRequest } from './caixa-review-pending.contract';
import { assertCaixaReviewRequest, caixaReviewKeys, caixaReviewQueryOptions, getCaixaReviewPage } from './caixa-review-pending.service';
import { parseCaixaReceivablesPosition } from './caixa-receivables-position.service';
import { CaixaReviewPendingPanel } from './CaixaReviewPendingPanel';
import { CaixaReceivablesPortfolio } from './CaixaReceivablesPortfolio';
import { handleReviewDialogKey } from './useReviewDialogFocus';
import { CaixaCommitmentTracks } from '../components/CaixaCommitmentTracks';
import { makeCaixaReportFixture } from '../report/caixa-report.fixture';

const request: CaixaReviewRequest = { poloId: '44444444-4444-4444-4444-444444444444',
  competencia: '2026-10-01', context: 'FUTURE', page: 1, pageSize: 20 };
const payload = () => ({ success: true, data: {
  ...request, dataCorte: '2026-10-02', geradoEm: '2026-10-02T12:00:00Z',
  totalPages: 1, totalCount: 1, totalNominal: '279.90',
  items: [{ id: 'synthetic-receivable', alunoNome: 'Aluno de teste', turmaNome: 'Turma demonstrativa',
    turmaCodigo: 'DEMO-01', matriculaCodigo: 'MAT-DEMO', proescRef: 'REF-DEMO',
    vencimento: '2026-10-05', valorNominal: '279.90', fonte: 'PROESC', observadoEm: null,
    motivos: [{ codigo: 'SOURCE_UNVERIFIED', descricao: 'Evidência histórica ainda em conferência.' }] }],
} });
const position = () => ({ success: true, data: {
  poloId: request.poloId, competencia: request.competencia, dataCorte: '2026-10-02', geradoEm: '2026-10-02T12:00:00Z',
  monthly: { openConfirmed: '12.34', overdue: '2.34', toDue: '10.00', count: 1, reviewCount: 1, reviewNominal: '279.90' },
  portfolio: { openConfirmed: '811125.80', overdue: '800000.00', toDue: '11125.80', count: 2000, reviewCount: 9, reviewNominal: '2519.10' },
} });
const noOp = () => undefined;
const findButton = (node: React.ReactNode, label: string): React.ReactElement<{ onClick: () => void }> | undefined => {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<{ children?: React.ReactNode; 'aria-label'?: string; onClick: () => void }>(child)) continue;
    if (child.props['aria-label'] === label) return child;
    const found = findButton(child.props.children, label); if (found) return found;
  }
};

test('parser aceita contrato canônico sem recompor dinheiro e rejeita escopo/campos privados', () => {
  const result = parseCaixaReviewPage(payload(), request);
  assert.equal(result.totalNominal, '279.90');
  assert.equal(result.items[0].valorNominal, '279.90');
  for (const data of [
    { ...payload().data, poloId: null }, { ...payload().data, context: 'MONTHLY' },
    { ...payload().data, competencia: '2026-09-01' }, { ...payload().data, totalNominal: 279.9 },
    { ...payload().data, totalPages: 9 }, { ...payload().data, totalCount: 2 },
    { ...payload().data, dataCorte: '2026-11-01' }, { ...payload().data, dataCorte: '2026-02-30' },
    { ...payload().data, items: [{ ...payload().data.items[0], cpf: 'synthetic-disallowed-field' }] },
  ]) assert.throws(() => parseCaixaReviewPage({ success: true, data }, request));
});

test('paginação fora da faixa retorna vazio sem confundir ausência de dados; nulos não viram identidade falsa', () => {
  const second = { ...request, page: 2 };
  assert.equal(parseCaixaReviewPage({ success: true, data: { ...payload().data, page: 2, items: [] } }, second).items.length, 0);
  const row = { ...payload().data.items[0], alunoNome: null, turmaNome: null, turmaCodigo: null,
    matriculaCodigo: null, proescRef: null, fonte: null };
  const result = parseCaixaReviewPage({ success: true, data: { ...payload().data, items: [row] } }, request);
  const html = renderToStaticMarkup(<CaixaReviewPendingPanel data={result} loading={false} error={null} onRetry={noOp} onPage={noOp} />);
  assert.match(html, /Não informado/);
  assert.match(html, /Fonte: Não informada/);
});

test('chaves segregam polo, mês, contexto e página; erro não repete automaticamente', () => {
  const original = caixaReviewKeys.page(request);
  for (const change of [{ poloId: null }, { competencia: '2026-09-01' }, { context: 'MONTHLY' as const }, { page: 2 }]) {
    assert.notDeepEqual(caixaReviewKeys.page({ ...request, ...change }), original);
  }
  const options = caixaReviewQueryOptions(request);
  assert.equal(options.retry, false); assert.equal(options.gcTime, 0);
  assert.equal(options.retryOnMount, false); assert.equal(options.refetchOnWindowFocus, false);
  assert.equal(options.refetchOnReconnect, false); assert.equal(options.placeholderData, undefined);
  assert.throws(() => assertCaixaReviewRequest({ ...request, page: 0 }));
  assert.throws(() => assertCaixaReviewRequest({ ...request, pageSize: 101 }));
});

test('serviço encaminha somente recorte permitido e AbortSignal; erros não expõem conteúdo remoto', async () => {
  const previous = supabase.rpc;
  const controller = new AbortController();
  let signal: AbortSignal | undefined;
  let calls = 0;
  supabase.rpc = ((name: string, params: Record<string, unknown>) => {
    calls++;
    assert.equal(name, 'get_caixa_review_pending_page_secure');
    assert.deepEqual(params, { p_polo_id: request.poloId, p_competencia: request.competencia,
      p_context: 'FUTURE', p_page: 1, p_page_size: 20 });
    return { abortSignal(value: AbortSignal) { signal = value; return this; },
      then(resolve: (value: unknown) => void) { resolve({ data: payload(), error: null }); } };
  }) as typeof supabase.rpc;
  try {
    await getCaixaReviewPage(request, controller.signal);
    assert.equal(signal, controller.signal); assert.equal(calls, 1);
    supabase.rpc = (() => Promise.resolve({ data: null, error: { code: '42501', message: 'private-data' } })) as unknown as typeof supabase.rpc;
    await assert.rejects(getCaixaReviewPage(request), (error: Error) => /Seu acesso/.test(error.message) && !error.message.includes('private-data'));
  } finally { supabase.rpc = previous; }
});

test('painel mostra aluno/turma/matrícula/ref/vencimento/motivo e estados loading/erro/vazio distintos', () => {
  const data = parseCaixaReviewPage(payload(), request);
  const render = (props: Partial<React.ComponentProps<typeof CaixaReviewPendingPanel>>) => renderToStaticMarkup(
    <CaixaReviewPendingPanel data={data} loading={false} error={null} onRetry={noOp} onPage={noOp} {...props} />);
  const html = render({});
  for (const text of ['Aluno de teste', 'Turma demonstrativa', 'MAT-DEMO', 'REF-DEMO', '05/10/2026', '279,90', 'Evidência histórica']) assert.ok(html.includes(text));
  assert.match(html, /Estes registros não comprovam cobrança em aberto nem inadimplência/);
  assert.match(html, /divergências de importação, quitações ou cancelamentos ainda não conciliados/);
  assert.match(html, /Vencimento cadastrado/);
  assert.match(html, /Valor nominal cadastrado/);
  assert.doesNotMatch(html, /Atualizar lista/);
  assert.match(html, /acompanha automaticamente as atualizações financeiras recebidas pelo sistema, sem consulta direta ao Proesc/);
  assert.doesNotMatch(html, /cobrança\(s\) em conferência|Pendências da inadimplência/);
  assert.match(render({ loading: true }), /Carregando registros em conferência/);
  assert.doesNotMatch(render({ loading: true }), /Aluno de teste/);
  assert.match(render({ error: 'Falha segura' }), /role="alert"/);
  assert.doesNotMatch(render({ error: 'Falha segura' }), /Aluno de teste/);
  assert.match(render({ data: { ...data, totalCount: 0, totalNominal: '0.00', items: [] } }), /Nenhum registro em conferência neste recorte/);
});

test('atualização manual não aparece no sucesso; erro preserva callback de tentar novamente', () => {
  let retries = 0;
  const props = { data: parseCaixaReviewPage(payload(), request), loading: false,
    onRetry: () => { retries++; }, onPage: noOp };
  const success = renderToStaticMarkup(<CaixaReviewPendingPanel {...props} error={null} />);
  assert.doesNotMatch(success, /Atualizar lista|Tentar novamente/);
  const errorTree = CaixaReviewPendingPanel({ ...props, error: 'Falha segura' });
  const retryButton = React.Children.toArray(errorTree.props.children).find((node) =>
    React.isValidElement(node) && node.type === 'button') as React.ReactElement<{ onClick: () => void }>;
  assert.match(renderToStaticMarkup(errorTree), /Tentar novamente/);
  retryButton.props.onClick();
  assert.equal(retries, 1);
});

test('paginação usa página fornecida pelo servidor e callback real', () => {
  let page = 0;
  const tree = CaixaReviewPendingPanel({ data: { ...payload().data, page: 2, totalPages: 3, totalCount: 45 },
    loading: false, error: null, onRetry: noOp, onPage: (value) => { page = value; } });
  findButton(tree, 'Próxima página de registros')!.props.onClick(); assert.equal(page, 3);
  findButton(tree, 'Página anterior de registros')!.props.onClick(); assert.equal(page, 1);
});

test('foco circula com Tab/Shift+Tab; Esc solicita fechamento', () => {
  let focused = ''; let closed = false; let prevented = false;
  const first = { focus: () => { focused = 'first'; } } as HTMLElement;
  const last = { focus: () => { focused = 'last'; } } as HTMLElement;
  const event = (key: string, shiftKey = false) => ({ key, shiftKey, preventDefault: () => { prevented = true; } });
  handleReviewDialogKey(event('Tab'), [first, last], last, noOp); assert.equal(focused, 'first'); assert.equal(prevented, true);
  handleReviewDialogKey(event('Tab', true), [first, last], first, noOp); assert.equal(focused, 'last');
  handleReviewDialogKey(event('Escape'), [first, last], first, () => { closed = true; }); assert.equal(closed, true);
});

test('mensal não usa carteira geral; card geral e callbacks preservam os campos independentes', () => {
  const data = parseCaixaReceivablesPosition(position(), request.poloId, request.competencia);
  const statement = makeCaixaReportFixture().resumo;
  statement.compromissos.aReceber = 811125.8;
  let context = '';
  const tree = CaixaCommitmentTracks({ statement, isPayablesLoading: false, hasPayablesError: true,
    receivablesPosition: data, onReviewPending: (value) => { context = value; } });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Em aberto no mês/); assert.match(html, /12,34/);
  assert.doesNotMatch(html, /811\.125,80|Inadimplência parcial/); assert.match(html, /Registros em conferência — mês/);
  assert.match(html, /não comprovam cobrança em aberto nem inadimplência/);
  const visit = (node: React.ReactNode) => { for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<{ children?: React.ReactNode; 'aria-haspopup'?: string; onClick?: () => void }>(child)) continue;
    if (child.props['aria-haspopup'] === 'dialog') child.props.onClick?.(); else visit(child.props.children);
  } };
  visit(tree); assert.equal(context, 'MONTHLY');
  const portfolio = CaixaReceivablesPortfolio({ position: data, loading: false, hasError: false, onRetry: noOp, onReview: () => { context = 'FUTURE'; } });
  visit(portfolio); assert.equal(context, 'FUTURE');
  const general = renderToStaticMarkup(portfolio);
  for (const value of ['811.125,80', '800.000,00', '11.125,80', '2.519,10']) assert.ok(general.includes(value));
  assert.match(general, /9 registro\(s\) local\(is\)/); assert.match(general, /reexpressa na data de corte/);
  assert.match(general, /Registros em conferência — carteira/);
  assert.match(general, /não comprovam cobrança em aberto nem inadimplência/);
  const unavailable = renderToStaticMarkup(<CaixaCommitmentTracks statement={statement} isPayablesLoading={false}
    hasPayablesError={false} hasReceivablesError receivablesPosition={data} />);
  assert.match(unavailable, /Posição mensal indisponível/); assert.doesNotMatch(unavailable, /811\.125,80|12,34/);
});

test('montagem real isola recorte e mantém diálogo tela cheia com retorno de foco', () => {
  const source = (path: string) => readFileSync(`modules/gestor/caixa/${path}`, 'utf8');
  const page = source('CaixaPage.tsx');
  assert.match(page, /review\?\.scope === reviewScope/);
  assert.match(page, /setReview\(null\);.*\[reviewScope\]/);
  assert.match(page, /positionCutMismatch/);
  const modal = source('review-pending/CaixaReviewPendingModal.tsx');
  assert.match(modal, /fixed inset-0.*h-\[100dvh\]/);
  assert.match(modal, /aria-modal="true"/); assert.match(modal, /createPortal/);
  assert.match(modal, /Registros em conferência — mês/);
  assert.match(modal, /Registros em conferência — carteira/);
  assert.doesNotMatch(modal, /Pendências da inadimplência|Pendências da carteira/);
  const focus = source('review-pending/useReviewDialogFocus.ts');
  assert.match(focus, /previous\?\.isConnected/); assert.match(focus, /previous\.focus\(\)/);
  assert.match(source('useCaixaRealtime.ts'), /caixaReviewKeys\.forPolo\(scope\)/);
});
