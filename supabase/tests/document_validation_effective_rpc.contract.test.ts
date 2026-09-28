// @ts-nocheck -- contrato SQL executado pelo Deno.
const directory = new URL('../migrations/', import.meta.url);
const entries = [];
for await (const entry of Deno.readDir(directory)) {
  if (entry.isFile && entry.name.endsWith('.sql')) entries.push(entry.name);
}
const definitions = [];
for (const name of entries.sort()) {
  const sql = await Deno.readTextFile(new URL(name, directory));
  const pattern = /create\s+or\s+replace\s+function\s+public\.validar_documento_por_codigo\s*\(p_codigo\s+text\)[\s\S]*?as\s+(\$[a-z_]*\$)([\s\S]*?)\1\s*;/gi;
  for (const match of sql.matchAll(pattern)) {
    definitions.push({ name, definition: match[0], body: match[2] });
  }
}
const effective = definitions.at(-1);
function assert(value, message) {
  if (!value) throw new Error(message);
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
Deno.test('RPC efetiva mantém privilégios mínimos e search_path vazio', async () => {
  const sql = await Deno.readTextFile(new URL(effective.name, directory));
  assert(/security definer\s+set search_path = ''/i.test(effective.definition), 'search_path inseguro');
  assert(/revoke all on function public\.validar_documento_por_codigo\(text\)\s+from public, anon, authenticated, service_role/i.test(sql), 'revogação explícita ausente');
  assert(/grant execute on function public\.validar_documento_por_codigo\(text\)\s+to anon, authenticated/i.test(sql), 'grants públicos esperados ausentes');
});
