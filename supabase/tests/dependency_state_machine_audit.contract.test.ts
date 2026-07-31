import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260731022629_audit_dependency_state_machine.sql",
  import.meta.url,
);

Deno.test("tentativa possui grafo de estados e resultado terminal coerente", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /matricula_disciplina_tentativas_terminal_state_chk[\s\S]*status = 'APROVADA'[\s\S]*resultado_destino in \('APROVADO', 'APROVEITADO'\)/i,
  );
  assert.match(
    source,
    /old\.status = 'AGUARDANDO_PAGAMENTO'[\s\S]*new\.status in \('LIBERADA', 'CANCELADA'\)/i,
  );
  assert.match(
    source,
    /old\.status in \('APROVADA', 'REPROVADA'\)[\s\S]*new\.status = 'EM_CURSO'/i,
  );
  assert.match(
    source,
    /old\.status = 'EM_CURSO'[\s\S]*'AGUARDANDO_PAGAMENTO'/i,
  );
  assert.match(
    source,
    /new\.status <> 'AGUARDANDO_PAGAMENTO'[\s\S]*Nova tentativa de dependência deve aguardar pagamento/i,
  );
});

Deno.test("tentativa pertence ao componente, matrícula e curso de origem", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.validate_dependency_attempt/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /new\.disciplina_id <> v_component_discipline/i,
  );
  assert.match(
    functionSource,
    /new\.turma_origem_id <> v_enrollment_class/i,
  );
  assert.match(functionSource, /new\.turma_id = new\.turma_origem_id/i);
  assert.match(
    functionSource,
    /v_source_course is distinct from v_target_course/i,
  );
});

Deno.test("tentativa vencedora não pode cruzar componentes", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.validate_dependency_component/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /v_winner\.componente_id <> new\.id/i,
  );
  assert.match(
    functionSource,
    /new\.status <> 'APROVADO'/i,
  );
  assert.match(
    functionSource,
    /v_winner\.resultado_destino not in \('APROVADO', 'APROVEITADO'\)/i,
  );
});

Deno.test("cobrança mantém aluno, turma destino e ausência de matrícula financeira", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.validate_dependency_charge_link/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /recebivel\.cliente_id[\s\S]*recebivel\.turma_id as recebivel_turma_id/i,
  );
  assert.match(
    functionSource,
    /v_expected\.recebivel_matricula_id is not null/i,
  );
  assert.match(
    functionSource,
    /upper\(coalesce\(v_expected\.tipo_lancamento, ''\)\) <> 'DEPENDENCIA'/i,
  );
  assert.match(
    functionSource,
    /Vínculos históricos de cobrança da dependência não podem ser excluídos/i,
  );
  assert.match(source, /protect_linked_dependency_receivable/i);
});

Deno.test("cancelamento e reversão financeira não deixam acesso acadêmico órfão", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function internal_academic\.sync_cancelled_dependency_attempt[\s\S]*status = 'PENDENTE_DEPENDENCIA'[\s\S]*'CANCELADA'/i,
  );
  assert.match(
    source,
    /create or replace function internal_academic\.release_dependency_on_payment[\s\S]*old\.status[\s\S]*'PAGO'[\s\S]*status = 'AGUARDANDO_PAGAMENTO'/i,
  );
  assert.match(
    source,
    /status = 'DEPENDENCIA_AGENDADA'[\s\S]*'REVERSAO_PAGAMENTO'/i,
  );
});

Deno.test("retry da confirmação antecede pré-condições mutáveis e vincula o vencimento", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.confirmar_dependencia_reoferta_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);
  const replayLookup = functionSource.indexOf(
    "WHERE tentativa.idempotency_key = btrim(p_idempotency_key)",
  );
  const delegatedCall = functionSource.indexOf(
    "p2_confirmar_dependencia_reoferta_secure_20260730",
  );

  assert.ok(replayLookup > 0 && delegatedCall > replayLookup);
  assert.match(
    functionSource,
    /v_existing\.data_vencimento is distinct from p_data_vencimento/i,
  );
  assert.match(functionSource, /'replayed', true/i);
});

Deno.test("ordem de lock é oferta antes do núcleo que bloqueia matrícula", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.confirmar_dependencia_reoferta_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);
  const offerLock = functionSource.indexOf("FOR UPDATE OF turma, oferta");
  const delegatedCall = functionSource.indexOf(
    "p2_confirmar_dependencia_reoferta_secure_20260730",
  );

  assert.ok(offerLock > 0 && delegatedCall > offerLock);
});

Deno.test("workspace e configuração fecham escopo e replay", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /p_polo_id is not null[\s\S]*not public\.is_gestor_for_polo\(p_polo_id\)/i,
  );
  assert.match(
    source,
    /where politica\.idempotency_key = btrim\(p_idempotency_key\)[\s\S]*'replayed', true[\s\S]*p2_configurar_politica_dependencia_disciplina_secure_20260730/i,
  );
  assert.doesNotMatch(
    source,
    /^update public\.(matricula_componentes|matricula_disciplina_tentativas|contas_receber)\s+set/im,
  );
});

Deno.test("RBAC aceita a aba granular e não herda Gestão/Alunos", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const helperStart = source.search(
    /create or replace function internal_academic\.can_manage_dependency_workspace/i,
  );
  const helperEnd = source.indexOf("$$;", helperStart);
  const helperSource = source.slice(helperStart, helperEnd);

  assert.match(
    helperSource,
    /gestor_has_tab\([\s\S]*'secretaria'[\s\S]*'dependencias-academicas'/i,
  );
  assert.match(
    helperSource,
    /gestor_has_tab\('secretaria', 'solicitacoes'\)/i,
  );
  assert.doesNotMatch(helperSource, /gestao'[\s\S]*'alunos/i);
  assert.match(
    source,
    /p2_configurar_politica_dependencia_disciplina_secure_20260730[\s\S]*gestor_has_tab\([\s\S]*'secretaria'[\s\S]*'dependencias-academicas'/i,
  );
});

Deno.test("boletim canônico preserva acesso do módulo Parceiros no polo", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.can_manage_secretaria_document/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /when p_documento = 'boletim'[\s\S]*gestor_has_module\('parceiros'\)/i,
  );
  assert.match(
    functionSource,
    /is_gestor_for_polo\(p_polo_id\)/i,
  );
});

Deno.test("workspace retorna catálogo técnico exato do polo sem depender de reprovação", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.get_secretaria_dependencias_workspace_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /join public\.turmas_disciplinas oferta[\s\S]*join public\.disciplinas disciplina/i,
  );
  assert.match(functionSource, /turma\.polo_id = p_polo_id/i);
  assert.match(
    functionSource,
    /upper\(coalesce\(curso\.modalidade, ''\)\)[\s\S]*\('TECNICO', 'TÉCNICO'\)/i,
  );
  assert.match(
    functionSource,
    /'disciplinas_configuraveis'[\s\S]*v_disciplines/i,
  );
  assert.doesNotMatch(functionSource, /resultado_final/i);
});
