import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260810160000_secure_technical_individual_conditions.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);
const hardeningSql = await Deno.readTextFile(new URL(
  '../migrations/20260810170000_revoke_legacy_technical_individual_override_rpcs.sql',
  import.meta.url,
));

function body(name: string) {
  const marker = `create or replace function ${name}`;
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, `função ausente: ${name}`);
  const end = sql.indexOf('$function$;', start);
  assert.ok(end > start, `fim ausente: ${name}`);
  return sql.slice(start, end + '$function$;'.length);
}

Deno.test('código individual fica fora de turmas, somente como hash e sem leitura pública', () => {
  assert.match(sql, /technical_individual_condition_codes[\s\S]*code_hash text not null/i);
  assert.doesNotMatch(sql, /add column if not exists (?:codigo|senha)_condicao/i);
  assert.match(sql, /extensions\.crypt\(v_code, extensions\.gen_salt\('bf', 10\)\)/i);
  assert.match(sql, /octet_length\(v_code\) > 72/i);
  assert.match(sql, /revoke all on table internal_academic\.technical_individual_condition_codes[\s\S]*authenticated, service_role/i);
  const status = body('public.obter_status_codigo_condicao_individual_turma_tecnica_secure(');
  assert.match(status, /'configurado'/i);
  assert.match(status, /'revisao'/i);
  assert.doesNotMatch(status, /code_hash|p_codigo|crypt\(/i);
});

Deno.test('autorização combina RBAC financeiro, escopo da turma, motivo e rate limit', () => {
  assert.doesNotMatch(sql, /public\.alunos/i);
  assert.match(sql, /references public\.parceiros\(id\)/i);
  const permission = body('internal_academic.assert_can_manage_technical_condition(');
  assert.match(permission, /can_operate_turma_academics\(p_turma_id\)/i);
  assert.match(permission, /gestor_has_tab\('gestao', 'financeiro'\)/i);
  assert.match(permission, /gestor_has_tab\('gestao', 'configuracoes'\)/i);
  const validation = body('public.validar_codigo_condicao_individual_turma_tecnica_secure(');
  assert.match(validation, /p_motivo/i);
  assert.match(validation, /BOLSA.*CONVENIO.*INCENTIVO.*NEGOCIACAO.*OUTRO/is);
  assert.match(validation, /least\(v_attempt\.failed_attempts \+ 1, 5\)/i);
  assert.match(validation, /interval '15 minutes'/i);
  assert.match(validation, /turma_id, aluno_id, actor_id/i);
  assert.match(sql, /primary key \(turma_id, actor_id\)/i);
  assert.match(validation, /on conflict \(turma_id, actor_id\)/i);
  assert.doesNotMatch(validation, /technical-condition-attempt:' \|\| p_turma_id::text \|\| ':' \|\| p_aluno_id/i);
  assert.match(validation, /from public\.parceiros student[\s\S]*student\.tipo = 'Aluno'/i);
});

Deno.test('criação da turma e do hash é transacional e idempotente', () => {
  const creation = body('public.criar_turma_tecnica_com_codigo_condicao_secure(');
  assert.match(creation, /p_request_id uuid/i);
  assert.match(creation, /create-technical-class:/i);
  assert.match(creation, /actor_id is distinct from auth\.uid\(\)/i);
  assert.match(creation, /insert into public\.turmas/i);
  assert.match(creation, /set_technical_condition_code/i);
  assert.match(creation, /primeiro vencimento padrão da turma é obrigatório/i);
  assert.match(creation, /extensions\.crypt\([\s\S]*p_codigo[\s\S]*code\.code_hash/i);
  assert.doesNotMatch(creation, /codigoDigest|'codigo'\s*,\s*p_codigo/i);
});

Deno.test('redefinição idempotente confirma o novo código sem guardar segredo fraco', () => {
  const reset = body('public.redefinir_codigo_condicao_individual_turma_tecnica_secure(');
  assert.match(reset, /extensions\.crypt\([\s\S]*p_novo_codigo[\s\S]*code\.code_hash/i);
  const payloadHashBlock = reset.slice(
    reset.indexOf('v_payload_hash :='),
    reset.indexOf('perform pg_advisory_xact_lock'),
  );
  assert.doesNotMatch(payloadHashBlock, /p_novo_codigo|'codigo'/i);
});

Deno.test('todo salvamento individual exige código novamente e o RPC antigo é revogado', () => {
  assert.doesNotMatch(sql, /revoke execute on function public\.salvar_override_financeiro_matricula_tecnica_secure/i);
  assert.match(hardeningSql, /revoke execute on function public\.salvar_override_financeiro_matricula_tecnica_secure[\s\S]*from authenticated/i);
  const save = body('public.salvar_override_financeiro_matricula_tecnica_autorizado_secure(');
  assert.match(save, /assert_can_manage_technical_condition\(v_turma_id, false\)/i);
  assert.match(save, /validar_codigo_condicao_individual_turma_tecnica_secure/i);
  assert.match(save, /CONDICAO_INDIVIDUAL_AUTORIZADA/i);
  assert.match(save, /p_motivo/i);
  assert.match(save, /item\.key not in[\s\S]*'valorMatricula'[\s\S]*'valorMensalidade'[\s\S]*'valorRematricula'[\s\S]*'descontoPontualidade'/i);
  assert.doesNotMatch(save, /item\.key not in[\s\S]*'cobrarRematricula'/i);
  assert.match(save, /deve representar bolsa, isenção ou desconto/i);
  assert.doesNotMatch(save, /jsonb_build_object\([^)]*p_codigo/is);
});

Deno.test('remoção da condição individual também exige código e revoga o RPC legado', () => {
  assert.doesNotMatch(sql, /revoke execute on function public\.remover_override_financeiro_matricula_tecnica_secure/i);
  assert.match(hardeningSql, /revoke execute on function public\.remover_override_financeiro_matricula_tecnica_secure[\s\S]*from authenticated/i);
  const remove = body('public.remover_override_financeiro_matricula_tecnica_autorizado_secure(');
  assert.match(remove, /validar_codigo_condicao_individual_turma_tecnica_secure/i);
  assert.match(remove, /REMOVER_OVERRIDE_AUTORIZADO/i);
  assert.match(remove, /CONDICAO_INDIVIDUAL_REMOVIDA_AUTORIZADA/i);
  assert.doesNotMatch(remove, /jsonb_build_object\([^)]*p_codigo/is);
});

Deno.test('primeiro vencimento participa da regra e o curso termina no segundo ciclo', () => {
  assert.match(sql, /add column if not exists primeiro_vencimento_padrao date/i);
  const fingerprint = body('internal_academic.technical_financial_rule_fingerprint_v3(');
  assert.match(fingerprint, /'primeiroVencimento', p_primeiro_vencimento/i);
  const rule = body('internal_academic.technical_financial_rule(');
  assert.doesNotMatch(rule, /greatest\(coalesce\(v_turma\.primeiro_vencimento_padrao/i);
  assert.match(rule, /'totalCiclos'/i);
  assert.match(rule, /'totalMensalidades'/i);
  assert.match(rule, /'totalNominal'/i);
  const guard = body('internal_academic.guard_technical_course_cycle_limit(');
  assert.match(guard, /v_cycle > 2/i);
  assert.match(guard, /v_cycle >= 2/i);
  assert.match(sql, /before insert on public\.contas_receber/i);
  const render = body('internal_academic.render_technical_financial_rule(');
  assert.match(render, /'recorrente', false/i);
  assert.match(render, /'maxCiclos', v_total_ciclos/i);
  assert.match(render, /'encerraAposCiclo', v_total_ciclos/i);
});

Deno.test('migração fecha em transação única', () => {
  assert.match(sql, /^begin;/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /commit;\s*$/i);
});
