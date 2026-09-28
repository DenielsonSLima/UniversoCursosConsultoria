// @ts-nocheck -- contrato SQL executado pelo Deno.
const directory = new URL('../migrations/', import.meta.url);
const files = [];
for await (const entry of Deno.readDir(directory)) {
  if (entry.name.endsWith('fix_ficha_enrollment_number_snapshot.sql')) files.push(entry.name);
}
const sql = await Deno.readTextFile(new URL(files.sort().at(-1), directory));
const issuer = sql.slice(0, sql.indexOf('with eligible as ('));
const backfill = sql.slice(sql.indexOf('with eligible as ('));
function assert(value, message) { if (!value) throw new Error(message); }
Deno.test('emissor congela matrícula canônica sem confiar em dados do cliente', () => {
  assert(/v_snapshot := v_snapshot \|\| jsonb_build_object\(\s*'studentMatricula', public\.formatar_matricula_validacao\(\s*p_matricula_id, v_enrollment\.enrollment_date, v_enrollment\.polo_id/.test(issuer), 'fonte canônica ausente');
  assert(!/p_dados_emissao\s*->>\s*'studentMatricula'/.test(issuer), 'cliente não pode substituir matrícula');
  assert(issuer.includes('public.can_manage_secretaria_document(p_documento, v_enrollment.polo_id)'), 'autorização deve permanecer');
  assert(issuer.includes('if coalesce(v_issue.reutilizado, false) then'), 'replay deve preservar snapshot');
  assert(/from public, anon, authenticated, service_role/.test(issuer), 'helper privado não deve ficar público');
});
Deno.test('reparo histórico exige vínculo, configuração estável e máscara congelada', () => {
  for (const guard of [
    "validation.documento in ('pasta_identificacao', 'ficha_matricula')",
    'enrollment.id = validation.matricula_id', 'enrollment.aluno_id = validation.aluno_id',
    'class.polo_id = validation.polo_id', 'config.updated_at <= validation.emitido_em',
    "validation.dados_emissao ->> 'enrollmentDate' = enrollment.data_matricula::text",
    "validation.dados_publicos_snapshot ->> 'maskedEnrollmentNumber'",
    'public.mascarar_matricula_validacao_publica',
    "nullif(btrim(validation.dados_emissao ->> 'studentMatricula'), '') is null",
  ]) assert(backfill.includes(guard), `guarda ausente: ${guard}`);
});
Deno.test('reparo histórico modifica exclusivamente a chave ausente studentMatricula', () => {
  assert(/set dados_emissao = jsonb_set\(\s*validation\.dados_emissao, '\{studentMatricula\}', to_jsonb\(eligible\.enrollment_number\), true\s*\)/.test(backfill), 'alteração deve ser isolada');
  assert(!/set (codigo|quantidade_emissoes|dados_publicos_snapshot|emitido_em|ultima_emissao_em)\s*=/i.test(backfill), 'não modificar emissão nem perfil público');
  assert(!/disable trigger|session_replication_role/i.test(sql), 'não desabilitar guardas');
});
