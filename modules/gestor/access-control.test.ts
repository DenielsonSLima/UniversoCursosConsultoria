import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashboardAccessKey,
  canAccessCommunicationRoute,
  canAccessTab,
  canAccessGestorModule,
  canAccessGestaoTurmaTab,
  canAccessFinanceiroTab,
  DEFAULT_GESTAO_TURMA_TABS,
  getAllowedDashboardWidgets,
  getEffectiveGestaoTurmaTabs,
  getEffectiveFinanceiroTabs,
  type GestorPermissions,
} from './access-control.ts';
import {
  normalizeSecretariaAccessTabs,
  SECRETARIA_ACCESS_OPTIONS,
} from './secretaria/secretaria-access.ts';

const permissions = (overrides: Partial<GestorPermissions> = {}): GestorPermissions => ({
  modules: ['inicio', 'financeiro'],
  financeiroTabs: ['resumo', 'receber', 'conciliacao-bancaria'],
  allPolos: true,
  ...overrides,
});

test('rotas de Comunicação preservam permissões legadas sem ampliar acesso', () => {
  const internalOnly = permissions({
    modules: ['comunicacao'],
    financeiroTabs: [],
    tabs: { comunicacao: ['comunicacao-mensagem'] },
  });
  assert.equal(canAccessCommunicationRoute(internalOnly, 'comunicacao-atendimento'), true);
  assert.equal(canAccessCommunicationRoute(internalOnly, 'comunicacao-notificacoes-push'), true);
  assert.equal(canAccessCommunicationRoute(internalOnly, 'comunicacao-fluxos'), false);
  assert.equal(canAccessCommunicationRoute(internalOnly, 'comunicacao-configuracoes'), false);

  const whatsappOnly = permissions({
    modules: ['comunicacao'],
    financeiroTabs: [],
    tabs: { comunicacao: ['comunicacao-whatsapp'] },
  });
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-atendimento'), true);
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-atrasados'), true);
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-fluxos'), true);
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-agentes'), true);
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-configuracoes'), true);
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-notificacoes-push'), false);
  assert.equal(canAccessCommunicationRoute(whatsappOnly, 'comunicacao-automacoes'), false);
});

test('Automação multicanal exige sua permissão explícita e o módulo Comunicação', () => {
  const automationOnly = permissions({
    modules: ['comunicacao'],
    financeiroTabs: [],
    tabs: { comunicacao: ['comunicacao-automacoes'] },
  });
  assert.equal(canAccessCommunicationRoute(automationOnly, 'comunicacao-automacoes'), true);
  assert.equal(canAccessCommunicationRoute(automationOnly, 'comunicacao-atendimento'), false);

  const withoutCommunicationModule = permissions({
    modules: ['inicio'],
    financeiroTabs: [],
    tabs: { comunicacao: ['comunicacao-whatsapp', 'comunicacao-automacoes'] },
  });
  assert.equal(canAccessCommunicationRoute(withoutCommunicationModule, 'comunicacao-atendimento'), false);
  assert.equal(canAccessCommunicationRoute(withoutCommunicationModule, 'comunicacao-automacoes'), false);
});

test('usa financeiroTabs legado quando não existe escopo novo para o Financeiro', () => {
  const result = getEffectiveFinanceiroTabs(permissions());
  assert.deepEqual(result, ['resumo', 'receber', 'conciliacao-bancaria']);
  assert.equal(canAccessFinanceiroTab(permissions(), 'conciliacao-bancaria'), true);
});

test('reconhece Patrimônio e Empréstimos apenas quando estão na permissão explícita', () => {
  const permitido = permissions({
    modules: ['financeiro', 'patrimonio'],
    financeiroTabs: ['emprestimos'],
  });

  assert.equal(canAccessGestorModule(permitido, 'patrimonio'), true);
  assert.equal(canAccessFinanceiroTab(permitido, 'emprestimos'), true);
  assert.equal(canAccessFinanceiroTab(permitido, 'despesas'), false);
});

test('respeita tabs.financeiro como escopo efetivo e não amplia com o campo legado', () => {
  const scoped = permissions({
    financeiroTabs: ['resumo'],
    tabs: { financeiro: ['resumo', 'receber'] },
  });
  assert.deepEqual(getEffectiveFinanceiroTabs(scoped), ['resumo', 'receber']);
  assert.equal(canAccessFinanceiroTab(scoped, 'conciliacao-bancaria'), false);
});

test('injeta conciliação por compatibilidade quando legado ainda usava receber', () => {
  const scopedCompat = permissions({
    financeiroTabs: ['resumo', 'receber', 'despesas'],
    tabs: { financeiro: ['resumo', 'receber', 'despesas'] },
  });
  assert.deepEqual(
    getEffectiveFinanceiroTabs(scopedCompat),
    ['resumo', 'receber', 'despesas', 'conciliacao-bancaria'],
  );
  assert.equal(canAccessFinanceiroTab(scopedCompat, 'conciliacao-bancaria'), true);
});

test('um escopo financeiro novo vazio permanece sem abas', () => {
  const denied = permissions({ financeiroTabs: [], tabs: { financeiro: [] } });
  assert.deepEqual(getEffectiveFinanceiroTabs(denied), []);
});

test('se não houver escopo financeiro no novo formato, usa tabs legado', () => {
  const fallback = permissions({
    tabs: { secretaria: ['dashboard'] },
  });
  assert.deepEqual(getEffectiveFinanceiroTabs(fallback), ['resumo', 'receber', 'conciliacao-bancaria']);
  assert.equal(canAccessFinanceiroTab(fallback, 'conciliacao-bancaria'), true);
});

test('perfil legado com módulo Gestão mantém todas as abas das turmas', () => {
  const legacy = permissions({
    modules: ['inicio', 'gestao'],
    financeiroTabs: [],
    tabs: { secretaria: ['dashboard'] },
  });

  assert.deepEqual(getEffectiveGestaoTurmaTabs(legacy), DEFAULT_GESTAO_TURMA_TABS);
  assert.equal(canAccessGestaoTurmaTab(legacy, 'financeiro'), true);
  assert.equal(canAccessTab(legacy, 'gestao', 'configuracoes'), true);
});

test('permissões das turmas da Gestão ocultam abas não selecionadas', () => {
  const scoped = permissions({
    modules: ['inicio', 'gestao'],
    financeiroTabs: [],
    tabs: { gestao: ['resumo', 'alunos', 'diarios'] },
  });

  assert.deepEqual(getEffectiveGestaoTurmaTabs(scoped), ['resumo', 'alunos', 'diarios']);
  assert.equal(canAccessTab(scoped, 'gestao', 'diarios'), true);
  assert.equal(canAccessGestaoTurmaTab(scoped, 'financeiro'), false);
  assert.equal(canAccessGestaoTurmaTab(scoped, 'configuracoes'), false);
});

test('escopo explícito vazio da Gestão não libera nenhuma aba da turma', () => {
  const denied = permissions({
    modules: ['inicio', 'gestao'],
    financeiroTabs: [],
    tabs: { gestao: [] },
  });

  assert.deepEqual(getEffectiveGestaoTurmaTabs(denied), []);
});

test('expande os seis grupos legados para as operações reais da Secretaria', () => {
  const legacy = normalizeSecretariaAccessTabs([
    'solicitacoes',
    'carteirinhas',
    'declaracoes',
    'historico',
    'recebimentos',
    'fichas',
  ]);

  assert.equal(legacy.length, SECRETARIA_ACCESS_OPTIONS.length);
  assert.equal(legacy.includes('alunos'), true);
  assert.equal(legacy.includes('cracha-periodo-eleitoral'), true);
  assert.equal(legacy.includes('certificados'), true);
});

test('descarta a permissão removida de rematrícula sem afetar o grupo legado', () => {
  const ids = SECRETARIA_ACCESS_OPTIONS.map(option => String(option.id));
  assert.equal(ids.includes('rematricula'), false);
  assert.deepEqual(normalizeSecretariaAccessTabs(['rematricula']), []);

  const legacy = normalizeSecretariaAccessTabs(['solicitacoes']);
  assert.equal(legacy.includes('rematricula'), false);
  assert.equal(legacy.includes('solicitacoes'), true);
  assert.equal(legacy.includes('termo-estagio'), true);
  assert.equal(legacy.includes('transferencia'), true);
});

test('permissão granular da Secretaria não libera outra operação', () => {
  const granular = permissions({
    modules: ['inicio', 'secretaria'],
    financeiroTabs: [],
    tabs: { secretaria: ['declaracao-matricula'] },
  });

  assert.equal(
    canAccessTab(granular, 'secretaria', 'declaracao-matricula'),
    true,
  );
  assert.equal(
    canAccessTab(granular, 'secretaria', 'declaracao-frequencia'),
    false,
  );
  assert.equal(canAccessTab(granular, 'secretaria', 'alunos'), false);
});

test('perfil sem Financeiro nunca recebe widgets de valores', () => {
  const secretaria = permissions({
    modules: ['inicio', 'secretaria'],
    financeiroTabs: [],
    tabs: { secretaria: ['alunos', 'solicitacoes'] },
  });

  assert.deepEqual(
    getAllowedDashboardWidgets(secretaria),
    ['alunos-ativos', 'matriculas-mes', 'atividade-recente'],
  );
});

test('personalização do perfil reduz widgets sem ampliar permissões', () => {
  const financeiro = permissions({
    dashboardWidgets: ['receita-mes', 'fluxo-caixa'],
  });
  assert.deepEqual(
    getAllowedDashboardWidgets(financeiro),
    ['receita-mes', 'fluxo-caixa'],
  );

  const tentativaDeEscalada = permissions({
    modules: ['inicio', 'secretaria'],
    financeiroTabs: [],
    tabs: { secretaria: ['alunos'] },
    dashboardWidgets: ['receita-mes', 'inadimplencia', 'alunos-ativos'],
  });
  assert.deepEqual(getAllowedDashboardWidgets(tentativaDeEscalada), ['alunos-ativos']);
});

test('array explícito vazio mantém a tela inicial sem indicadores', () => {
  assert.deepEqual(
    getAllowedDashboardWidgets(permissions({ dashboardWidgets: [] })),
    [],
  );
});

test('Cadastros isolado não libera indicadores nem atividade acadêmica', () => {
  const cadastros = permissions({
    modules: ['inicio', 'cadastros'],
    financeiroTabs: [],
  });

  assert.deepEqual(getAllowedDashboardWidgets(cadastros), ['acoes-rapidas']);
});

test('Secretaria restrita a declarações não recebe dados acadêmicos agregados', () => {
  const declaracoes = permissions({
    modules: ['inicio', 'secretaria'],
    financeiroTabs: [],
    tabs: { secretaria: ['declaracao-matricula'] },
  });

  assert.deepEqual(getAllowedDashboardWidgets(declaracoes), []);
});

test('grupo legado da Secretaria preserva a Busca de Aluno 360º', () => {
  const legado = permissions({
    modules: ['inicio', 'secretaria'],
    financeiroTabs: [],
    tabs: { secretaria: ['declaracoes'] },
  });

  assert.deepEqual(
    getAllowedDashboardWidgets(legado),
    ['alunos-ativos', 'matriculas-mes', 'atividade-recente'],
  );
});

test('chave do cache muda por identidade e por escopo de acesso', () => {
  const first = permissions({
    modules: ['inicio', 'financeiro'],
    financeiroTabs: ['resumo'],
    dashboardWidgets: ['receita-mes'],
  });
  const second = permissions({
    modules: ['inicio', 'financeiro'],
    financeiroTabs: ['receber'],
    dashboardWidgets: ['receita-mes'],
  });

  assert.notEqual(buildDashboardAccessKey(first, 'perfil-a'), buildDashboardAccessKey(first, 'perfil-b'));
  assert.notEqual(buildDashboardAccessKey(first, 'perfil-a'), buildDashboardAccessKey(second, 'perfil-a'));
});
