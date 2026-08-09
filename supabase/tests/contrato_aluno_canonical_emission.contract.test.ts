// @ts-nocheck -- contrato estático executado pelo Deno fora do bundle web.

const migrationUrl = new URL(
  "../migrations/20260809110000_make_contrato_aluno_emission_canonical.sql",
  import.meta.url,
);
const baseUrl = new URL(
  "../migrations/20260807050000_create_secretaria_documentos_contrato_preceptor_calendario.sql",
  import.meta.url,
);
const rendererUrl = new URL(
  "../migrations/20260807151556_fix_contrato_encerramento_final.sql",
  import.meta.url,
);
const institutionalHeaderUrl = new URL(
  "../migrations/20260809154809_freeze_contract_institutional_header_snapshot.sql",
  import.meta.url,
);
const workspaceIdentityUrl = new URL(
  "../migrations/20260809155637_extend_contract_workspace_student_identity.sql",
  import.meta.url,
);
const redundantHeaderUrl = new URL(
  "../migrations/20260809163000_suppress_redundant_contract_header.sql",
  import.meta.url,
);

const [migration, base, renderer, institutionalHeader, workspaceIdentity, redundantHeader] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(baseUrl),
  Deno.readTextFile(rendererUrl),
  Deno.readTextFile(institutionalHeaderUrl),
  Deno.readTextFile(workspaceIdentityUrl),
  Deno.readTextFile(redundantHeaderUrl),
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function functionBody(sql: string, signature: string) {
  const start = sql.indexOf(signature);
  assert(start >= 0, `função não encontrada: ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert(end > start, `corpo não encerrado: ${signature}`);
  return sql.slice(start, end);
}

Deno.test("replay autorizado devolve o snapshot antes de consultar o modelo atual", () => {
  const emitter = functionBody(
    migration,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );
  const executable = emitter.slice(emitter.indexOf("begin"));
  const authorization = executable.indexOf(
    "can_manage_secretaria_document('contrato_aluno', p_polo_id)",
  );
  const replay = executable.indexOf("return v_replay.resposta;");
  const currentModel = executable.indexOf(
    "from public.documentos_modelos_configuracoes model",
  );

  assert(authorization >= 0, "RBAC por polo precisa preceder qualquer replay");
  assert(replay > authorization, "replay só pode ocorrer depois do RBAC");
  assert(
    currentModel > replay,
    "replay histórico não pode depender do modelo ativo no momento da reimpressão",
  );
  assert(
    /v_replay\.tipo <> 'CONTRATO_ALUNO'[\s\S]*v_replay\.fingerprint <> v_fingerprint/i
      .test(
        emitter,
      ),
    "replay precisa comprovar tipo e payload da chave idempotente",
  );
});

Deno.test("request novo trava modelo ativo e a aprovação da mesma revisão", () => {
  const emitter = functionBody(
    migration,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );

  assert(
    /order by modalidade[\s\S]*documentos_modelos_configuracoes[\s\S]*for share/i
      .test(
        emitter,
      ),
    "locks de modelos precisam ser determinísticos e durar a emissão",
  );
  assert(
    /v_model\.status <> 'ATIVO'/i.test(emitter),
    "somente o modelo ativo pode emitir",
  );
  assert(
    /documentos_modelos_aprovacoes[\s\S]*approval\.modalidade = v_modalidade[\s\S]*approval\.revisao = v_model\.revisao[\s\S]*APROVADO_JURIDICAMENTE[\s\S]*for share/i
      .test(
        emitter,
      ),
    "a revisão ativa precisa ter aprovação jurídica exata e bloqueada",
  );
  assert(
    /tituloDocumento[\s\S]*cabecalho[\s\S]*corpo[\s\S]*rodape[\s\S]*está incompleta/i
      .test(
        emitter,
      ),
    "a emissão deve falhar fechada sem as fontes completas do modelo",
  );
});

Deno.test("request novo trava e revalida matrícula, turma e curso antes de escolher o modelo", () => {
  const emitter = functionBody(
    migration,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );
  const enrollmentLock = emitter.indexOf(
    "from public.matriculas enrollment\n    where enrollment.id = any(v_ids)\n    order by enrollment.id\n    for share",
  );
  const classLock = emitter.indexOf(
    "from public.turmas class\n    where class.id = any(v_class_ids)\n    order by class.id\n    for share",
  );
  const courseLock = emitter.indexOf(
    "from public.cursos course\n    where course.id = any(v_course_ids)\n    order by course.id\n    for share",
  );
  const lockedValidation = emitter.indexOf(
    "where enrollment.id = any(v_locked_enrollment_ids)",
    courseLock,
  );
  const modelSelection = emitter.indexOf(
    "from public.documentos_modelos_configuracoes model",
  );
  const baseEmitter = emitter.indexOf(
    "return public.preparar_emissao_contrato_aluno_base_secure(",
  );

  assert(
    enrollmentLock >= 0,
    "matrículas selecionadas precisam de FOR SHARE ordenado",
  );
  assert(
    classLock > enrollmentLock,
    "turmas precisam ser travadas depois das matrículas",
  );
  assert(
    courseLock > classLock,
    "cursos precisam ser travados depois das turmas",
  );
  assert(
    lockedValidation > courseLock,
    "polo, status e modalidade precisam ser revalidados sob os três locks",
  );
  assert(
    /where enrollment\.id = any\(v_locked_enrollment_ids\)[\s\S]*class\.id = any\(v_locked_class_ids\)[\s\S]*course\.id = any\(v_locked_course_ids\)[\s\S]*class\.polo_id = p_polo_id[\s\S]*enrollment\.status[\s\S]*course\.modalidade/i
      .test(emitter.slice(lockedValidation, modelSelection)),
    "revalidação precisa consumir exclusivamente as identidades travadas",
  );
  assert(
    modelSelection > lockedValidation,
    "modelo só pode ser derivado após a revalidação",
  );
  assert(
    baseEmitter > modelSelection,
    "emissor base só pode rodar sob todos os locks",
  );
});

Deno.test("emissor privado congela o mesmo modelo no snapshot e no render", () => {
  const baseEmitter = functionBody(
    base,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );

  assert(
    /v_rendered := public\.renderizar_contrato_aluno_documento\(\s*v_model\.conteudo,\s*v_snapshot/i
      .test(
        baseEmitter,
      ),
    "render oficial precisa receber o conteúdo exato do modelo bloqueado",
  );
  assert(
    /'templateRevision', v_model\.revisao[\s\S]*'templateSnapshot', v_model\.conteudo[\s\S]*'contractSnapshot', v_snapshot[\s\S]*'renderedDocument', v_rendered/i
      .test(
        baseEmitter,
      ),
    "ledger precisa persistir revisão, modelo, dados contratuais e render",
  );
  assert(
    /'render_payload'[\s\S]*'template', v_model\.conteudo[\s\S]*'template_revision', v_model\.revisao[\s\S]*'snapshot', v_snapshot[\s\S]*'rendered', v_rendered/i
      .test(
        baseEmitter,
      ),
    "PDF precisa receber o mesmo snapshot oficial persistido",
  );
});

Deno.test("snapshot emitido não pode ser substituído", () => {
  const guard = functionBody(
    migration,
    "create or replace function public.preservar_snapshot_contrato_aluno_emitido()",
  );

  for (
    const key of [
      "templateKey",
      "templateRevision",
      "templateSnapshot",
      "contractSnapshot",
      "renderedDocument",
    ]
  ) {
    assert(
      guard.includes(`dados_emissao -> '${key}'`),
      `guarda imutável ausente para ${key}`,
    );
  }
  assert(
    /before update of dados_emissao on public\.documentos_validacao[\s\S]*execute function public\.preservar_snapshot_contrato_aluno_emitido/i
      .test(
        migration,
      ),
    "a proteção precisa executar antes de qualquer update do snapshot",
  );
});

Deno.test("RBAC, search_path e superfície de execução permanecem restritos", () => {
  const emitter = functionBody(
    migration,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );

  assert(
    /security definer\s+set search_path = ''/i.test(emitter),
    "RPC pública precisa de SECURITY DEFINER com search_path vazio",
  );
  assert(
    /revoke all on function public\.preparar_emissao_contrato_aluno_base_secure\([\s\S]*from public, anon, authenticated, service_role/i
      .test(
        migration,
      ),
    "emissor base deve continuar totalmente privado",
  );
  assert(
    /grant execute on function public\.preparar_emissao_contrato_aluno_secure\([\s\S]*to authenticated, service_role/i
      .test(
        migration,
      ),
    "somente a RPC canônica pode ser executada por clientes autenticados",
  );
});

Deno.test("migração não redefine conteúdo jurídico, visual ou compositor", () => {
  assert(
    !/create or replace function public\.renderizar_contrato_aluno_documento/i
      .test(
        migration,
      ),
    "esta correção não pode alterar o renderizador jurídico/visual",
  );
  assert(
    !/Contrato de Prestação de Serviços Educacionais|CLÁUSULA|CONTRATANTE:/i
      .test(
        migration,
      ),
    "esta correção não pode introduzir minuta paralela",
  );
  assert(
    /create or replace function public\.renderizar_contrato_aluno_documento/i
      .test(
        renderer,
      ),
    "o renderizador jurídico existente deve continuar sendo a única fonte visual",
  );
});

Deno.test("migration incremental encerra atomicamente", () => {
  assert(
    /^begin;/i.test(migration.trim()),
    "migration precisa iniciar transação",
  );
  assert(
    /commit;\s*$/i.test(migration.trim()),
    "migration precisa finalizar COMMIT",
  );
});

Deno.test("novas emissões congelam o mesmo cabeçalho institucional exibido no modelo", () => {
  const helper = functionBody(
    institutionalHeader,
    "create or replace function public.enriquecer_snapshot_identidade_visual_contrato(",
  );

  for (const field of [
    "nomeFantasia",
    "razaoSocial",
    "cnpj",
    "endereco",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "uf",
    "cep",
    "telefone",
    "email",
    "logoUrl",
    "isMatriz",
  ]) {
    assert(helper.includes(`'${field}'`), `campo institucional não congelado: ${field}`);
  }
  assert(
    helper.includes("company.nome_fantasia")
      && helper.includes("company.razao_social")
      && helper.includes("company.cnpj"),
    "cabeçalho deve priorizar a empresa Matriz usada pelo editor",
  );
  assert(
    /'presentationVersion', 'CONTRATO_A4_INSTITUCIONAL_V2'/i.test(helper),
    "snapshot precisa declarar a versão visual institucional",
  );
});

Deno.test("enriquecimento ocorre antes do render e preserva históricos existentes", () => {
  assert(
    /v_snapshot := public\.enriquecer_snapshot_identidade_visual_contrato\(v_snapshot\);[\s\S]*v_rendered := public\.renderizar_contrato_aluno_documento/i.test(
      institutionalHeader,
    ),
    "snapshot completo precisa chegar ao renderizador e ao ledger",
  );
  assert(
    !/update\s+public\.documentos_validacao/i.test(institutionalHeader),
    "a correção não pode reescrever contratos históricos",
  );
  assert(
    /revoke all on function public\.enriquecer_snapshot_identidade_visual_contrato\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i.test(
      institutionalHeader,
    ),
    "helper interno não pode ficar executável por clientes",
  );
  assert(
    /^--[\s\S]*begin;/i.test(institutionalHeader.trim())
      && /commit;\s*$/i.test(institutionalHeader.trim()),
    "migration institucional precisa ser atômica",
  );
});

Deno.test("workspace entrega identidade canônica sem alterar elegibilidade", () => {
  const workspace = functionBody(
    workspaceIdentity,
    "create or replace function public.get_secretaria_contratos_aluno_workspace_secure(",
  );

  for (const field of [
    "'polo_id', p_polo_id",
    "'aluno_cpf', student.cpf_cnpj",
    "'aluno_rg', student.rg",
    "'aluno_foto_url', student.foto_url",
    "'data_matricula', enrollment.data_matricula",
  ]) {
    assert(workspace.includes(field), `campo de cartão ausente do workspace: ${field}`);
  }
  assert(
    /can_manage_secretaria_document\('contrato_aluno', p_polo_id\)[\s\S]*model\.status = 'ATIVO'[\s\S]*enrollment\.status/i.test(
      workspace,
    ),
    "RBAC e elegibilidade original precisam permanecer no backend",
  );
  assert(
    /revoke all on function public\.get_secretaria_contratos_aluno_workspace_secure\(uuid\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated, service_role/i.test(
      workspaceIdentity,
    ),
    "RPC do workspace deve manter a superfície de execução prevista",
  );
});

Deno.test("renderer elimina somente cabeçalho redundante igual à instituição", () => {
  const render = functionBody(
    redundantHeader,
    "create or replace function public.renderizar_contrato_aluno_documento(",
  );

  for (const identityField of ["instituicao,nome", "instituicao,nomeFantasia", "instituicao,razaoSocial"]) {
    assert(
      render.includes(identityField),
      `renderer precisa comparar cabeçalho com ${identityField}`,
    );
  }
  assert(
    /if nullif\(btrim\(v_header\), ''\) is not null[\s\S]*v_header := ''/i.test(render),
    "nome institucional repetido precisa resultar em subtítulo vazio",
  );
  assert(
    /v_header := replace\(v_header, '\{\{instituicao\.nome\}\}'[\s\S]*public\.paginar_texto_documento_canonico\(\s*v_header/i.test(render),
    "subtítulo personalizado precisa continuar seguindo para a paginação canônica",
  );
  assert(
    /revoke all on function public\.renderizar_contrato_aluno_documento\(jsonb, jsonb, text, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/i.test(
      redundantHeader,
    ),
    "renderer deve permanecer privado",
  );
});
