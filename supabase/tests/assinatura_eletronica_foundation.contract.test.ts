// @ts-nocheck -- contrato estático de migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260818194445_create_assinatura_eletronica_foundation.sql",
  import.meta.url,
);
const hardeningMigrationUrl = new URL(
  "../migrations/20260818194642_harden_assinatura_eletronica_function_grants.sql",
  import.meta.url,
);
const performanceMigrationUrl = new URL(
  "../migrations/20260818195036_index_assinatura_eletronica_foreign_keys.sql",
  import.meta.url,
);
const serviceUrl = new URL(
  "../../modules/shared/assinatura-eletronica/assinatura-eletronica.service.ts",
  import.meta.url,
);
const configurationUrl = new URL(
  "../../modules/gestor/configuracoes/assinatura-eletronica/AssinaturaEletronicaConfig.tsx",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const hardeningSql = await Deno.readTextFile(hardeningMigrationUrl);
const performanceSql = await Deno.readTextFile(performanceMigrationUrl);
const service = await Deno.readTextFile(serviceUrl);
const configuration = await Deno.readTextFile(configurationUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("fundação mantém tabelas de assinatura inacessíveis diretamente ao cliente", () => {
  const tables = [
    "assinatura_eletronica_politicas",
    "assinatura_eletronica_envelopes",
    "assinatura_eletronica_participantes",
    "assinatura_eletronica_eventos",
    "assinatura_eletronica_desafios",
    "assinatura_eletronica_artefatos",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(
      sql,
      new RegExp(
        `create policy ${table}_authenticated_deny[\\s\\S]*?as restrictive for all to authenticated[\\s\\S]*?using \\(false\\)[\\s\\S]*?with check \\(false\\)`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role`, "i"),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`grant all on table public\\.${table}\\s+to service_role`, "i"),
    );
  }
});

Deno.test("artefatos usam bucket privado e caminho imutável, sem escrita do cliente", () => {
  assert.match(
    sql,
    /insert into storage\.buckets[\s\S]*?'documentos-assinatura-eletronica'[\s\S]*?false[\s\S]*?52428800[\s\S]*?application\/pdf/i,
  );
  assert.match(
    sql,
    /storage_path like 'envelopes\/%'/i,
  );
  assert.match(
    sql,
    /assinatura_eletronica_storage_client_deny[\s\S]*?as restrictive for all to anon, authenticated[\s\S]*?bucket_id <> 'documentos-assinatura-eletronica'/i,
  );
  assert.match(
    sql,
    /on conflict \(id\) do update[\s\S]*?public = false[\s\S]*?file_size_limit = excluded\.file_size_limit[\s\S]*?allowed_mime_types = excluded\.allowed_mime_types/i,
  );
  assert.match(
    sql,
    /create trigger assinatura_eletronica_artefatos_no_update[\s\S]*?before update or delete[\s\S]*?assinatura_eletronica_artefatos_append_only/i,
  );
});

Deno.test("modelo global não habilita documentos e servidor controla a política", () => {
  const saveConfiguration = functionBlock(
    "public.assinatura_eletronica_salvar_configuracao(",
  );

  assert.match(
    sql,
    /assinatura_eletronica_politicas_modelo_padrao_disabled[\s\S]*?habilitada is false/i,
  );
  assert.match(
    sql,
    /assinatura_eletronica_politicas_documentos_bloqueados_na_fundacao[\s\S]*?habilitada is false[\s\S]*?status_juridico = 'PENDENTE_MATRIZ_JURIDICA'/i,
  );
  assert.match(saveConfiguration, /if v_documento <> 'MODELO_PADRAO' then[\s\S]*?bloqueadas nesta fundação/i);
  assert.match(saveConfiguration, /if p_polo_id is not null then[\s\S]*?MODELO_PADRAO é uma configuração global/i);
  assert.match(saveConfiguration, /v_habilitada := false/i);
  assert.match(saveConfiguration, /v_status_juridico := 'PENDENTE_MATRIZ_JURIDICA'/i);
  assert.match(saveConfiguration, /jsonb_object_keys\(p_configuracao\)[\s\S]*?'name'[\s\S]*?'versionLabel'[\s\S]*?'confirmationMessage'[\s\S]*?'receiptTitle'[\s\S]*?'receiptMessage'/i);
  assert.doesNotMatch(saveConfiguration, /'enabled'/i);
  assert.match(
    sql,
    /insert into public\.assinatura_eletronica_politicas[\s\S]*?'MODELO_PADRAO'[\s\S]*?false[\s\S]*?'PENDENTE_MATRIZ_JURIDICA'/i,
  );
});

Deno.test("MODELO_PADRAO usa os textos canônicos do comprovante sem habilitar assinatura", () => {
  assert.match(
    sql,
    /'receiptTitle', 'Comprovante de Assinatura Eletrônica'[\s\S]*?'receiptMessage', 'A autenticidade deve ser conferida pelo QR Code ou pela URL de validação\.'/i,
  );
  assert.match(
    sql,
    /"receiptTitle":"Comprovante de Assinatura Eletrônica","receiptMessage":"A autenticidade deve ser conferida pelo QR Code ou pela URL de validação\."/i,
  );
  assert.match(
    sql,
    /'MODELO_PADRAO',[\s\S]*?false,[\s\S]*?'PENDENTE_MATRIZ_JURIDICA'/i,
  );
});

Deno.test("assinatura conclusiva e responsável legal permanecem bloqueados na fundação", () => {
  const envelopeProtection = functionBlock(
    "public.assinatura_eletronica_proteger_envelope()",
  );
  const participantProtection = functionBlock(
    "public.assinatura_eletronica_proteger_participante()",
  );

  assert.match(envelopeProtection, /if new\.status = 'ASSINADO' then[\s\S]*?bloqueada nesta fundação/i);
  assert.match(participantProtection, /if new\.status = 'ASSINADO' then[\s\S]*?bloqueada nesta fundação/i);
  assert.match(
    sql,
    /assinatura_eletronica_participantes_responsavel_pending_safe[\s\S]*?papel <> 'RESPONSAVEL_LEGAL'[\s\S]*?auth_user_id is null[\s\S]*?vinculo_verificado_em is null[\s\S]*?status = 'AGUARDANDO_VINCULO'/i,
  );
  assert.match(
    sql,
    /create trigger assinatura_eletronica_participantes_validate_before_write[\s\S]*?before insert or update[\s\S]*?assinatura_eletronica_validar_participante_fundacao/i,
  );
  assert.doesNotMatch(
    sql,
    /create(?:\s+or\s+replace)?\s+function\s+public\.assinatura_eletronica_assinar/i,
  );
});

Deno.test("fundação valida encadeamento de política, envelope, eventos e desafios", () => {
  const envelopeLinks = functionBlock(
    "public.assinatura_eletronica_validar_vinculos_envelope()",
  );
  const envelopeProtection = functionBlock(
    "public.assinatura_eletronica_proteger_envelope()",
  );
  const eventValidation = functionBlock(
    "public.assinatura_eletronica_validar_evento()",
  );
  const challengeValidation = functionBlock(
    "public.assinatura_eletronica_validar_desafio()",
  );

  assert.match(envelopeLinks, /where politica\.id = new\.politica_id/i);
  assert.match(
    envelopeLinks,
    /new\.company_id is distinct from v_politica\.company_id[\s\S]*?new\.polo_id is distinct from v_politica\.polo_id[\s\S]*?new\.documento is distinct from v_politica\.documento[\s\S]*?new\.politica_versao is distinct from v_politica\.versao/i,
  );
  assert.match(
    envelopeLinks,
    /new\.politica_snapshot is distinct from v_politica\.politica[\s\S]*?new\.certificado_snapshot is distinct from v_politica\.certificado/i,
  );
  assert.match(
    envelopeLinks,
    /if v_politica\.documento <> 'MODELO_PADRAO'[\s\S]*?políticas por documento não podem gerar envelopes nesta fundação/i,
  );
  assert.match(envelopeLinks, /new\.substitui_envelope_id = new\.id/i);
  assert.match(
    envelopeLinks,
    /new\.company_id is distinct from v_envelope_substituido\.company_id[\s\S]*?new\.polo_id is distinct from v_envelope_substituido\.polo_id[\s\S]*?new\.documento is distinct from v_envelope_substituido\.documento[\s\S]*?new\.matricula_id is distinct from v_envelope_substituido\.matricula_id[\s\S]*?new\.aluno_id is distinct from v_envelope_substituido\.aluno_id/i,
  );
  assert.match(
    envelopeProtection,
    /if old\.status = 'CANCELADO'[\s\S]*?new\.cancelado_em is distinct from old\.cancelado_em[\s\S]*?new\.cancelado_por is distinct from old\.cancelado_por[\s\S]*?new\.motivo_status is distinct from old\.motivo_status/i,
  );

  assert.match(
    eventValidation,
    /participante\.id = new\.participante_id[\s\S]*?participante\.envelope_id = new\.envelope_id/i,
  );
  assert.match(eventValidation, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(eventValidation, /new\.sequencia <> 1 or new\.hash_anterior is not null/i);
  assert.match(
    eventValidation,
    /new\.sequencia <> v_ultima_sequencia \+ 1[\s\S]*?new\.hash_anterior is distinct from v_ultimo_hash/i,
  );
  assert.match(
    sql,
    /create trigger assinatura_eletronica_eventos_validate_before_insert[\s\S]*?before insert[\s\S]*?assinatura_eletronica_validar_evento/i,
  );

  assert.match(
    challengeValidation,
    /participante\.id = new\.participante_id[\s\S]*?participante\.envelope_id = new\.envelope_id/i,
  );
  assert.match(
    sql,
    /create trigger assinatura_eletronica_desafios_validate_before_write[\s\S]*?before insert or update[\s\S]*?assinatura_eletronica_validar_desafio/i,
  );
});

Deno.test("RPCs expõem somente uma fronteira autorizada e a caixa é decidida no banco", () => {
  const publicRpcs = [
    "assinatura_eletronica_obter_configuracao(uuid, text)",
    "assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)",
    "assinatura_eletronica_listar_caixa(text, uuid, integer, timestamptz)",
  ];
  for (const signature of publicRpcs) {
    const name = signature.slice(0, signature.indexOf("("));
    assert.match(
      sql,
      new RegExp(`create or replace function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$")}`.replace("\\$", "\\(").replace("\\$", "\\)"), "i"),
    );
    assert.match(
      hardeningSql,
      new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$")}`.replace("\\$", "\\(").replace("\\$", "\\)"), "i"),
    );
  }

  const internalFunctions = [
    "assinatura_eletronica_touch_updated_at()",
    "assinatura_eletronica_validar_escopo_politica()",
    "assinatura_eletronica_validar_escopo_envelope()",
    "assinatura_eletronica_validar_vinculos_envelope()",
    "assinatura_eletronica_validar_artefato()",
    "assinatura_eletronica_proteger_envelope()",
    "assinatura_eletronica_proteger_participante()",
    "assinatura_eletronica_validar_participante_fundacao()",
    "assinatura_eletronica_validar_evento()",
    "assinatura_eletronica_validar_desafio()",
    "assinatura_eletronica_eventos_append_only()",
    "assinatura_eletronica_artefatos_append_only()",
    "assinatura_eletronica_autoriza_configuracao(uuid)",
    "assinatura_eletronica_status_juridico_label(text)",
    "assinatura_eletronica_apresentar_configuracao(public.assinatura_eletronica_politicas)",
  ];
  for (const signature of internalFunctions) {
    assert.match(
      hardeningSql,
      new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$")}[\\s\\S]*?from service_role`.replace("\\$", "\\(").replace("\\$", "\\)"), "i"),
    );
  }

  const inbox = functionBlock("public.assinatura_eletronica_listar_caixa(");
  assert.doesNotMatch(sql, /auth\.role\(\)/i);
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'role'/i);
  assert.match(inbox, /auth\.uid\(\) is null[\s\S]*?Autenticação obrigatória/i);
  assert.match(inbox, /participante_interno\.auth_user_id = auth\.uid\(\)/i);
  assert.match(inbox, /public\.can_manage_secretaria_document\(envelope\.documento, envelope\.polo_id\)/i);
  assert.match(inbox, /v_status not in \('PENDENTES', 'ASSINADOS', 'TODOS'\)/i);
  assert.match(inbox, /false,[\s\S]*?Assinatura conclusiva indisponível/i);
  assert.match(inbox, /caixa\.participante_id is not null\s+or caixa\.pode_gerir/i);
  assert.equal(
    (inbox.match(/public\.can_manage_secretaria_document\(envelope\.documento, envelope\.polo_id\)/gi) ?? []).length,
    1,
    "A decisão de gestão deve ser calculada uma vez e reutilizada pela caixa.",
  );
});

Deno.test("adaptador do frontend só chama RPCs e falha diante de ação desconhecida", () => {
  assert.match(service, /supabase\.rpc\(name, args\)/i);
  assert.doesNotMatch(service, /\.from\(['"]assinatura_eletronica_/i);
  assert.match(service, /assinatura_eletronica_obter_configuracao/i);
  assert.match(service, /assinatura_eletronica_salvar_configuracao/i);
  assert.match(service, /assinatura_eletronica_listar_caixa/i);
  assert.match(service, /A ação da assinatura não foi reconhecida pelo cliente/i);
  assert.match(service, /Os campos do comprovante não foram informados pelo serviço autorizado/i);
  assert.match(service, /receiptFields\.length !== RECEIPT_FIELD_IDS\.length/i);
  assert.match(service, /field\.id !== RECEIPT_FIELD_IDS\[index\]/i);
  assert.doesNotMatch(service, /audience:\s*params\.audience/i);
});

Deno.test("salvamento da apresentação preserva uma chave de idempotência no retry", () => {
  assert.match(
    configuration,
    /\[saveRequestId, setSaveRequestId\]\s*=\s*useState\(\(\) => crypto\.randomUUID\(\)\)/i,
  );
  assert.match(
    configuration,
    /mutationFn:\s*\(\{ draft: nextDraft, expectedVersion, requestId \}: PresentationSaveInput\)[\s\S]*?expectedVersion,[\s\S]*?requestId,/i,
  );
  assert.match(
    configuration,
    /mutate\(\{[\s\S]*?draft: currentDraft,[\s\S]*?expectedVersion: presentation\.version,[\s\S]*?requestId: saveRequestId,[\s\S]*?\}\)/i,
  );
  assert.match(configuration, /onSuccess:[\s\S]*?setSaveRequestId\(crypto\.randomUUID\(\)\)/i);
  assert.match(configuration, /if \(!currentDraft \|\| saveDraftMutation\.isPending\) return/i);
  assert.match(configuration, /setDraft\(next\);\s*setSaveRequestId\(crypto\.randomUUID\(\)\)/i);
  assert.match(configuration, /disabled=\{!isDirty \|\| disabled\}/i);
  assert.match(configuration, /Salvar nova versão/i);
});

Deno.test("chaves estrangeiras operacionais têm índices sem duplicar constraints únicas", () => {
  const expectedIndexes = [
    ["assinatura_eletronica_desafios_envelope_idx", "assinatura_eletronica_desafios", "envelope_id"],
    ["assinatura_eletronica_envelopes_cancelado_por_idx", "assinatura_eletronica_envelopes", "cancelado_por"],
    ["assinatura_eletronica_envelopes_company_id_idx", "assinatura_eletronica_envelopes", "company_id"],
    ["assinatura_eletronica_envelopes_criado_por_idx", "assinatura_eletronica_envelopes", "criado_por"],
    ["assinatura_eletronica_envelopes_politica_id_idx", "assinatura_eletronica_envelopes", "politica_id"],
    ["assinatura_eletronica_envelopes_substitui_envelope_id_idx", "assinatura_eletronica_envelopes", "substitui_envelope_id"],
    ["assinatura_eletronica_eventos_ator_auth_user_id_idx", "assinatura_eletronica_eventos", "ator_auth_user_id"],
    ["assinatura_eletronica_eventos_participante_id_idx", "assinatura_eletronica_eventos", "participante_id"],
    ["assinatura_eletronica_participantes_parceiro_id_idx", "assinatura_eletronica_participantes", "parceiro_id"],
    ["assinatura_eletronica_politicas_arquivada_por_idx", "assinatura_eletronica_politicas", "arquivada_por"],
    ["assinatura_eletronica_politicas_atualizada_por_idx", "assinatura_eletronica_politicas", "atualizada_por"],
    ["assinatura_eletronica_politicas_criada_por_idx", "assinatura_eletronica_politicas", "criada_por"],
  ];
  for (const [indexName, tableName, columnName] of expectedIndexes) {
    assert.match(
      performanceSql,
      new RegExp(`create index ${indexName}\\s+on public\\.${tableName} \\(\\s*${columnName}\\s*\\)`, "i"),
    );
  }
  assert.match(performanceSql, /drop index public\.assinatura_eletronica_eventos_envelope_sequence_idx/i);
  assert.match(performanceSql, /drop index public\.assinatura_eletronica_artefatos_envelope_idx/i);
});
