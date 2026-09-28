// @ts-nocheck -- contrato SQL executado pelo Deno.
const directory = new URL('../migrations/', import.meta.url);
const files = [];
for await (const entry of Deno.readDir(directory)) {
  if (entry.name.endsWith('freeze_student_card_identity_snapshot.sql')) files.push(entry.name);
}
const sql = await Deno.readTextFile(new URL(files.sort().at(-1), directory));
function assert(value, message) { if (!value) throw new Error(message); }
Deno.test('carteirinha congela tipo e número na inserção, somente no seu domínio', () => {
  assert(sql.includes('student.tipo_documento as aluno_tipo_documento'), 'tipo precisa vir do cadastro canônico');
  assert(sql.includes('student.rg as aluno_rg'), 'RG precisa vir do cadastro canônico');
  assert(/case when p_documento = 'carteirinha' then\s*internal_academic.student_card_identity_snapshot/.test(sql), 'não alterar demais documentos');
  assert(sql.includes("'studentDocumentType'"), 'tipo precisa ser congelado');
  assert(sql.includes("'studentRg'"), 'número precisa ser congelado');
});
Deno.test('CIN usa CPF, RG mantém número distinto e legado ambíguo não vira CIN', () => {
  assert(sql.includes("when is_cin then btrim(coalesce(p_cpf, ''))"), 'CIN precisa usar número CPF');
  assert(sql.includes("when raw_type <> '' then btrim(coalesce(p_rg, ''))"), 'RG permanece distinto');
  assert(!sql.includes("like '%CARTEIRA NACIONAL DE IDENTIFICA"), 'legado ambíguo não pode ser convertido');
  assert(sql.includes("'studentCpf', v_matricula.aluno_cpf"), 'CPF cadastral deve ser preservado');
});
Deno.test('replay e reemissão não substituem identidade antiga pelo cadastro vivo', () => {
  const insertAt = sql.indexOf('insert into public.documentos_validacao');
  const reusedAt = sql.indexOf('reutilizado := true;');
  assert(reusedAt >= 0 && reusedAt < insertAt, 'replay precisa sair antes de construir snapshot');
  const reissue = sql.slice(sql.indexOf('dados_emissao = case'), sql.indexOf('updated_at = now()'));
  assert(/when p_registrar_reemissao then\s*documentos_validacao.dados_emissao\s*\|\| jsonb_build_object\(\s*'validationPublic'/.test(reissue), 'reemissão deve manter snapshot original');
  assert(/case when p_documento = 'carteirinha' then\s*documentos_validacao.dados_emissao/.test(reissue), 'corrida de primeira emissão também deve preservar snapshot vencedor');
  assert(!/update public\.documentos_validacao/.test(sql), 'sem backfill de identidade histórico');
});
Deno.test('emissor interno conserva grants e helper privado', () => {
  assert(/from public, anon, authenticated;/.test(sql), 'não expor emissor interno');
  assert(/to service_role;/.test(sql), 'serviço mantém execução');
  assert(/from public, anon, authenticated, service_role;/.test(sql), 'helper deve ser privado');
});
