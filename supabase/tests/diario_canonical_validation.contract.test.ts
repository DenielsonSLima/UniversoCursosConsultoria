import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260728073832_create_canonical_diario_document_validation.sql',
  import.meta.url,
);
const indexMigrationUrl = new URL(
  '../migrations/20260728074216_index_canonical_diario_validation_foreign_keys.sql',
  import.meta.url,
);

Deno.test('Diário possui tabela canônica própria e fechada por RLS', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /create table public\.diarios_validacao/i);
  assert.match(source, /unique \(turma_id, disciplina_id\)/i);
  assert.match(source, /alter table public\.diarios_validacao enable row level security/i);
  assert.match(
    source,
    /revoke all on table public\.diarios_validacao\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(source, /grant select on table public\.diarios_validacao to anon/i);
});

Deno.test('emissão do Diário autoriza operação ou Professor e usa prefixo da política', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /create or replace function public\.emitir_diario_validacao_portal/i);
  assert.match(source, /can_operate_turma_academics\(p_turma_id\)/i);
  assert.doesNotMatch(source, /gestor_can_read_diario_results\(p_turma_id\)/i);
  assert.match(source, /is_professor_assigned_disciplina\(/i);
  assert.match(source, /v_codigo := v_policy\.prefixo/i);
  assert.match(source, /for share/i);
  assert.ok(
    source.indexOf('Acesso à emissão do Diário de Classe não autorizado.')
      < source.indexOf('A disciplina não pertence à turma informada.'),
    'autorização deve ocorrer antes de revelar a existência do vínculo',
  );
  assert.match(source, /grant execute on function public\.emitir_diario_validacao_portal\(uuid, uuid, text\)\s+to authenticated, service_role/i);
});

Deno.test('emissão do Diário exige chave e retry retorna o ledger sem incrementar', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /create table public\.diarios_validacao_operacoes_idempotencia/i);
  assert.match(
    source,
    /alter table public\.diarios_validacao_operacoes_idempotencia\s+enable row level security[\s\S]*revoke all on table public\.diarios_validacao_operacoes_idempotencia\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(source, /p_idempotency_key text/i);
  assert.match(source, /hashtextextended\('diary-issue:' \|\| v_key/i);
  assert.match(source, /v_stored\.request_fingerprint <> v_fingerprint/i);
  assert.match(
    source,
    /if found then[\s\S]*v_stored\.quantidade_emissoes[\s\S]*return;/i,
  );
  assert.match(
    source,
    /if found then[\s\S]*not exists \([\s\S]*public\.diarios_validacao[\s\S]*status <> 'REVOGADO'[\s\S]*return query/i,
  );

  const functionStart = source.indexOf(
    'create or replace function public.emitir_diario_validacao_portal',
  );
  const functionEnd = source.indexOf('$function$;', functionStart);
  const emitter = source.slice(functionStart, functionEnd);
  const policyLock = emitter.indexOf('for share;');
  const retryReturn = emitter.indexOf('v_stored.quantidade_emissoes');
  const identityLock = emitter.indexOf(
    "hashtextextended(v_identidade, 0)",
  );
  const revokedGuard = emitter.indexOf(
    "if v_record.status = 'REVOGADO' then",
  );
  const canonicalUpdate = emitter.indexOf(
    'update public.diarios_validacao diary',
  );

  assert.ok(
    policyLock > 0 &&
      retryReturn > policyLock &&
      identityLock > retryReturn &&
      revokedGuard > identityLock &&
      canonicalUpdate > revokedGuard,
    'policy, retry, identidade, revogação e mutação precisam ocorrer nessa ordem',
  );
});

Deno.test('política do Diário é personalizável, sem campos de aluno', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /'diario_classe',\s+'DIA',\s+'PROCESSO'/i);
  assert.match(source, /validar_campos_publicos_politica_diario/i);
  assert.match(source, /O Diário de Classe permite somente informações institucionais/i);
  assert.doesNotMatch(
    source.match(/values \(\s*'diario_classe'[\s\S]*?\)\s*on conflict/i)?.[0] || '',
    /student(Name|Cpf|BirthDate)|maskedEnrollmentNumber/i,
  );
});

Deno.test('RPC pública resolve o Diário sem reabrir documentos_templates', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const executableSource = source.replace(/--.*$/gm, '');

  assert.match(executableSource, /rename to validar_documento_academico_por_codigo_internal/i);
  assert.match(executableSource, /from public\.diarios_validacao validation/i);
  assert.match(executableSource, /policy\.consulta_publica_ativa/i);
  assert.match(executableSource, /filtrar_dados_publicos_validacao/i);
  assert.doesNotMatch(executableSource, /documentos_templates/i);
  assert.match(
    executableSource,
    /grant execute on function public\.validar_documento_por_codigo\(text\)\s+to anon, authenticated/i,
  );
});

Deno.test('FKs do Diário possuem índices de suporte sem duplicar a chave da turma', async () => {
  const source = await Deno.readTextFile(indexMigrationUrl);
  assert.match(
    source,
    /create index if not exists diarios_validacao_disciplina_idx\s+on public\.diarios_validacao \(disciplina_id\)/i,
  );
  assert.match(
    source,
    /create index if not exists diarios_validacao_polo_idx\s+on public\.diarios_validacao \(polo_id\)/i,
  );
  assert.doesNotMatch(source, /on public\.diarios_validacao \(turma_id\)/i);
});
