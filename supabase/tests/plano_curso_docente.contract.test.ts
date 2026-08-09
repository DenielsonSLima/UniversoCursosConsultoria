import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260808234500_create_plano_curso_docente.sql",
  import.meta.url,
);

const assignmentMigrationUrl = new URL(
  "../migrations/20260808223000_fix_gestao_turma_docente_planejamento.sql",
  import.meta.url,
);

function functionBody(source: string, signature: string, next?: string) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Função não encontrada: ${signature}`);
  const end = next
    ? source.indexOf(next, start + signature.length)
    : source.indexOf("$function$;", start) + "$function$;".length;
  assert.ok(end > start, `Fim da função não encontrado: ${signature}`);
  return source.slice(start, end);
}

function lastFunctionBody(source: string, signature: string, next?: string) {
  const start = source.lastIndexOf(signature);
  assert.ok(start >= 0, `Função não encontrada: ${signature}`);
  const end = next
    ? source.indexOf(next, start + signature.length)
    : source.indexOf("$function$;", start) + "$function$;".length;
  assert.ok(end > start, `Fim da função não encontrado: ${signature}`);
  return source.slice(start, end);
}

Deno.test("cadastro recebe os quatro campos eleitorais complementares", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /add column if not exists titulo_eleitor_zona text/i);
  assert.match(source, /add column if not exists titulo_eleitor_secao text/i);
  assert.match(
    source,
    /add column if not exists titulo_eleitor_data_emissao date/i,
  );
  assert.match(source, /add column if not exists titulo_eleitor_uf text/i);
});

Deno.test("Plano de Curso pertence ao vínculo triplo e tem só dois estados persistidos", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /create table if not exists public\.planos_curso/i);
  assert.match(
    source,
    /foreign key \(turma_id, disciplina_id\)[\s\S]*references public\.turmas_disciplinas/i,
  );
  assert.match(
    source,
    /references public\.turmas_disciplinas\(turma_id, disciplina_id\)[\s\S]*on delete restrict/i,
  );
  assert.match(source, /unique \(turma_id, disciplina_id, professor_id\)/i);
  assert.match(source, /status in \('RASCUNHO', 'CONCLUIDO'\)/i);
  assert.match(source, /revisao integer not null default 1/i);
  assert.match(source, /documento_snapshot jsonb/i);
  assert.match(source, /template_revision integer/i);
  assert.match(source, /documento_fingerprint text/i);
  assert.match(
    source,
    /status = 'CONCLUIDO'[\s\S]*jsonb_typeof\(documento_snapshot\) = 'object'[\s\S]*template_revision is not null[\s\S]*documento_fingerprint is not null/i,
  );
});

Deno.test("RLS é defesa em profundidade e escrita direta permanece revogada", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(
    source,
    /alter table public\.planos_curso enable row level security/i,
  );
  assert.match(source, /create policy planos_curso_select_autorizado/i);
  assert.match(
    source,
    /assignment\.professor_id = planos_curso\.professor_id/i,
  );
  assert.match(source, /public\.can_operate_turma_academics\(turma_id\)/i);
  assert.match(
    source,
    /revoke all on table public\.planos_curso from public, anon, authenticated, service_role/i,
  );
  assert.match(
    source,
    /grant select on table public\.planos_curso to authenticated, service_role/i,
  );
  assert.doesNotMatch(source, /grant (insert|update|delete)[^;]*planos_curso/i);
});

Deno.test("Gestão acadêmica assina URL privada somente da assinatura vinculada ao plano", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const helper = functionBody(
    source,
    "create or replace function public.can_read_assinatura_plano_curso_storage(",
    "revoke all on function public.can_read_assinatura_plano_curso_storage",
  );
  assert.match(helper, /security definer\s+set search_path = ''/i);
  assert.match(helper, /\^professores\//i);
  assert.match(helper, /\(assinatura\|envios\/[\s\S]*\)\$/i);
  assert.match(helper, /signature\.assinatura_path = p_name/i);
  assert.match(helper, /plan\.professor_id = candidate\.professor_id/i);
  assert.match(
    helper,
    /public\.can_operate_turma_academics\(plan\.turma_id\)/i,
  );
  assert.match(
    source,
    /create policy assinaturas_objects_select_plano_curso_gestao[\s\S]*on storage\.objects[\s\S]*for select[\s\S]*to authenticated[\s\S]*bucket_id = 'assinaturas'[\s\S]*can_read_assinatura_plano_curso_storage\(name\)/i,
  );
  assert.match(
    source,
    /grant execute on function public\.can_read_assinatura_plano_curso_storage\(text\)[\s\S]*to authenticated/i,
  );
  assert.match(
    source,
    /create index if not exists planos_curso_professor_status_idx[\s\S]*\(professor_id, status, updated_at desc\)/i,
  );
  assert.doesNotMatch(
    source,
    /insert into storage\.buckets|update storage\.buckets/i,
  );
  assert.doesNotMatch(
    source,
    /create policy assinaturas_objects_(insert|update|delete)_plano_curso/i,
  );
  assert.doesNotMatch(helper, /professores\/\.\*|envios\/\.\*/i);
});

Deno.test("workspace deriva datas e labels exclusivamente de aulas_turma", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function internal_academic.build_plano_curso_workspace(",
    "create or replace function public.listar_planos_curso_professor_secure(",
  );
  assert.match(body, /from public\.aulas_turma meeting/i);
  assert.match(body, /meeting\.data_aula is not null/i);
  assert.match(body, /count\(distinct meeting\.data_aula\)/i);
  assert.match(
    body,
    /jsonb_agg\(to_jsonb\(day_row\.data_aula\) order by day_row\.data_aula\)[\s\S]*select distinct dated_meeting\.data_aula/i,
  );
  assert.match(body, /'dataAula', meeting\.data_aula/i);
  assert.match(body, /'horaInicio'.*to_char\(meeting\.hora_inicio/s);
  assert.match(body, /'status', coalesce\(plan\.status, 'AUSENTE'\)/i);
  assert.match(body, /'objetivos'.*plan\.objetivos/s);
  assert.match(body, /'criteriosAvaliacao'.*plan\.criterios_avaliacao/s);
  assert.match(body, /'insumosRecursos'.*plan\.insumos_recursos/s);
});

Deno.test("professor lista e abre somente disciplinas atualmente atribuídas com grade", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const list = functionBody(
    source,
    "create or replace function public.listar_planos_curso_professor_secure(",
    "create or replace function public.obter_plano_curso_professor_secure(",
  );
  const get = functionBody(
    source,
    "create or replace function public.obter_plano_curso_professor_secure(",
    "create or replace function public.salvar_plano_curso_professor_secure(",
  );
  for (const body of [list, get]) {
    assert.match(body, /public\.current_professor_id\(\)/i);
    assert.match(body, /assignment\.professor_id = v_professor_id/i);
    assert.match(body, /meeting\.data_aula is not null/i);
    assert.match(body, /security definer\s+set search_path = ''/i);
  }
  assert.match(get, /v_can_edit/i);
  assert.match(get, /bloqueio_diario[\s\S]*'TOTAL'/i);
});

Deno.test("salvamento aceita somente arrays e conteúdos vinculados a aulas reais", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function public.salvar_plano_curso_professor_secure(",
    "create or replace function public.concluir_plano_curso_professor_secure(",
  );
  assert.match(body, /jsonb_typeof\(coalesce\(p_objetivos/i);
  assert.match(body, /jsonb_typeof\(coalesce\(p_conteudos_aulas/i);
  assert.match(
    body,
    /into v_objetivos[\s\S]*jsonb_array_elements\(p_objetivos\)/i,
  );
  assert.match(body, /item ->> 'aulaId'/i);
  assert.match(body, /meeting\.id = \(item ->> 'aulaId'\)::uuid/i);
  assert.match(body, /meeting\.turma_id = p_turma_id/i);
  assert.match(body, /meeting\.disciplina_id = p_disciplina_id/i);
  assert.match(body, /count\(\*\) <> count\(distinct item ->> 'aulaId'\)/i);
  assert.match(
    body,
    /where btrim\(coalesce\(item ->> 'conteudo', ''\)\) <> ''/i,
  );
  assert.match(
    body,
    /upper\(coalesce\(v_assignment\.turma_status, ''\)\) = 'FINALIZADA'/i,
  );
  assert.match(body, /v_assignment\.bloqueio_diario.*'TOTAL'/i);
  assert.doesNotMatch(body, /p_data|p_dias|p_total_aulas|p_hora_inicio/i);
});

Deno.test("conclusão exige seções e cobertura de todas as aulas atuais", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function public.concluir_plano_curso_professor_secure(",
    "create or replace function public.listar_planos_curso_gestao_secure(",
  );
  assert.match(body, /jsonb_array_length\(v_plan\.objetivos\) = 0/i);
  assert.match(body, /jsonb_array_length\(v_plan\.criterios_avaliacao\) = 0/i);
  assert.match(body, /jsonb_array_length\(v_plan\.insumos_recursos\) = 0/i);
  assert.match(body, /from public\.aulas_turma meeting/i);
  assert.match(body, /for update of assignment/i);
  assert.match(body, /from public\.planos_curso plan[\s\S]*for update/i);
  assert.match(body, /pg_advisory_xact_lock/i);
  assert.match(
    body,
    /if not exists \([\s\S]*from public\.aulas_turma meeting/i,
  );
  assert.match(
    body,
    /not exists \([\s\S]*jsonb_array_elements\(v_plan\.conteudos_aulas\)/i,
  );
  assert.match(body, /build_plano_curso_documento_snapshot/i);
  assert.match(body, /extensions\.digest[\s\S]*'sha256'/i);
  assert.match(
    body,
    /status = 'CONCLUIDO'[\s\S]*concluido_em = v_concluido_em[\s\S]*revisao = plan\.revisao \+ 1[\s\S]*documento_snapshot = v_snapshot[\s\S]*template_revision = v_template_revision[\s\S]*documento_fingerprint = v_documento_fingerprint/i,
  );
});

Deno.test("grade é serializada e imutável após conclusão do Plano de Curso", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const guard = functionBody(
    source,
    "create or replace function internal_academic.guard_plano_curso_aula_mutation(",
    "create or replace function internal_academic.build_plano_curso_workspace(",
  );
  assert.match(guard, /pg_advisory_xact_lock/i);
  assert.match(guard, /from public\.planos_curso plan/i);
  assert.match(guard, /plan\.status = 'CONCLUIDO'/i);
  assert.match(
    source,
    /before insert or update or delete on public\.aulas_turma/i,
  );
  const save = functionBody(
    source,
    "create or replace function public.salvar_plano_curso_professor_secure(",
    "create or replace function public.concluir_plano_curso_professor_secure(",
  );
  assert.match(save, /pg_advisory_xact_lock/i);
});

Deno.test("reatribuição single ou batch não abandona Plano de Curso salvo", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const assignmentSource = await Deno.readTextFile(assignmentMigrationUrl);
  const guard = functionBody(
    source,
    "create or replace function internal_academic.guard_plano_curso_assignment_mutation(",
    "drop trigger if exists guard_plano_curso_assignment_mutation",
  );
  assert.match(guard, /security definer\s+set search_path = ''/i);
  assert.match(
    guard,
    /new\.professor_id is not distinct from old\.professor_id[\s\S]*new\.turma_id = old\.turma_id[\s\S]*new\.disciplina_id = old\.disciplina_id[\s\S]*return new/i,
  );
  assert.doesNotMatch(guard, /pg_advisory_xact_lock/i);
  assert.match(guard, /UPDATE\/DELETE já detêm o row lock/i);
  assert.match(guard, /from public\.planos_curso plan/i);
  assert.doesNotMatch(guard, /plan\.status\s*=/i);
  assert.match(
    guard,
    /não permite reatribuir ou remover o docente[\s\S]*errcode = '55000'/i,
  );
  assert.match(
    source,
    /before update or delete on public\.turmas_disciplinas[\s\S]*guard_plano_curso_assignment_mutation\(\)/i,
  );

  const batch = functionBody(
    assignmentSource,
    "create or replace function public.atribuir_docente_disciplinas_turma(",
    "create or replace function public.salvar_encontro_turma(",
  );
  assert.match(batch, /p_disciplina_ids uuid\[\]/i);
  assert.match(batch, /disciplina_id = any\(v_disciplina_ids\)/i);
  assert.match(
    batch,
    /update public\.turmas_disciplinas vinculo[\s\S]*set professor_id = v_professor_id/i,
  );
  assert.doesNotMatch(batch, /exception\s+when/i);
});

Deno.test("batch da Gestão evita N+1 e não expõe conteúdo editorial", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function public.listar_planos_curso_gestao_secure(",
    "create or replace function public.obter_plano_curso_gestao_secure(",
  );
  assert.match(body, /public\.can_operate_turma_academics\(p_turma_id\)/i);
  for (
    const key of [
      "disciplinaId",
      "professorId",
      "professorNome",
      "planoId",
      "status",
      "revisao",
      "templateRevision",
      "documentoFingerprint",
      "updatedAt",
    ]
  ) {
    assert.match(body, new RegExp(`'${key}'`, "i"));
  }
  assert.doesNotMatch(
    body,
    /objetivos|criterios_avaliacao|insumos_recursos|conteudos_aulas/i,
  );
});

Deno.test("detalhe da Gestão mantém autorização por turma e polo", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = functionBody(
    source,
    "create or replace function public.obter_plano_curso_gestao_secure(",
    "do $constraints$",
  );
  assert.match(body, /public\.can_operate_turma_academics\(p_turma_id\)/i);
  assert.match(body, /internal_academic\.build_plano_curso_workspace/i);
  assert.match(body, /p_professor_id uuid default null/i);
});

Deno.test("modelo PLANO_CURSO GERAL preserva editor versionado e idempotência", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  assert.match(source, /'plano_curso'[\s\S]*modalidade = 'GERAL'/i);
  assert.match(source, /'orientacao', 'A4_RETRATO'/i);
  assert.match(source, /'subtitulo', '\{\{CURSO\}\} · \{\{TURMA\}\}'/i);
  assert.match(source, /'exibirMarcaDagua', true/i);
  assert.match(source, /'exibirAssinaturaDocente', true/i);
  assert.match(
    source,
    /'instrucoesConteudo', 'Registre o conteúdo programático previsto para cada encontro, respeitando as datas, os horários e as aulas canônicas da grade\.'/i,
  );
  assert.match(source, /'rotulos', jsonb_build_object/i);
  assert.match(source, /'paginacao', jsonb_build_object/i);

  const save = functionBody(
    source,
    "create or replace function public.save_modelo_documento_template_secure(",
    "revoke all on function public.save_modelo_documento_template_secure",
  );
  assert.match(save, /'plano_curso'/i);
  assert.match(
    save,
    /v_template_key = 'plano_curso' and v_modality <> 'GERAL'/i,
  );
  assert.match(save, /pg_advisory_xact_lock/i);
  assert.match(save, /documentos_modelos_requisicoes/i);
  assert.match(save, /if v_template_key = 'contrato_aluno'/i);
  assert.match(save, /v_status := 'EM_REVISAO'/i);
});

Deno.test("subtítulo do modelo aceita somente CURSO e TURMA e nunca retorna marcador residual", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const save = functionBody(
    source,
    "create or replace function public.save_modelo_documento_template_secure(",
    "revoke all on function public.save_modelo_documento_template_secure",
  );
  assert.match(
    save,
    /replace\([\s\S]*'\{\{CURSO\}\}'[\s\S]*'\{\{TURMA\}\}'/i,
  );
  assert.match(save, /position\('\{\{' in v_subtitulo_residual\) > 0/i);
  assert.match(save, /position\('\}\}' in v_subtitulo_residual\) > 0/i);
  assert.match(
    save,
    /Use somente os marcadores \{\{CURSO\}\} e \{\{TURMA\}\}/i,
  );

  const snapshot = lastFunctionBody(
    source,
    "create or replace function internal_academic.build_plano_curso_documento_snapshot(",
    "revoke all on function internal_academic.build_plano_curso_documento_snapshot",
  );
  assert.match(snapshot, /v_subtitulo_resolvido := replace/i);
  assert.match(snapshot, /position\('\{\{' in v_subtitulo_resolvido\) > 0/i);
  assert.match(snapshot, /position\('\}\}' in v_subtitulo_resolvido\) > 0/i);
  assert.match(snapshot, /'subtitulo', v_subtitulo_resolvido/i);
  assert.match(
    snapshot,
    /'template', jsonb_set\([\s\S]*'\{subtitulo\}'[\s\S]*to_jsonb\(v_subtitulo_resolvido\)/i,
  );
  assert.doesNotMatch(
    snapshot,
    /'subtitulo',\s*coalesce\(nullif\(v_model\.conteudo ->> 'subtitulo'/i,
  );
});

Deno.test("payload do documento inclui identidade, marca, assinatura e páginas backend", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const body = lastFunctionBody(
    source,
    "create or replace function internal_academic.build_plano_curso_documento_snapshot(",
    "revoke all on function internal_academic.build_plano_curso_documento_snapshot",
  );
  assert.match(body, /template_key = 'plano_curso'/i);
  assert.match(body, /'cabecalho', jsonb_build_object/i);
  assert.match(body, /'instituicao', jsonb_build_object/i);
  assert.match(body, /'rotulos', jsonb_build_object/i);
  for (
    const label of [
      "curso",
      "turma",
      "componenteCurricular",
      "docente",
      "diasAulas",
      "objetivos",
      "criteriosAvaliacao",
      "insumosRecursos",
      "conteudoProgramatico",
      "assinaturaDocente",
    ]
  ) {
    assert.match(body, new RegExp(`'${label}'`, "i"));
  }
  assert.match(body, /'logoUrl', v_context\.logo_url/i);
  assert.match(body, /'marcaDagua', jsonb_build_object/i);
  assert.match(body, /'url', v_context\.watermark_url/i);
  assert.match(body, /'componente', jsonb_build_object/i);
  assert.match(body, /'docente', jsonb_build_object/i);
  assert.match(
    body,
    /'assinatura'.*'path', v_context\.assinatura_path.*'url', null/s,
  );
  assert.match(body, /'paginas', v_pages/i);
  assert.match(body, /'tipo', 'IDENTIFICACAO'/i);
  assert.match(body, /'tipo', 'CONTEUDO'/i);
  assert.match(body, /ordinality - v_first_page - 1/i);
  assert.match(body, /'emitidoEm', to_jsonb\(p_emitido_em\)/i);
  assert.match(body, /timezone\('America\/Maceio', p_emitido_em\)/i);
});

Deno.test("documento oficial é snapshot imutável criado na conclusão", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const conclude = functionBody(
    source,
    "create or replace function public.concluir_plano_curso_professor_secure(",
    "create or replace function public.listar_planos_curso_gestao_secure(",
  );
  const prepare = functionBody(
    source,
    "create or replace function public.preparar_plano_curso_documento_secure(",
    "create or replace function public.save_modelo_documento_template_secure(",
  );

  assert.match(
    conclude,
    /v_snapshot := internal_academic\.build_plano_curso_documento_snapshot/i,
  );
  assert.match(conclude, /v_concluido_em := clock_timestamp\(\)/i);
  assert.match(conclude, /documento_snapshot = v_snapshot/i);
  assert.match(conclude, /template_revision = v_template_revision/i);
  assert.match(conclude, /documento_fingerprint = v_documento_fingerprint/i);

  assert.match(prepare, /v_plan\.status <> 'CONCLUIDO'/i);
  assert.match(
    prepare,
    /Conclua o Plano de Curso antes de gerar o documento oficial/i,
  );
  assert.match(
    prepare,
    /return v_plan\.documento_snapshot \|\| jsonb_build_object/i,
  );
  assert.match(prepare, /'templateRevision', v_plan\.template_revision/i);
  assert.match(
    prepare,
    /'documentoFingerprint', v_plan\.documento_fingerprint/i,
  );
  assert.doesNotMatch(prepare, /documentos_modelos_configuracoes/i);
  assert.doesNotMatch(
    prepare,
    /clock_timestamp|\bnow\(\)|build_plano_curso_documento_snapshot/i,
  );
});

Deno.test("Broadcast privado atualiza elegibilidade do professor sem publish do cliente", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const authorize = functionBody(
    source,
    "create or replace function public.can_subscribe_plano_curso_professor_topic(",
    "revoke all on function public.can_subscribe_plano_curso_professor_topic",
  );
  const send = functionBody(
    source,
    "create or replace function internal_academic.send_plano_curso_eligibility_changed(",
    "revoke all on function internal_academic.send_plano_curso_eligibility_changed",
  );
  const assignment = functionBody(
    source,
    "create or replace function internal_academic.broadcast_plano_curso_assignment_eligibility(",
    "revoke all on function internal_academic.broadcast_plano_curso_assignment_eligibility",
  );
  const lesson = functionBody(
    source,
    "create or replace function internal_academic.broadcast_plano_curso_lesson_eligibility(",
    "revoke all on function internal_academic.broadcast_plano_curso_lesson_eligibility",
  );

  assert.match(authorize, /security definer\s+set search_path = ''/i);
  assert.match(authorize, /\^plano-curso:professor:[\s\S]*:polo:[\s\S]*\$/i);
  assert.match(
    authorize,
    /candidate\.professor_id = public\.current_professor_id\(\)/i,
  );
  assert.match(
    authorize,
    /calendar_private\.current_professor_can_access_polo\(candidate\.polo_id\)/i,
  );
  assert.match(
    source,
    /revoke all on function public\.can_subscribe_plano_curso_professor_topic\(text\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.can_subscribe_plano_curso_professor_topic\(text\)[\s\S]*to authenticated/i,
  );
  assert.match(
    source,
    /grant select on table realtime\.messages to authenticated/i,
  );
  assert.match(
    source,
    /create policy plano_curso_professor_broadcast_select[\s\S]*on realtime\.messages[\s\S]*for select[\s\S]*to authenticated[\s\S]*realtime\.topic\(\)/i,
  );
  assert.doesNotMatch(
    source,
    /create policy plano_curso_professor_broadcast_insert/i,
  );

  assert.match(send, /perform realtime\.send/i);
  assert.match(send, /'changed', true/i);
  assert.match(send, /'turmaId', p_turma_id/i);
  assert.match(send, /'disciplinaId', p_disciplina_id/i);
  assert.match(send, /'eligibility-changed'/i);
  assert.match(send, /'plano-curso:professor:'[\s\S]*':polo:'[\s\S]*true/i);
  assert.doesNotMatch(send, /professorNome|nome|email/i);

  assert.match(assignment, /old\.professor_id/i);
  assert.match(assignment, /new\.professor_id/i);
  assert.match(assignment, /send_plano_curso_eligibility_changed/i);
  assert.match(
    source,
    /after insert or update or delete on public\.turmas_disciplinas[\s\S]*broadcast_plano_curso_assignment_eligibility\(\)/i,
  );

  assert.match(
    lesson,
    /select count\(\*\)[\s\S]*from public\.aulas_turma meeting/i,
  );
  assert.match(lesson, /v_emit_old := v_count = 0/i);
  assert.match(lesson, /v_emit_new := v_count = 1/i);
  assert.match(lesson, /old\.turma_id[\s\S]*new\.turma_id/i);
  assert.match(
    source,
    /after insert or update or delete on public\.aulas_turma[\s\S]*broadcast_plano_curso_lesson_eligibility\(\)/i,
  );
});

Deno.test("RPCs têm search_path vazio, grants explícitos e Realtime não duplica eventos", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const signatures = [
    "listar_planos_curso_professor_secure",
    "obter_plano_curso_professor_secure",
    "salvar_plano_curso_professor_secure",
    "concluir_plano_curso_professor_secure",
    "listar_planos_curso_gestao_secure",
    "obter_plano_curso_gestao_secure",
    "preparar_plano_curso_documento_secure",
  ];
  for (const signature of signatures) {
    const start = source.indexOf(
      `create or replace function public.${signature}(`,
    );
    assert.ok(start >= 0, signature);
    const end = source.indexOf("$function$;", start);
    assert.match(
      source.slice(start, end),
      /security definer\s+set search_path = ''/i,
    );
    assert.match(
      source,
      new RegExp(`grant execute on function public\\.${signature}\\(`, "i"),
    );
  }
  assert.match(
    source,
    /alter publication supabase_realtime add table public\.planos_curso/i,
  );
  assert.match(source, /pg_publication_tables/i);
  assert.doesNotMatch(source, /insert into public\.gestao_realtime_events/i);
  assert.match(source, /commit;\s*$/i);
});
