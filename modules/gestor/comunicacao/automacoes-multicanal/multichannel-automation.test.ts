// @ts-nocheck -- executado pelo Deno; o tsconfig principal cobre apenas o runtime web.
import {
  MULTICHANNEL_AUTOMATION_CATALOG,
  normalizeMultichannelCourseModalities,
} from './multichannel-automation.catalog.ts';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test('normaliza aliases legados sem duplicar modalidades', () => {
  const result = normalizeMultichannelCourseModalities([
    'LIVRES',
    'livre',
    'TÉCNICO',
    'ESPECIALIZAÇÃO',
    'EAD',
    'desconhecida',
  ]);

  assert(
    JSON.stringify(result) === JSON.stringify(['LIVRE', 'TECNICO', 'ESPECIALIZACAO', 'EAD']),
    `Modalidades inesperadas: ${JSON.stringify(result)}`,
  );
});

Deno.test('catálogo cobre os cinco eventos e usa tokens completos', () => {
  assert(MULTICHANNEL_AUTOMATION_CATALOG.length === 5, 'O catálogo deve conter cinco eventos iniciais.');
  const variables = MULTICHANNEL_AUTOMATION_CATALOG.flatMap((item) => item.variables);
  assert(variables.every((value) => /^\{\{[a-z_]+\}\}$/.test(value)), 'Tokens devem usar {{nome_variavel}}.');
  assert(variables.includes('{{cpf_final}}'), 'O catálogo financeiro deve preservar cpf_final.');
});

Deno.test('fundação persiste rotas por modalidade e não libera escrita direta', async () => {
  const migrationUrl = new URL(
    '../../../../supabase/migrations/20260802174615_create_multichannel_communication_foundation.sql',
    import.meta.url,
  );
  const sql = await Deno.readTextFile(migrationUrl);

  assert(sql.includes('create table if not exists public.comunicacao_automacao_rotas'), 'Tabela de rotas ausente.');
  assert(sql.includes("modo_entrega in ('parallel', 'fallback')"), 'Política de paralelo/fallback ausente.');
  assert(sql.includes("'Nova mensagem da Universo'"), 'Push deve usar título privado e genérico.');
  assert(!/grant\s+(?:insert|update|delete)[^;]*to authenticated/i.test(sql), 'Authenticated não pode editar regras diretamente.');
  assert(sql.includes('automacao_versao_id uuid not null'), 'Evento deve apontar para versão imutável.');
  assert(sql.includes('unique (evento_id, canal)'), 'Entrega precisa ser única por evento e canal.');
});

Deno.test('agentes separam prévia, produção e ambiente de teste', async () => {
  const financialAgentUrl = new URL(
    '../../../../supabase/functions/whatsapp-automation-agent/index.ts',
    import.meta.url,
  );
  const birthdayAgentUrl = new URL(
    '../../../../supabase/functions/whatsapp-birthday-agent/index.ts',
    import.meta.url,
  );
  const financialAgent = await Deno.readTextFile(financialAgentUrl);
  const birthdayAgent = await Deno.readTextFile(birthdayAgentUrl);

  assert(financialAgent.includes('if (!isWorker && !dryRun)'), 'Agente financeiro deve bloquear envio real por gestor.');
  assert(financialAgent.includes('`test:${targetDate}:${testAlunoId}:${candidate.dedupe_key}`'), 'Teste financeiro precisa de chave separada.');
  assert(birthdayAgent.includes('if (!isWorker && !dryRun)'), 'Agente de aniversário deve bloquear envio real por gestor.');
  assert(birthdayAgent.includes('if (!testMode) {'), 'Teste de aniversário não deve consumir a entrega de produção.');
});

Deno.test('automação usa permissão explícita e leitura canônica', async () => {
  const migrationUrl = new URL(
    '../../../../supabase/migrations/20260802182415_separate_multichannel_automation_rbac_and_drafts.sql',
    import.meta.url,
  );
  const serviceUrl = new URL('./multichannel-automation.service.ts', import.meta.url);
  const navigationUrl = new URL('../../gestor-navigation.tsx', import.meta.url);
  const sql = await Deno.readTextFile(migrationUrl);
  const service = await Deno.readTextFile(serviceUrl);
  const navigation = await Deno.readTextFile(navigationUrl);

  assert(sql.includes("gestor_has_explicit_tab('comunicacao', 'comunicacao-automacoes')"), 'RBAC deve exigir a aba própria.');
  assert(sql.includes('create or replace function public.comunicacao_automacoes_listar()'), 'RPC canônica de leitura ausente.');
  assert(service.includes("supabase.rpc('comunicacao_automacoes_listar')"), 'Frontend não está usando o snapshot canônico.');
  assert(!service.includes(".from('comunicacao_automacoes')"), 'Frontend não pode ler a configuração diretamente.');
  assert(navigation.includes("id: 'comunicacao-atendimento'"), 'Comunicação deve expor uma central única de atendimento.');
  assert(!navigation.includes("id: 'comunicacao-mensagem'"), 'Mensagem não deve permanecer como submenu separado.');
  assert(!navigation.includes("id: 'comunicacao-whatsapp'"), 'WhatsApp não deve permanecer como submenu separado.');
  assert(navigation.includes("id: 'comunicacao-automacoes'"), 'Submenu Automações ausente.');
  assert(navigation.includes("id: 'comunicacao-fluxos'"), 'Submenu Fluxos ausente.');
  assert(navigation.includes("id: 'comunicacao-agentes'"), 'Submenu Agentes ausente.');
});

Deno.test('salvar rascunho é versionado, auditável e não dispara canais', async () => {
  const migrationUrl = new URL(
    '../../../../supabase/migrations/20260802182415_separate_multichannel_automation_rbac_and_drafts.sql',
    import.meta.url,
  );
  const sql = await Deno.readTextFile(migrationUrl);
  const saveDraftStart = sql.indexOf('create or replace function public.comunicacao_automacao_salvar_rascunho');
  const saveDraftEnd = sql.indexOf('revoke execute on function public.comunicacao_automacao_salvar_rascunho');
  const saveDraft = sql.slice(saveDraftStart, saveDraftEnd);

  assert(saveDraftStart >= 0 && saveDraftEnd > saveDraftStart, 'RPC de rascunho ausente.');
  assert(saveDraft.includes('for update'), 'Salvamento deve bloquear a versão corrente durante a transação.');
  assert(saveDraft.includes('p_expected_version is distinct from v_automation.versao_atual'), 'Concorrência otimista ausente.');
  assert(saveDraft.includes('comunicacao_automacao_versoes'), 'Cada salvamento deve registrar snapshot imutável.');
  assert(saveDraft.includes("'SAVE_DRAFT'"), 'Ação lógica de auditoria ausente.');
  assert(!saveDraft.includes('comunicacao_eventos_outbox'), 'Salvar rascunho não pode criar evento de disparo.');
  assert(!saveDraft.includes('comunicacao_entregas'), 'Salvar rascunho não pode criar entregas.');
  assert(!saveDraft.includes('mensageria_config'), 'Salvar rascunho não pode alterar o WhatsApp legado.');
});

Deno.test('idempotência forte e privacidade são exigidas antes do núcleo de persistência', async () => {
  const migrationUrl = new URL(
    '../../../../supabase/migrations/20260802184135_harden_multichannel_draft_idempotency_and_privacy.sql',
    import.meta.url,
  );
  const editorUrl = new URL('./AutomationDraftEditor.tsx', import.meta.url);
  const sql = await Deno.readTextFile(migrationUrl);
  const editor = await Deno.readTextFile(editorUrl);

  assert(sql.includes('pg_advisory_xact_lock'), 'request_id deve ser serializado atomicamente.');
  assert(sql.includes('payload_hash'), 'Replay deve estar vinculado ao conteúdo original.');
  assert(sql.includes('comunicacao_automacao_tokens_permitidos'), 'Tokens precisam de allowlist por evento.');
  assert(sql.includes("canal <> 'push'"), 'Banco deve manter push privado por constraint.');
  assert(sql.includes('as restrictive'), 'Tabelas internas devem usar negação RLS restritiva.');
  assert(editor.includes('expectedVersion: baseVersion'), 'Editor deve preservar a versão-base do rascunho.');
  assert(editor.includes('requestId,'), 'Editor deve reutilizar o request_id da tentativa lógica.');
  assert(editor.includes('hasRemoteConflict'), 'Editor deve bloquear sobrescrita após refetch concorrente.');
});
