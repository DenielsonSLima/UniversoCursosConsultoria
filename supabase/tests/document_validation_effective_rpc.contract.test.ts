// @ts-nocheck -- contrato SQL executado pelo Deno.
const directory = new URL('../migrations/', import.meta.url);
const entries = [];
for await (const entry of Deno.readDir(directory)) {
  if (entry.isFile && entry.name.endsWith('.sql')) entries.push(entry.name);
}
const definitions = [];
const migrations = [];
for (const name of entries.sort()) {
  const sql = await Deno.readTextFile(new URL(name, directory));
  migrations.push(sql);
  const pattern = /create\s+or\s+replace\s+function\s+public\.validar_documento_por_codigo\s*\(p_codigo\s+text\)[\s\S]*?as\s+(\$[a-z_]*\$)([\s\S]*?)\1\s*;/gi;
  for (const match of sql.matchAll(pattern)) {
    definitions.push({ name, definition: match[0], body: match[2] });
  }
}
const effective = definitions.at(-1);
function assert(value, message) {
  if (!value) throw new Error(message);
}
function hasEmptySearchPath(definition) {
  return /security\s+definer\s+set\s+search_path\s*(?:=|\bto\b)\s*''\s+as\s+\$[a-z_]*\$/i.test(definition);
}
function effectiveValidatorPermissions(sources) {
  // CREATE OR REPLACE preserves ACLs: interpret the explicit grants in migration order.
  const permissions = { public: true, anon: false, authenticated: false, service_role: false };
  const pattern = /\b(grant|revoke)\s+(?:execute|all(?:\s+privileges)?)\s+on\s+function\s+public\.validar_documento_por_codigo\(text\)\s+(?:to|from)\s+([^;]+);/gi;
  for (const source of sources) {
    for (const match of source.matchAll(pattern)) {
      for (const role of match[2].toLowerCase().match(/\b(public|anon|authenticated|service_role)\b/g) || []) {
        permissions[role] = match[1].toLowerCase() === 'grant';
      }
    }
  }
  return permissions;
}
function checkContract(body) {
  return /'visibleFields',\s*visible\.visible_fields/.test(body)
    && /'schemaVersion',\s*visible\.politica_versao_emissao/.test(body)
    && /filtrar_dados_publicos_validacao\(\s*visible\.dados_publicos_snapshot,\s*visible\.visible_fields/.test(body)
    && /emission_field\.field = any\(candidate\.campos_publicos_atuais\)/.test(body)
    && /and validation\.validacao_publica\s+and policy\.consulta_publica_ativa/.test(body);
}
Deno.test('RPC efetiva mantém perfil versionado, snapshot e interseção de campos', () => {
  assert(effective, 'nenhuma definição de RPC encontrada');
  assert(checkContract(effective.body), `contrato público regrediu em ${effective.name}`);
  assert(!effective.body.includes("'enrollmentId'"), 'não expor identificador interno');
  assert(!/join public\.parceiros aluno/i.test(effective.body), 'não reconstruir dados pessoais atuais');
});
Deno.test('detector reproduz regressão da migration de assinatura', () => {
  const regression = definitions.find(item => item.name === '20260820002006_add_assinatura_termo_acervo_v1.sql');
  assert(regression && !checkContract(regression.body), 'regressão histórica deve ser detectada');
});
Deno.test('RPC efetiva preserva preceptor, validade acadêmica e diário assinado', () => {
  const body = effective.body;
  for (const token of ['documentos_validacao_preceptores', 'documento_validade_efetiva',
    'not visible.subject_active', "visible.status = 'REVOGADO'", "'EXPIRED'",
    'assinatura_eletronica_envelopes', 'assinatura_eletronica_artefatos',
    'AND diary_policy.consulta_publica_ativa',
    'JOIN storage.objects', 'artefato_final.sha256 = envelope.documento_final_sha256',
    "envelope.status IN ('ASSINADO', 'SUBSTITUIDO')"]) {
    assert(body.includes(token), `ramo ou guarda ausente: ${token}`);
  }
  assert(/and credential\.validacao_publica\s+and policy\.consulta_publica_ativa/.test(body),
    'preceptor precisa respeitar disponibilidade da emissão e da consulta');
});
Deno.test('RPC efetiva mantém privilégios mínimos e search_path vazio', () => {
  assert(hasEmptySearchPath(effective.definition), 'search_path inseguro');
  assert(migrations.some(sql => /revoke all on function public\.validar_documento_por_codigo\(text\)\s+from public, anon, authenticated, service_role/i.test(sql)), 'revogação explícita ausente');
  assert(migrations.some(sql => /grant execute on function public\.validar_documento_por_codigo\(text\)\s+to anon, authenticated/i.test(sql)), 'grants públicos esperados ausentes');
  const permissions = effectiveValidatorPermissions(migrations);
  assert(!permissions.public && !permissions.service_role, 'privilégio amplo restaurado posteriormente');
  assert(permissions.anon && permissions.authenticated, 'grants públicos esperados foram revogados');
});

Deno.test('ACL preservada por CREATE OR REPLACE ainda detecta grant amplo posterior', () => {
  const baseline = `REVOKE ALL ON FUNCTION public.validar_documento_por_codigo(text) FROM PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(text) TO anon, authenticated;`;
  const replacement = "CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo(p_codigo text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;";
  const preserved = effectiveValidatorPermissions([baseline, replacement]);
  assert(!preserved.public && !preserved.service_role && preserved.anon && preserved.authenticated,
    'substituir a função não altera a ACL');
  const broadened = effectiveValidatorPermissions([baseline, replacement,
    'GRANT EXECUTE ON FUNCTION public.validar_documento_por_codigo(text) TO PUBLIC;']);
  assert(broadened.public, 'grant posterior a PUBLIC deve ser detectado');
});

Deno.test('search_path vazio aceita TO ou = e rejeita schemas ou listas não vazias', () => {
  for (const assignment of ["= ''", "TO ''", "to\n  ''", " =\n''"]) {
    assert(hasEmptySearchPath(`SECURITY DEFINER\nSET search_path ${assignment}\nAS $function$`),
      `atribuição vazia válida recusada: ${assignment}`);
  }
  for (const assignment of ["= 'public'", 'TO public', 'TO pg_temp',
    "TO 'public, pg_temp'", "TO '', public", "= '', pg_temp"]) {
    assert(!hasEmptySearchPath(`SECURITY DEFINER\nSET search_path ${assignment}\nAS $function$`),
      `search_path inseguro aceito: ${assignment}`);
  }
});

