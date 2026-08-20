// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819203143_create_portal_multi_profile_identities.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const portalSession = await Deno.readTextFile(
  new URL("../../modules/login/portal-session.ts", import.meta.url),
);
const loginService = await Deno.readTextFile(
  new URL("../../modules/login/login.service.ts", import.meta.url),
);
const onlineCheckout = await Deno.readTextFile(
  new URL(
    "../../modules/public/components/OnlineCheckoutButton.tsx",
    import.meta.url,
  ),
);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

const assertAuthorizationPrecedesReplay = (signature: string) => {
  const block = functionBlock(signature);
  const authorization = Math.max(
    block.indexOf("portal_identidade_autorizar_gestor()"),
    block.indexOf("portal_identidade_validar_escopo_solicitado("),
    block.indexOf("portal_identidade_exigir_service_role_actor("),
  );
  const replay = block.indexOf("portal_identidade_obter_replay(");
  assert.ok(authorization >= 0, `${signature} não revalida autorização.`);
  assert.ok(
    replay > authorization,
    `${signature} consulta replay antes de autorizar.`,
  );
};

Deno.test("fase A cria entidades próprias, temporais e sem acesso direto", () => {
  assert.match(sql, /create table public\.responsaveis_legais\s*\(/i);
  assert.match(sql, /create table public\.responsaveis_legais_alunos\s*\(/i);
  assert.match(sql, /create table public\.professores_coordenacoes\s*\(/i);
  assert.match(sql, /cpf_normalizado text,/i);
  assert.doesNotMatch(sql, /cpf_normalizado text not null/i);
  assert.match(
    sql,
    /create unique index responsaveis_legais_cpf_key[\s\S]*?where cpf_normalizado is not null/i,
  );
  assert.match(
    sql,
    /status <> 'ATIVO'[\s\S]*?cpf_normalizado is not null[\s\S]*?email is not null[\s\S]*?identidade_verificada_em is not null/i,
  );
  assert.match(
    sql,
    /create unique index responsaveis_legais_alunos_aberto_key[\s\S]*?where status in \('PENDENTE', 'VERIFICADO'\)/i,
  );
  assert.match(
    sql,
    /create unique index professores_coordenacoes_ativa_escopo_key[\s\S]*?where status = 'ATIVA'/i,
  );

  for (
    const table of [
      "responsaveis_legais",
      "responsaveis_legais_alunos",
      "professores_coordenacoes",
      "portal_identidade_operacoes",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]*?service_role`,
        "i",
      ),
    );
  }
});

Deno.test("escrita direta não altera identidade, acesso ou aceite jurídico", () => {
  const guard = functionBlock(
    "public.protect_student_access_control_fields()",
  );
  const linker = functionBlock("public.link_parceiro_auth_identity()");

  assert.match(guard, /current_user IN \('anon', 'authenticated'\)/i);
  assert.doesNotMatch(guard, /SECURITY DEFINER/i);
  for (
    const field of [
      "auth_user_id",
      "auth_login_email",
      "matricula_acesso",
      "troca_senha_obrigatoria",
      "acesso_status",
      "acesso_erro",
      "convite_enviado_em",
      "acesso_ativado_em",
      "aceitou_termos_uso",
      "aceitou_termos_uso_em",
      "termos_uso_versao",
    ]
  ) {
    assert.match(guard, new RegExp(`NEW\\.${field}`, "i"));
  }
  assert.match(guard, /PARCEIRO_CAMPOS_SENSIVEIS_EXIGEM_FLUXO_AUTORIZADO/i);
  assert.match(linker, /current_user IN \('anon', 'authenticated'\)/i);
  assert.match(
    sql,
    /unique index if not exists uq_parceiros_auth_user_id[\s\S]*?\(auth_user_id\)[\s\S]*?where auth_user_id is not null/i,
  );
  assert.doesNotMatch(
    sql,
    /drop index if exists public\.uq_parceiros_auth_user_id/i,
  );
  assert.doesNotMatch(sql, /uq_parceiros_auth_user_id_tipo/i);
  assert.doesNotMatch(
    linker,
    /parceiro_vinculado\.tipo = NEW\.tipo/i,
  );
});

Deno.test("checkout cria ou vincula Aluno somente pela RPC idempotente", () => {
  const checkout = functionBlock(
    "public.portal_garantir_perfil_aluno_checkout(",
  );
  const authorization = checkout.indexOf("v_source_role IS NULL");
  const replay = checkout.indexOf("portal_identidade_obter_replay(");

  assert.match(checkout, /v_actor uuid := auth\.uid\(\)/i);
  assert.match(checkout, /p_source_context_id uuid[\s\S]*?p_request_id uuid/i);
  assert.ok(authorization >= 0 && replay > authorization);
  assert.match(checkout, /FOR UPDATE/i);
  assert.match(
    checkout,
    /nullif\(parceiro\.auth_login_email, ''\)[\s\S]*?nullif\(parceiro\.email, ''\)/i,
  );
  assert.match(checkout, /UPDATE public\.parceiros AS aluno/i);
  assert.match(checkout, /INSERT INTO public\.parceiros/i);
  assert.match(
    checkout,
    /parceiro_uid\.auth_user_id = v_actor[\s\S]*?FOR UPDATE/i,
  );
  assert.match(
    checkout,
    /upper\(v_parceiro_vinculado\.tipo\) <> 'ALUNO'[\s\S]*?ALUNO_CHECKOUT_ACESSO_JA_VINCULADO_A_PROFESSOR/i,
  );
  assert.ok(
    checkout.indexOf("ALUNO_CHECKOUT_ACESSO_JA_VINCULADO_A_PROFESSOR") <
      replay,
    "Professor precisa falhar antes da consulta idempotente.",
  );
  assert.match(checkout, /'ALUNO_CHECKOUT_GARANTIR'/i);
  assert.match(checkout, /'created', v_created[\s\S]*?'linked', v_linked/i);
  assert.doesNotMatch(
    checkout,
    /p_senha|encrypted_password|update auth\.users/i,
  );
  assert.doesNotMatch(checkout, /aceitou_termos_uso|termos_uso_versao/i);
  assert.match(
    sql,
    /grant execute on function public\.portal_garantir_perfil_aluno_checkout\(uuid, uuid\)[\s\S]*?to authenticated/i,
  );

  const ensureStart = portalSession.indexOf(
    "export const ensureLinkedAlunoProfile",
  );
  const ensureBlock = portalSession.slice(ensureStart);
  assert.match(ensureBlock, /rpc\('portal_garantir_perfil_aluno_checkout'/i);
  assert.doesNotMatch(ensureBlock, /\.from\('parceiros'\)/i);
  assert.doesNotMatch(ensureBlock, /\.insert\(/i);
  assert.match(
    portalSession,
    /ALUNO_CHECKOUT_ACESSO_JA_VINCULADO_A_PROFESSOR/i,
  );
  assert.doesNotMatch(loginService, /troca_senha_obrigatoria\s*:\s*false/i);
  assert.match(onlineCheckout, /useRef\(generateSafeUuid\(\)\)/i);
  assert.match(
    onlineCheckout,
    /ensureLinkedAlunoProfile\(undefined, ensureAlunoRequestIdRef\.current\)/i,
  );
});

Deno.test("escopo explícito nega global ao gestor local e não mistura polos", () => {
  const validator = functionBlock(
    "public.portal_identidade_validar_escopo_solicitado(",
  );
  const responsibleList = functionBlock("public.responsaveis_legais_listar(");
  const coordinationList = functionBlock(
    "public.professores_coordenacoes_listar(",
  );

  assert.match(validator, /p_polo_id IS NULL OR p_include_global IS NULL/i);
  assert.match(validator, /IF p_include_global AND NOT v_all_polos/i);
  assert.match(validator, /PORTAL_IDENTIDADE_GLOBAL_NAO_AUTORIZADO/i);
  assert.match(
    responsibleList,
    /'canCreate', p_include_global AND v_pode_gerir_global/i,
  );
  assert.match(coordinationList, /polo\.id = p_polo_id/i);

  for (
    const signature of [
      "public.responsavel_legal_salvar(",
      "public.responsavel_legal_vincular_aluno(",
      "public.responsavel_legal_revogar_vinculo(",
      "public.professor_coordenacao_salvar(",
      "public.professor_coordenacao_revogar(",
    ]
  ) {
    const block = functionBlock(signature);
    assert.match(block, /'poloId', p_polo_id/i);
    assert.match(block, /'includeGlobal', p_include_global/i);
  }

  for (
    const signature of [
      "public.responsavel_legal_salvar(",
      "public.responsavel_legal_vincular_aluno(",
      "public.responsavel_legal_revogar_vinculo(",
    ]
  ) {
    assert.match(functionBlock(signature), /'affectedPoloIds'/i);
  }
  assert.match(
    functionBlock("public.professor_coordenacao_revogar("),
    /'poloId', v_coordenacao\.polo_id/i,
  );
});

Deno.test("provas e revogações preservam ator de auditoria e estado coerente", () => {
  assert.match(
    sql,
    /identidade_verificada_por uuid references auth\.users\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /verificado_por uuid references auth\.users\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /revogado_por uuid references auth\.users\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /revogada_por uuid references auth\.users\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /actor_auth_user_id uuid references auth\.users\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /status <> 'REVOGADO'[\s\S]*?revogado_em is null[\s\S]*?revogado_por is null[\s\S]*?motivo_revogacao is null[\s\S]*?status = 'REVOGADO'[\s\S]*?revogado_em is not null[\s\S]*?revogado_por is not null/i,
  );
  assert.match(
    sql,
    /status <> 'REVOGADA'[\s\S]*?revogada_em is null[\s\S]*?revogada_por is null[\s\S]*?motivo_revogacao is null[\s\S]*?status = 'REVOGADA'[\s\S]*?revogada_em is not null[\s\S]*?revogada_por is not null/i,
  );
});

Deno.test("perfil multipapel é separado, vigente e não habilita assinatura", () => {
  const profiles = functionBlock("public.portal_listar_perfis()");
  const dependents = functionBlock(
    "public.responsavel_legal_listar_dependentes(",
  );
  const coordinations = functionBlock("public.coordenador_listar_atribuicoes(");

  assert.match(
    profiles,
    /'RESPONSAVEL_LEGAL'::text[\s\S]*?responsavel\.id[\s\S]*?'\/responsavel'/i,
  );
  assert.match(
    profiles,
    /'COORDENADOR'::text[\s\S]*?professor\.id[\s\S]*?'\/coordenador'/i,
  );
  assert.match(
    profiles,
    /'PORTAL_COORDENADOR'[\s\S]*?'LISTAR_ATRIBUICOES'[\s\S]*?'ASSINATURAS_VISUALIZAR'/i,
  );
  assert.doesNotMatch(
    profiles,
    /ASSINAR_DIARIO|ASSINATURA_EXECUTAR|ENVELOPE_CRIAR/i,
  );
  assert.match(profiles, /vinculo_ativo\.status = 'VERIFICADO'/i);
  assert.match(profiles, /public\.is_active_status\(aluno_ativo\.status\)/i);
  assert.match(dependents, /vinculo\.status = 'VERIFICADO'/i);
  assert.match(dependents, /public\.is_active_status\(aluno\.status\)/i);
  assert.match(coordinations, /coordenacao\.status = 'ATIVA'/i);
  assert.match(coordinations, /public\.is_active_status\(curso\.status\)/i);
  assert.match(coordinations, /public\.is_active_status\(polo\.status\)/i);
  assert.match(profiles, /"firstAccess" jsonb/i);
  assert.match(
    profiles,
    /WHEN 'ALUNO' THEN pg_catalog\.jsonb_build_object\([\s\S]*?'acceptedTermsAt'[\s\S]*?parceiro\.aceitou_termos_uso_em[\s\S]*?'acceptedTermsVersion'[\s\S]*?parceiro\.termos_uso_versao[\s\S]*?'requiresPasswordReset'[\s\S]*?parceiro\.troca_senha_obrigatoria/i,
  );
  assert.ok(
    (profiles.match(/NULL::jsonb/g) ?? []).length >= 3,
    "Perfis não-Aluno devem devolver firstAccess nulo.",
  );
  assert.match(
    profiles,
    /'GESTOR_PERMISSIONS'[\s\S]*?'permissions'[\s\S]*?gestor_escopo\.valor -> 'permissions'/i,
  );
  assert.match(
    profiles,
    /termos_uso_versao\s*=\s*public\.portal_identidade_termos_versao_vigente\(\)/i,
  );
});

Deno.test("gestão usa Parceiros, escopo por polo e rascunho creator-only", () => {
  const authorization = functionBlock(
    "public.portal_identidade_autorizar_gestor()",
  );
  const responsibleScope = functionBlock(
    "public.portal_identidade_responsavel_no_escopo_gestor(",
  );
  const studentScope = functionBlock(
    "public.portal_identidade_aluno_no_escopo_gestor(",
  );
  const currentScope = functionBlock(
    "public.portal_identidade_gestor_escopo_atual()",
  );

  assert.match(authorization, /gestor_has_module\('parceiros'\)/i);
  assert.doesNotMatch(authorization, /configuracoes|is_gestor_global/i);
  assert.match(responsibleScope, /responsavel\.criado_por = auth\.uid\(\)/i);
  assert.match(responsibleScope, /not exists[\s\S]*?qualquer_vinculo/i);
  assert.match(studentScope, /portal_identidade_gestor_escopo_atual\(\)/i);
  assert.match(currentScope, /base\.permissoes_usuario ->> 'allPolos'/i);
  assert.match(currentScope, /public\.polos as matriz/i);
  assert.doesNotMatch(
    studentScope,
    /is_gestor_global|gestor_allowed_polo_ids/i,
  );
  assert.doesNotMatch(studentScope, /p_polo_id is null/i);
  assert.match(sql, /portal_identidade_professor_no_escopo_gestor\(/i);
});

Deno.test("allPolos do ator parametrizado não herda perfil nem amplia gestor local", () => {
  const context = functionBlock(
    "public.portal_identidade_actor_gestor_contexto(",
  );

  assert.match(context, /permissoes_usuario/i);
  assert.match(context, /permissoes_usuario -> 'allPolos'/i);
  assert.match(context, /cardinality\(autorizado\.polo_ids\) = 0/i);
  assert.match(context, /lower\(btrim\(autorizado\.context\)\) = 'global'/i);
  assert.match(context, /public\.polos as matriz/i);
  assert.match(context, /coalesce\(matriz\.is_matriz, false\)/i);
  assert.match(context, /modulo\.valor = 'parceiros'/i);
  assert.match(context, /horario_permitido/i);
});

Deno.test("coordenação exige que o professor pertença ao polo atribuído", () => {
  const guard = functionBlock(
    "public.portal_identidade_professor_no_escopo_gestor(",
  );
  const membership = guard.indexOf("professor.polo_id = p_polo_id");
  const alternateMembership = guard.indexOf(
    "p_polo_id = ANY(coalesce(professor.polo_ids, ARRAY[]::uuid[]))",
  );
  const broadScope = guard.indexOf("->> 'allPolos'");

  assert.ok(
    membership >= 0,
    "Falta correlacionar polo principal do Professor.",
  );
  assert.ok(
    alternateMembership > membership,
    "Falta correlacionar polos adicionais do Professor.",
  );
  assert.ok(
    broadScope > alternateMembership,
    "allPolos não pode contornar a pertença do Professor ao polo alvo.",
  );

  const gestorPolos = new Set(["A", "B"]);
  const professorPolos = new Set(["A"]);
  const poloAtribuido = "B";
  assert.equal(
    gestorPolos.has(poloAtribuido) && professorPolos.has(poloAtribuido),
    false,
    "Gestor A+B não pode atribuir no polo B um Professor vinculado só ao A.",
  );

  const trigger = functionBlock(
    "public.portal_identidade_validar_coordenacao()",
  );
  const profiles = functionBlock("public.portal_listar_perfis()");
  const ownList = functionBlock("public.coordenador_listar_atribuicoes(");
  const adminList = functionBlock("public.professores_coordenacoes_listar(");

  assert.match(trigger, /parceiro\.polo_id = NEW\.polo_id/i);
  assert.match(trigger, /NEW\.polo_id = ANY\(coalesce\(parceiro\.polo_ids/i);
  assert.match(trigger, /PORTAL_IDENTIDADE_PROFESSOR_FORA_DO_POLO/i);
  assert.ok(
    (profiles.match(/professor\.polo_id = coordenacao(?:_polo)?\.polo_id/gi) ??
      [])
      .length >= 2,
    "Contexto Coordenador precisa revalidar polo na projeção e nos scopes.",
  );
  assert.match(ownList, /professor\.polo_id = coordenacao\.polo_id/i);
  assert.match(ownList, /p_polo_id uuid/i);
  assert.match(
    ownList,
    /professor\.polo_id = p_polo_id[\s\S]*?p_polo_id = ANY\(coalesce\(professor\.polo_ids/i,
  );
  assert.match(ownList, /coordenacao\.polo_id = p_polo_id/i);
  assert.match(ownList, /public\.is_active_status\(polo_autorizado\.status\)/i);
  assert.match(
    ownList,
    /coordenacao\.polo_id = ANY\([\s\S]*?professor\.polo_ids/i,
  );
  assert.match(
    adminList,
    /portal_identidade_professor_no_escopo_gestor\([\s\S]*?professor\.id,[\s\S]*?polo\.id/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.coordenador_listar_atribuicoes\(uuid, uuid\)[\s\S]*?to authenticated/i,
  );
});

Deno.test("opções de coordenação são fechadas, ativas e limitadas ao escopo", () => {
  const options = functionBlock(
    "public.professores_coordenacoes_opcoes_cadastro(",
  );

  assert.match(options, /RETURNS jsonb/i);
  assert.match(options, /SECURITY DEFINER/i);
  assert.match(options, /SET search_path = ''/i);
  assert.match(options, /p_polo_id uuid[\s\S]*?p_include_global boolean/i);
  assert.match(options, /portal_identidade_validar_escopo_solicitado\(/i);
  assert.match(options, /polo\.id = p_polo_id/i);
  assert.match(options, /public\.is_active_status\(polo\.status\)/i);
  assert.match(options, /public\.is_active_status\(professor\.status\)/i);
  assert.match(options, /public\.is_active_status\(curso\.status\)/i);
  assert.match(options, /EXISTS \(SELECT 1 FROM polos_autorizados\)/i);
  assert.match(options, /upper\(professor\.tipo\) = 'PROFESSOR'/i);
  assert.match(options, /polo\.id = professor\.polo_id/i);
  assert.match(
    options,
    /polo\.id = ANY\(coalesce\(professor\.polo_ids, ARRAY\[\]::uuid\[\]\)\)/i,
  );
  assert.match(options, /cardinality\(professor\.polo_ids\) > 0/i);
  for (const key of ["professores", "cursos", "polos", "poloIds"]) {
    assert.match(options, new RegExp(`'${key}'`, "i"));
  }
  assert.match(
    sql,
    /revoke all on function public\.professores_coordenacoes_opcoes_cadastro\(uuid, boolean\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.professores_coordenacoes_opcoes_cadastro\(uuid, boolean\)[\s\S]*?TO authenticated/i,
  );
});

Deno.test("busca textual não converte CPF vazio em curinga universal", () => {
  const list = functionBlock("public.responsaveis_legais_listar(");

  assert.match(list, /v_busca_digitos text := nullif\(/i);
  assert.match(list, /v_busca_digitos is not null[\s\S]*?cpf_normalizado/i);
  assert.doesNotMatch(
    list,
    /cpf_normalizado[^;]*?like '%' \|\|\s*pg_catalog\.regexp_replace\(v_busca/i,
  );
});

Deno.test("opções de aluno para vínculo são mínimas e filtradas no backend", () => {
  const options = functionBlock(
    "public.responsavel_legal_alunos_opcoes_vinculo(",
  );

  assert.match(options, /RETURNS jsonb/i);
  assert.match(options, /SECURITY DEFINER/i);
  assert.match(options, /SET search_path = ''/i);
  assert.match(options, /p_polo_id uuid[\s\S]*?p_include_global boolean/i);
  assert.match(options, /portal_identidade_validar_escopo_solicitado\(/i);
  assert.match(options, /upper\(aluno\.tipo\) = 'ALUNO'/i);
  assert.match(options, /public\.is_active_status\(aluno\.status\)/i);
  assert.match(
    options,
    /portal_identidade_aluno_no_polo\(aluno\.id, p_polo_id\)/i,
  );
  assert.match(options, /'items'[\s\S]*?'id'[\s\S]*?'nome'/i);
  assert.doesNotMatch(options, /cpf|email|telefone|matricula/i);
  assert.match(
    sql,
    /revoke all on function public\.responsavel_legal_alunos_opcoes_vinculo\(uuid, boolean\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.responsavel_legal_alunos_opcoes_vinculo\(uuid, boolean\)[\s\S]*?TO authenticated/i,
  );
});

Deno.test("identidade ligada ao Auth é imutável e mudança prévia revalida", () => {
  const save = functionBlock("public.responsavel_legal_salvar(");

  assert.match(save, /v_identidade_alterada/i);
  assert.match(
    save,
    /v_responsavel\.auth_user_id is not null and v_identidade_alterada/i,
  );
  assert.match(save, /RESPONSAVEL_IDENTIDADE_VINCULADA_IMUTAVEL/i);
  assert.match(save, /when v_ativacao_explicita then statement_timestamp\(\)/i);
  assert.match(save, /when v_identidade_alterada then null/i);
  assert.match(save, /v_status := 'PENDENTE'/i);
});

Deno.test("criação sem vínculo é global e prova jurídica exige escopo global", () => {
  const globalGuard = functionBlock(
    "public.portal_identidade_gestor_pode_gerir_global()",
  );
  const save = functionBlock("public.responsavel_legal_salvar(");
  const link = functionBlock("public.responsavel_legal_vincular_aluno(");
  const revoke = functionBlock("public.responsavel_legal_revogar_vinculo(");
  const prepare = functionBlock("public.responsavel_legal_acesso_preparar(");

  assert.match(globalGuard, /portal_identidade_gestor_escopo_atual/i);
  assert.match(globalGuard, /->> 'allPolos'/i);
  assert.match(save, /RESPONSAVEL_CRIACAO_GLOBAL_OBRIGATORIA/i);
  assert.match(save, /p_include_global AND v_pode_gerir_global/i);
  assert.match(save, /ARRAY\['nome', 'status'\]::text\[\]/i);
  assert.match(save, /GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO/i);
  assert.match(link, /GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO_PARA_VERIFICAR/i);
  assert.match(
    revoke,
    /GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO_PARA_REVOGAR_VERIFICADO/i,
  );
  assert.match(prepare, /GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO/i);
});

Deno.test("ATIVO e VERIFICADO exigem método fechado e referência interna", () => {
  const save = functionBlock("public.responsavel_legal_salvar(");
  const link = functionBlock("public.responsavel_legal_vincular_aluno(");
  const list = functionBlock("public.responsaveis_legais_listar(");
  const get = functionBlock("public.responsavel_legal_obter(");

  assert.match(
    sql,
    /identidade_verificacao_metodo[\s\S]*?'DOCUMENTO_CONFERIDO'[\s\S]*?'PRESENCIAL'/i,
  );
  assert.match(
    sql,
    /verificacao_metodo[\s\S]*?'DOCUMENTO_CONFERIDO'[\s\S]*?'DECISAO_JUDICIAL'[\s\S]*?'PRESENCIAL'/i,
  );
  assert.match(
    sql,
    /identidade_verificacao_referencia = btrim\(identidade_verificacao_referencia\)[\s\S]*?between 3 and 120/i,
  );
  assert.match(
    sql,
    /verificacao_referencia = btrim\(verificacao_referencia\)[\s\S]*?between 3 and 120/i,
  );
  assert.match(save, /verificacaoMetodo[\s\S]*?verificacaoReferencia/i);
  assert.match(save, /RESPONSAVEL_ATIVACAO_EXIGE_VERIFICACAO_GLOBAL/i);
  assert.match(link, /VINCULO_VERIFICADO_EXIGE_PROVA_GLOBAL/i);
  assert.match(link, /VINCULO_PROVA_METODO_E_REFERENCIA_OBRIGATORIOS/i);
  assert.match(link, /VINCULO_VERIFICADO_USA_REVOGACAO/i);
  assert.doesNotMatch(list, /identidade_verificacao_referencia/i);
  assert.match(get, /identidadeVerificacaoReferencia/i);
  assert.match(get, /WHEN v_pode_gerir_global/i);
});

Deno.test("vínculo verificado é prova imutável e exige revogação para nova versão", () => {
  const trigger = functionBlock("public.portal_identidade_validar_vinculo()");
  const link = functionBlock("public.responsavel_legal_vincular_aluno(");
  const revoke = functionBlock("public.responsavel_legal_revogar_vinculo(");

  assert.match(trigger, /OLD\.status = 'VERIFICADO'/i);
  for (
    const field of [
      "parentesco",
      "descricao_outro",
      "vigente_de",
      "vigente_ate",
      "verificado_em",
      "verificado_por",
      "verificacao_metodo",
      "verificacao_referencia",
    ]
  ) {
    assert.match(
      trigger,
      new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`, "i"),
    );
  }
  assert.match(trigger, /NEW\.status NOT IN \('VERIFICADO', 'REVOGADO'\)/i);
  assert.match(trigger, /VINCULO_VERIFICADO_IMUTAVEL_USE_REVOGACAO/i);
  assert.match(link, /VINCULO_VERIFICADO_IMUTAVEL_USE_REVOGACAO/i);
  assert.match(revoke, /status = 'REVOGADO'/i);
  assert.match(revoke, /revogado_em = statement_timestamp\(\)/i);
  assert.match(revoke, /revogado_por = v_actor/i);
});

Deno.test("prova multipapel aceita convite novo ou ao menos um perfil correspondente", () => {
  const bind = functionBlock("public.responsavel_legal_acesso_vincular(");

  assert.match(bind, /auth\.users as usuario_auth/i);
  assert.match(bind, /RESPONSAVEL_AUTH_EMAIL_DIVERGENTE/i);
  assert.match(bind, /parceiro_existente\.auth_user_id = p_auth_user_id/i);
  assert.match(bind, /gestor_existente\.auth_user_id = p_auth_user_id/i);
  assert.match(
    bind,
    /and not \([\s\S]*?from public\.parceiros as parceiro[\s\S]*?or exists \([\s\S]*?from public\.usuarios_sistema as gestor/i,
  );
  assert.match(
    bind,
    /nullif\(btrim\(parceiro\.auth_login_email\), ''\)[\s\S]*?nullif\(btrim\(parceiro\.email\), ''\)/i,
  );
  assert.ok(
    bind.indexOf("nullif(btrim(parceiro.auth_login_email), '')") <
      bind.indexOf("nullif(btrim(parceiro.email), '')"),
    "auth_login_email precisa preceder email na identidade canônica.",
  );
  assert.match(bind, /AUTH_USER_JA_VINCULADO_A_OUTRO_RESPONSAVEL/i);
  assert.match(bind, /pg_advisory_xact_lock/i);
});

Deno.test("RPCs internas de acesso são service_role-only e explicam bloqueio", () => {
  const prepare = functionBlock("public.responsavel_legal_acesso_preparar(");
  const bind = functionBlock("public.responsavel_legal_acesso_vincular(");

  assert.match(prepare, /portal_identidade_exigir_service_role_actor/i);
  assert.match(prepare, /'eligible', v_bloqueio is null/i);
  assert.match(prepare, /'accessBlockReason', v_bloqueio/i);
  assert.match(prepare, /VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO/i);
  assert.match(prepare, /v_responsavel\.criado_por = p_actor_auth_user_id/i);
  assert.match(bind, /repete elegibilidade e escopo depois do lock/i);
  assert.match(bind, /atualizado_por = p_actor_auth_user_id/i);
  assert.match(
    sql,
    /revoke all on function public\.responsavel_legal_acesso_preparar\(uuid, uuid\)[\s\S]*?authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.responsavel_legal_acesso_preparar\(uuid, uuid\)[\s\S]*?to service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.responsavel_legal_acesso_vincular\(uuid, uuid, uuid, uuid\)[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?public\.responsaveis_legais/i,
  );
});

Deno.test("listar e obter responsável mantêm shape camelCase completo", () => {
  const list = functionBlock("public.responsaveis_legais_listar(");
  const get = functionBlock("public.responsavel_legal_obter(");

  assert.match(list, /RETURNS jsonb/i);
  for (
    const key of [
      "items",
      "nextCursor",
      "authUserId",
      "identidadeVerificada",
      "eligible",
      "accessBlockReason",
      "dependentesAtivos",
      "canManageGlobal",
      "canVerify",
      "createdAt",
      "updatedAt",
    ]
  ) {
    assert.match(list, new RegExp(`'${key}'`, "i"));
  }
  assert.doesNotMatch(list, /identidade_verificacao_referencia/i);
  for (
    const key of [
      "authUserId",
      "identidadeVerificada",
      "identidadeVerificadaEm",
      "identidadeVerificacaoMetodo",
      "identidadeVerificacaoReferencia",
      "eligible",
      "accessBlockReason",
      "canManageGlobal",
      "canVerify",
      "dependentesAtivos",
      "vinculos",
      "createdAt",
      "updatedAt",
    ]
  ) {
    assert.match(get, new RegExp(`'${key}'`, "i"));
  }
  for (
    const key of [
      "id",
      "alunoId",
      "alunoNome",
      "parentesco",
      "descricaoOutro",
      "status",
      "verificadoEm",
      "verificacaoMetodo",
      "verificacaoReferencia",
      "vigenteDe",
      "vigenteAte",
    ]
  ) {
    assert.match(get, new RegExp(`'${key}'`, "i"));
  }
  assert.match(get, /upper\(aluno\.tipo\) = 'ALUNO'/i);
  assert.match(get, /public\.is_active_status\(aluno\.status\)/i);
});

Deno.test("mutações autorizam antes do replay e auditam sem segredo", () => {
  for (
    const signature of [
      "public.responsavel_legal_salvar(",
      "public.responsavel_legal_vincular_aluno(",
      "public.responsavel_legal_revogar_vinculo(",
      "public.professor_coordenacao_salvar(",
      "public.professor_coordenacao_revogar(",
      "public.responsavel_legal_acesso_vincular(",
    ]
  ) {
    assertAuthorizationPrecedesReplay(signature);
  }

  const ledger = sql.slice(
    sql.indexOf("CREATE TABLE public.portal_identidade_operacoes"),
    sql.indexOf(
      "CREATE UNIQUE INDEX portal_identidade_operacoes_actor_request_key",
    ),
  );
  assert.doesNotMatch(ledger, /senha|password|token|credential/i);
  assert.match(ledger, /payload_sha256/i);
  assert.match(sql, /PORTAL_IDENTIDADE_REQUEST_REPLAY_DIVERGENTE/i);
});

Deno.test("coordenação revalida autorização e escopo depois do lock", () => {
  for (
    const signature of [
      "public.professor_coordenacao_salvar(",
      "public.professor_coordenacao_revogar(",
    ]
  ) {
    const block = functionBlock(signature);
    const replay = block.indexOf("portal_identidade_obter_replay(");
    const advisoryLock = block.indexOf("pg_advisory_xact_lock(", replay);
    const rowLock = block.indexOf("FOR UPDATE", advisoryLock);
    const authorization = block.indexOf(
      "portal_identidade_validar_escopo_solicitado(",
      advisoryLock,
    );
    const scope = block.indexOf(
      "portal_identidade_professor_no_escopo_gestor(",
      authorization,
    );
    const mutation = block.indexOf(
      "UPDATE public.professores_coordenacoes",
      scope,
    );

    assert.ok(advisoryLock > replay, `${signature} não serializa após replay.`);
    if (signature.includes("revogar")) {
      assert.ok(rowLock > advisoryLock, `${signature} não bloqueia a linha.`);
    }
    assert.ok(
      authorization > advisoryLock,
      `${signature} não reautoriza sob lock.`,
    );
    assert.ok(
      scope > authorization,
      `${signature} não revalida escopo sob lock.`,
    );
    assert.ok(
      mutation > scope,
      `${signature} muta antes da revalidação final.`,
    );
    assert.match(
      block,
      /'coordenacao:' \|\| v_curso_id::text \|\| ':' \|\| v_polo_id::text/i,
    );
  }
});

Deno.test("mutações de responsável reautorizam gestor e escopo após locks", () => {
  for (
    const signature of [
      "public.responsavel_legal_salvar(",
      "public.responsavel_legal_vincular_aluno(",
      "public.responsavel_legal_revogar_vinculo(",
    ]
  ) {
    const block = functionBlock(signature);
    const replay = block.indexOf("portal_identidade_obter_replay(");
    const lock = Math.max(
      block.indexOf("FOR UPDATE", replay),
      block.indexOf("pg_advisory_xact_lock(", replay),
    );
    const authorization = block.indexOf(
      "portal_identidade_validar_escopo_solicitado(",
      lock,
    );
    const scope = Math.max(
      block.indexOf(
        "portal_identidade_responsavel_no_escopo_solicitado(",
        authorization,
      ),
      block.indexOf("portal_identidade_aluno_no_polo(", authorization),
    );

    assert.ok(replay >= 0, `${signature} não serializa requestId.`);
    assert.ok(lock > replay, `${signature} não adquire lock depois do replay.`);
    assert.ok(
      authorization > lock,
      `${signature} não reautoriza o gestor depois do lock.`,
    );
    assert.ok(scope > authorization, `${signature} não revalida escopo final.`);
  }
});

Deno.test("lista de coordenações projeta e filtra status temporal efetivo", () => {
  const list = functionBlock("public.professores_coordenacoes_listar(");

  assert.match(
    list,
    /WHEN coordenacao\.status = 'ATIVA'[\s\S]*?coordenacao\.vigente_ate IS NOT NULL[\s\S]*?coordenacao\.vigente_ate <= statement_timestamp\(\)[\s\S]*?THEN 'EXPIRADA'::text/i,
  );
  assert.match(list, /estado\.status_efetivo AS status/i);
  assert.match(
    list,
    /v_status IS NULL OR estado\.status_efetivo = v_status/i,
  );
  assert.doesNotMatch(
    list,
    /v_status IS NULL OR coordenacao\.status = v_status/i,
  );
});

Deno.test("primeiro acesso aceita somente termos vigentes após senha do Auth", () => {
  const terms = functionBlock(
    "public.portal_identidade_termos_versao_vigente()",
  );
  const finish = functionBlock("public.portal_finalizar_primeiro_acesso(");

  assert.match(terms, /SELECT '2026-08-05'::text/i);
  assert.match(finish, /v_actor uuid := auth\.uid\(\)/i);
  assert.match(finish, /p_aceitar_termos IS DISTINCT FROM true/i);
  assert.match(
    finish,
    /btrim\(p_termos_versao\) IS DISTINCT FROM v_termos_versao_vigente/i,
  );
  assert.match(finish, /PORTAL_PRIMEIRO_ACESSO_TERMOS_VERSAO_DIVERGENTE/i);
  assert.match(finish, /aluno\.auth_user_id = v_actor/i);
  assert.match(finish, /upper\(aluno\.tipo\) = 'ALUNO'/i);
  assert.match(finish, /public\.is_active_status\(aluno\.status\)/i);

  const authorization = finish.indexOf("aluno.auth_user_id = v_actor");
  const replay = finish.indexOf("portal_identidade_obter_replay(");
  const rowLock = finish.indexOf("FOR UPDATE", replay);
  const passwordState = finish.indexOf("troca_senha_obrigatoria", rowLock);
  const replayReturn = finish.indexOf("IF v_replay IS NOT NULL", passwordState);
  assert.ok(authorization >= 0 && replay > authorization);
  assert.ok(
    rowLock > replay,
    "Primeiro acesso não revalida o contexto sob lock.",
  );
  assert.ok(
    passwordState > rowLock && replayReturn > passwordState,
    "Replay não pode contornar o estado canônico da troca de senha.",
  );

  assert.match(finish, /v_aceite_em := pg_catalog\.clock_timestamp\(\)/i);
  assert.match(finish, /updated_at = pg_catalog\.statement_timestamp\(\)/i);
  assert.match(finish, /'acceptedTermsAt', v_aceite_em/i);
  assert.match(finish, /'acceptedTermsVersion', v_termos_versao_vigente/i);
  assert.match(finish, /'requiresPasswordReset', false/i);
  assert.match(finish, /'PRIMEIRO_ACESSO_FINALIZAR'/i);
  assert.match(sql, /'PRIMEIRO_ACESSO_FINALIZAR'[\s\S]*?payload_sha256/i);
  assert.match(
    sql,
    /revoke all on function public\.portal_finalizar_primeiro_acesso\(uuid, boolean, text, uuid\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.portal_finalizar_primeiro_acesso\(uuid, boolean, text, uuid\)[\s\S]*?TO authenticated/i,
  );
  assert.doesNotMatch(finish, /p_senha|encrypted_password|update auth\.users/i);
});

Deno.test("paginação usa cursor opaco composto e limite físico estrito", () => {
  const responsibleList = functionBlock("public.responsaveis_legais_listar(");
  const coordinationList = functionBlock(
    "public.professores_coordenacoes_listar(",
  );
  const encoder = functionBlock("public.portal_identidade_cursor_codificar(");
  const decoder = functionBlock("public.portal_identidade_cursor_decodificar(");
  const secret = functionBlock("public.portal_identidade_cursor_hmac_secret()");

  for (const list of [responsibleList, coordinationList]) {
    assert.match(list, /p_cursor text default null/i);
    assert.match(
      list,
      /greatest\(1, least\(coalesce\(p_limite, 50\), 100\)\)/i,
    );
    assert.match(list, /portal_identidade_cursor_decodificar\(p_cursor\)/i);
    assert.match(
      list,
      /\(\w+\.created_at, \w+\.id\)\s*<\s*\(v_cursor_created_at, v_cursor_id\)/i,
    );
    assert.match(list, /order by \w+\.created_at desc, \w+\.id desc/i);
    assert.match(list, /limit v_limite \+ 1/i);
    assert.match(list, /limit v_limite/i);
    assert.match(list, /v_total_carregado > v_limite/i);
    assert.match(list, /portal_identidade_cursor_codificar\(/i);
    assert.match(list, /RETURNS jsonb/i);
    assert.match(list, /'items'/i);
    assert.match(list, /'nextCursor'/i);
    assert.doesNotMatch(list, /dense_rank\(/i);
  }

  assert.match(encoder, /'createdAt'[\s\S]*?'id'/i);
  assert.match(encoder, /encode\([\s\S]*?'base64'/i);
  assert.match(encoder, /extensions\.hmac\(/i);
  assert.match(decoder, /extensions\.hmac\(/i);
  assert.match(decoder, /v_signature IS DISTINCT FROM v_expected_signature/i);
  assert.match(
    secret,
    /vault\.decrypted_secrets[\s\S]*?'portal_identity_cursor_hmac_secret'/i,
  );
  assert.match(secret, /octet_length\(v_secret\) < 32/i);
  assert.doesNotMatch(secret, /coalesce\([\s\S]*?secret/i);
  assert.match(decoder, /ARRAY\['createdAt', 'id'\]::text\[\]/i);
  assert.match(decoder, /char_length\(p_cursor\) NOT BETWEEN 8 AND 512/i);
  assert.match(decoder, /::timestamptz/i);
  assert.match(decoder, /::uuid/i);
  assert.match(decoder, /PORTAL_IDENTIDADE_CURSOR_INVALIDO/i);

  assert.match(
    sql,
    /grant execute on function public\.responsaveis_legais_listar\(uuid, boolean, text, text, integer, text\)[\s\S]*?to authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.professores_coordenacoes_listar\(uuid, boolean, text, text, integer, text\)[\s\S]*?to authenticated/i,
  );
});

Deno.test("migração não habilita nem altera envelopes ou assinatura", () => {
  assert.doesNotMatch(
    sql,
    /(?:create|alter|update|insert into|delete from)\s+(?:table\s+)?public\.assinatura_eletronica_(?:envelopes|participantes|eventos|desafios|artefatos)/i,
  );
  assert.match(sql, /ela não altera nem habilita envelopes/i);
  assert.match(sql, /COMMIT;\s*$/i);
});
