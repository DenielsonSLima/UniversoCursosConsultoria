import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const stateMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260822113000_gate_institutional_first_access.sql",
    import.meta.url,
  ),
);
const enforcementCoreMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260822113010_enforce_institutional_first_access_gate.sql",
    import.meta.url,
  ),
);
const enforcementBypassMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260822113020_close_institutional_gate_bypasses.sql",
    import.meta.url,
  ),
);
const enforcementMigration =
  `${enforcementCoreMigration}\n${enforcementBypassMigration}`;
const gestorAccess = await Deno.readTextFile(
  new URL(
    "../functions/portal-user-management/gestor-access.ts",
    import.meta.url,
  ),
);
const sharedAuthz = await Deno.readTextFile(
  new URL("../functions/_shared/authz.ts", import.meta.url),
);
const upsertGestor = await Deno.readTextFile(
  new URL(
    "../functions/portal-user-management/handlers/upsert-gestor-user.ts",
    import.meta.url,
  ),
);
const ensureProfessor = await Deno.readTextFile(
  new URL(
    "../functions/portal-user-management/handlers/ensure-professor-access.ts",
    import.meta.url,
  ),
);
const linkProfessor = await Deno.readTextFile(
  new URL(
    "../functions/portal-user-management/handlers/link-professor-auth-identity.ts",
    import.meta.url,
  ),
);

const functionBlock = (sql: string, signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("estado institucional distingue legado, convite e senha criada", () => {
  for (const table of ["usuarios_sistema", "parceiros"]) {
    assert.match(
      stateMigration,
      new RegExp(
        `ALTER TABLE public\\.${table}[\\s\\S]*?` +
          "primeiro_acesso_institucional_pendente boolean" +
          "[\\s\\S]*?senha_institucional_criada_em timestamptz" +
          "[\\s\\S]*?acesso_institucional_origem text" +
          "[\\s\\S]*?primeiro_acesso_institucional_operacao_id uuid",
        "i",
      ),
    );
  }
  assert.match(
    stateMigration,
    /UPDATE public\.usuarios_sistema[\s\S]*?acesso_institucional_origem = 'LEGADO'/i,
  );
  assert.match(
    stateMigration,
    /ALTER TABLE public\.usuarios_sistema[\s\S]*?SET DEFAULT true[\s\S]*?SET DEFAULT 'CONVITE'/i,
  );
  assert.match(stateMigration, /'IDENTIDADE_EXISTENTE'/i);
  assert.match(stateMigration, /'SENHA_CRIADA'/i);
  assert.doesNotMatch(
    stateMigration,
    /raw_user_meta_data|email_confirmed_at|last_sign_in_at/i,
  );
});

Deno.test("convite novo nasce bloqueado mesmo com hash pré-existente", () => {
  const initializer = functionBlock(
    stateMigration,
    "public.inicializar_primeiro_acesso_institucional()",
  );

  assert.match(initializer, /acesso_institucional_origem = 'CONVITE'/i);
  assert.match(initializer, /primeiro_acesso_institucional_operacao_id/i);
  assert.match(
    initializer,
    /FROM public\.usuarios_sistema AS gestor_existente[\s\S]*?NOT gestor_existente\.primeiro_acesso_institucional_pendente/i,
  );
  assert.match(
    initializer,
    /FROM public\.parceiros AS parceiro_existente[\s\S]*?NOT parceiro_existente\.primeiro_acesso_institucional_pendente/i,
  );
  assert.match(
    initializer,
    /IF NOT FOUND THEN[\s\S]*?primeiro_acesso_institucional_pendente := true/i,
  );
  assert.doesNotMatch(
    initializer,
    /encrypted_password|raw_user_meta_data|email_confirmed_at|last_sign_in_at/i,
  );
  assert.match(
    stateMigration,
    /CREATE TRIGGER zz10_inicializar_primeiro_acesso_institucional[\s\S]*?BEFORE INSERT OR UPDATE ON public\.usuarios_sistema/i,
  );
  assert.match(
    stateMigration,
    /CREATE TRIGGER zz10_inicializar_primeiro_acesso_institucional[\s\S]*?BEFORE INSERT OR UPDATE ON public\.parceiros/i,
  );
});

Deno.test("somente password_changed conclui o convite institucional", () => {
  const sync = functionBlock(
    stateMigration,
    "public.sincronizar_primeiro_acesso_institucional()",
  );

  assert.match(
    sync,
    /OLD\.encrypted_password IS NOT DISTINCT FROM NEW\.encrypted_password/i,
  );
  assert.match(sync, /coalesce\(NEW\.encrypted_password, ''\) = ''/i);
  assert.doesNotMatch(
    sync,
    /email_confirmed_at|confirmed_at|raw_user_meta_data/i,
  );
  assert.match(
    sync,
    /INSERT INTO public\.portal_identidade_institucional_senha_eventos/i,
  );
  assert.match(
    sync,
    /primeiro_acesso_institucional_pendente = false/i,
  );
  assert.match(sync, /senha_institucional_criada_em = v_senha_criada_em/i);
  assert.match(sync, /acesso_institucional_origem = 'SENHA_CRIADA'/i);
  assert.match(
    stateMigration,
    /REVOKE ALL ON TABLE public\.portal_identidade_institucional_senha_eventos[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(
    stateMigration,
    /CREATE TRIGGER zz20_sincronizar_primeiro_acesso_institucional[\s\S]*?AFTER UPDATE OF encrypted_password ON auth\.users/i,
  );
});

Deno.test("estado do gate não pode ser forjado pelo cliente", () => {
  const guard = functionBlock(
    stateMigration,
    "public.proteger_estado_primeiro_acesso_institucional()",
  );
  assert.match(guard, /current_user NOT IN \('anon', 'authenticated'\)/i);
  assert.match(guard, /PRIMEIRO_ACESSO_INSTITUCIONAL_ESTADO_PROTEGIDO/i);
  assert.match(guard, /NEW\.primeiro_acesso_institucional_pendente/i);
  assert.match(guard, /NEW\.senha_institucional_criada_em/i);
  assert.match(guard, /NEW\.acesso_institucional_origem/i);
  assert.match(guard, /NEW\.primeiro_acesso_institucional_operacao_id/i);
});

Deno.test("RPC central falha fechada e só é pública para service-role", () => {
  const gate = functionBlock(
    stateMigration,
    "public.portal_identidade_institucional_acesso_liberado(",
  );
  assert.match(gate, /WHEN 'GESTOR' THEN EXISTS/i);
  assert.match(gate, /WHEN 'PROFESSOR' THEN EXISTS/i);
  assert.match(
    gate,
    /NOT gestor\.primeiro_acesso_institucional_pendente/i,
  );
  assert.match(
    gate,
    /NOT professor\.primeiro_acesso_institucional_pendente/i,
  );
  assert.match(gate, /acesso_institucional_origem = 'SENHA_CRIADA'/i);
  assert.match(gate, /senha_institucional_criada_em IS NOT NULL/i);
  assert.match(gate, /ELSE false/i);
  assert.match(gate, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(
    stateMigration,
    /REVOKE ALL ON FUNCTION[\s\S]*?portal_identidade_institucional_acesso_liberado\(uuid, text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(
    stateMigration,
    /GRANT EXECUTE ON FUNCTION[\s\S]*?portal_identidade_institucional_acesso_liberado\(uuid, text\)[\s\S]*?TO service_role;/i,
  );
});

Deno.test("RLS, Professor e lista de contextos herdam o gate", () => {
  const schedule = functionBlock(
    enforcementMigration,
    "public.gestor_schedule_allows_access()",
  );
  const isGestor = functionBlock(enforcementMigration, "public.is_gestor()");
  const professor = functionBlock(
    enforcementMigration,
    "public.current_professor_id()",
  );
  const profiles = functionBlock(
    enforcementMigration,
    "public.portal_listar_perfis()",
  );
  const signatureContext = functionBlock(
    enforcementMigration,
    "public.assinatura_eletronica_perfil_contexto_valido(",
  );

  assert.ok(
    schedule.indexOf("portal_identidade_institucional_acesso_liberado") <
      schedule.indexOf("gestor_effective_schedule"),
    "o gate precisa preceder a avaliação de agenda/permissões",
  );
  assert.match(schedule, /WHEN|ELSIF NOT \(v_schedule ->> 'ativo'\)::boolean/i);
  assert.match(schedule, /v_current_day \+ 6/i);
  assert.match(isGestor, /portal_identidade_institucional_acesso_liberado/i);
  assert.match(professor, /'PROFESSOR'/i);
  assert.match(professor, /portal_identidade_institucional_acesso_liberado/i);
  for (const role of ["GESTOR", "PROFESSOR", "COORDENADOR"]) {
    assert.match(profiles, new RegExp(`WHEN '${role}'`, "i"));
    assert.match(signatureContext, new RegExp(`WHEN '${role}'`, "i"));
  }
  assert.match(
    signatureContext,
    /portal_identidade_institucional_acesso_liberado/i,
  );
});

Deno.test("RPCs de perfil e policies de leitura própria também herdam o gate", () => {
  assert.doesNotMatch(
    enforcementMigration,
    /ALTER FUNCTION[\s\S]*?RENAME TO/i,
  );
  for (
    const signature of [
      "public.salvar_meu_perfil_gestor(",
      "public.salvar_meu_avatar_gestor(",
    ]
  ) {
    const block = functionBlock(enforcementMigration, signature);
    assert.match(block, /portal_identidade_institucional_acesso_liberado/i);
    assert.match(block, /PRIMEIRO_ACESSO_INSTITUCIONAL_PENDENTE/i);
  }

  assert.match(
    enforcementMigration,
    /CREATE POLICY portal_usuarios_sistema_select[\s\S]*?auth_user_id = \(SELECT auth\.uid\(\)\)[\s\S]*?AND public\.is_gestor\(\)/i,
  );
  assert.match(
    enforcementMigration,
    /CREATE POLICY portal_perfis_acesso_select[\s\S]*?public\.is_gestor\(\)[\s\S]*?usuario\.perfil_acesso_id = perfis_acesso\.id/i,
  );
});

Deno.test("Edges persistem convite ou identidade existente explicitamente", () => {
  for (const source of [upsertGestor, ensureProfessor]) {
    assert.match(source, /acesso_institucional_origem:[\s\S]*?"CONVITE"/i);
    assert.match(source, /primeiro_acesso_institucional_pendente:/i);
    assert.match(source, /primeiro_acesso_institucional_operacao_id:/i);
  }
  assert.match(
    upsertGestor,
    /reusedPartnerIdentity[\s\S]*?"IDENTIDADE_EXISTENTE"/i,
  );
  assert.match(
    linkProfessor,
    /acesso_institucional_origem: "IDENTIDADE_EXISTENTE"/i,
  );
  assert.match(
    linkProfessor,
    /primeiro_acesso_institucional_pendente: false/i,
  );
});

Deno.test("RPC service-role e Edge recusam o gestor antes da senha", () => {
  const actor = functionBlock(
    enforcementMigration,
    "public.portal_identidade_actor_gestor_contexto(",
  );
  assert.match(actor, /portal_identidade_institucional_acesso_liberado/i);
  assert.ok(
    actor.indexOf("portal_identidade_institucional_acesso_liberado") <
      actor.indexOf("jsonb_build_object"),
  );

  const rpcOffset = gestorAccess.indexOf(
    'admin.rpc(\n      "portal_identidade_institucional_acesso_liberado"',
  );
  const tableOffset = gestorAccess.indexOf('.from("usuarios_sistema")');
  assert.ok(rpcOffset >= 0 && tableOffset > rpcOffset);
  assert.match(
    gestorAccess,
    /institutionalAccessError \|\| institutionalAccessAllowed !== true/i,
  );
  assert.match(gestorAccess, /p_perfil: "GESTOR"/i);

  const sharedRpcOffset = sharedAuthz.indexOf(
    'admin.rpc(\n      "portal_identidade_institucional_acesso_liberado"',
  );
  const sharedTableOffset = sharedAuthz.indexOf('.from("usuarios_sistema")');
  assert.ok(sharedRpcOffset >= 0 && sharedTableOffset > sharedRpcOffset);
  assert.match(
    sharedAuthz,
    /institutionalAccessError \|\| institutionalAccessAllowed !== true/i,
  );
  assert.match(sharedAuthz, /p_auth_user_id: authUserId/i);
  assert.match(sharedAuthz, /p_perfil: "GESTOR"/i);
});

Deno.test("migrations permanecem atômicas e abaixo do teto", () => {
  for (
    const sql of [
      stateMigration,
      enforcementCoreMigration,
      enforcementBypassMigration,
    ]
  ) {
    assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.ok(sql.split(/\r?\n/).length <= 501);
  }
});
