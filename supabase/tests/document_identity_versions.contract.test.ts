// @ts-nocheck -- contrato SQL executado pelo Deno.
const directory = new URL('../migrations/', import.meta.url);
const files = [];
for await (const entry of Deno.readDir(directory)) {
  if (entry.name.endsWith('add_document_identity_versions.sql')) files.push(entry.name);
}
const sql = await Deno.readTextFile(new URL(files.sort().at(-1), directory));
function assert(value, message) { if (!value) throw new Error(message); }
Deno.test('nova versão autoriza antes de ler replay e valida origem e ator imutáveis', () => {
  assert(sql.indexOf('public.can_manage_secretaria_document') < sql.indexOf('select ledger.*'), 'autorização deve anteceder replay');
  assert(sql.includes("'source', v_source.id, 'actor', v_actor"), 'fingerprint deve conter origem e ator');
  assert(sql.includes('v_ledger.request_fingerprint is distinct from v_fingerprint'), 'replay incompatível deve falhar');
  assert(sql.includes("'document-identity-version'") && sql.includes('v_reference), 0'), 'chaves distintas precisam compartilhar lock da versão');
  assert(sql.includes('pg_advisory_xact_lock'), 'solicitações concorrentes precisam ser serializadas');
  assert(/from public, anon;/.test(sql) && /to authenticated, service_role;/.test(sql), 'anon não pode renovar');
});
Deno.test('nova versão recusa identidade igual, tipo ambíguo e origem ou destino revogado', () => {
  for (const token of ["v_source.status = 'REVOGADO'", "v_result.status = 'REVOGADO'",
    "'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'", 'if v_reference = v_old_reference then',
    'v_student.aluno_id is distinct from v_source.aluno_id',
    'v_student.polo_id is distinct from v_source.polo_id']) {
    assert(sql.includes(token), `guarda ausente: ${token}`);
  }
});
Deno.test('nova versão usa emissão sem reemissão e apenas enriquece linha recém-criada', () => {
  assert(sql.includes("v_actor, false, '{}'::jsonb, v_reference"), 'Pasta/Ficha precisam de nova emissão');
  assert(sql.includes('v_reference, null, v_actor, false'), 'carteirinha precisa de nova emissão');
  assert(sql.includes('v_result.id = v_source.id'), 'original nunca pode ser retornado como versão nova');
  assert(sql.includes('if not coalesce(v_issue.reutilizado, false) then'), 'replay não pode regravar metadados');
  assert(sql.includes('where validation.id = v_result.id'), 'update somente destino');
  assert(!sql.includes('where validation.id = v_source.id'), 'não atualizar origem');
  assert(sql.includes("'identitySourceCode', v_source.codigo"), 'origem auditável deve ficar registrada');
  assert(sql.includes("'documentTemplateSnapshot', v_template"), 'modelo atual carteirinha deve ser congelado');
});
