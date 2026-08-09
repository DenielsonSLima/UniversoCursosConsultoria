import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809143000_freeze_student_registration_brand_snapshot.sql",
  import.meta.url,
);

Deno.test("Pasta/Ficha congelam instituição, logo e marca no primeiro snapshot", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /new\.documento not in \('pasta_identificacao', 'ficha_matricula'\)/i,
  );
  assert.match(
    source,
    /not \(new\.dados_emissao \? 'documentTemplateSnapshot'\)/i,
  );
  assert.match(
    source,
    /old\.dados_emissao[\s\S]*?\? 'documentTemplateSnapshot'/i,
  );
  assert.match(
    source,
    /'institutionSnapshot'[\s\S]*?'logoUrl', v_brand\.logo_url/i,
  );
  assert.match(
    source,
    /'watermarkSnapshot'[\s\S]*?'watermarkUrl', v_brand\.watermark_url/i,
  );
  assert.match(
    source,
    /before update of dados_emissao on public\.documentos_validacao/i,
  );
  assert.doesNotMatch(source, /update\s+public\.documentos_validacao/i);
  assert.doesNotMatch(source, /insert\s+into\s+public\.documentos_validacao/i);
  assert.match(source, /security definer\s+set search_path = ''/i);
  assert.match(source, /commit;\s*$/i);
});

Deno.test("entrypoints autenticados roteiam Pasta/Ficha e o núcleo permanece privado", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /rename to emitir_documento_validacao_portal_base/i,
  );
  assert.match(
    source,
    /replace\(v_definition, v_needle, v_replacement\)/i,
  );
  assert.match(
    source,
    /revoke all on function public\.emitir_documento_validacao_portal_base\([\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/i,
  );
  assert.match(
    source,
    /create or replace function public\.emitir_documento_validacao_portal\([\s\S]*?if v_documento in \('pasta_identificacao', 'ficha_matricula'\) then[\s\S]*?from public\.emitir_ficha_validacao_portal\(/i,
  );
  for (
    const key of [
      "documentTemplateSnapshot",
      "institutionSnapshot",
      "watermarkSnapshot",
    ]
  ) {
    assert.match(
      source,
      new RegExp(`validation\\.dados_emissao[\\s\\S]*?\\? '${key}'`, "i"),
    );
  }
  assert.match(
    source,
    /create or replace function public\.emitir_documento_validacao\([\s\S]*?from public\.emitir_documento_validacao_portal\(/i,
  );
  const legacyDefinition = source.match(
    /create or replace function public\.emitir_documento_validacao\([\s\S]*?\$function\$;/i,
  )?.[0] || "";
  assert.doesNotMatch(
    legacyDefinition,
    /emitir_documento_validacao_portal_base/i,
  );
  assert.match(
    legacyDefinition,
    /p_registrar_reemissao[\s\S]*?app\.document_reissue_authorized[\s\S]*?errcode = '22023'/i,
  );
});

Deno.test("reemissão em lote pré-bloqueia UUIDs em ordem e retorna na ordem solicitada", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const definition = source.match(
    /create or replace function public\.reemitir_fichas_validacao_lote_portal\([\s\S]*?\$function\$;/i,
  )?.[0] || "";

  assert.match(
    definition,
    /for v_lock in[\s\S]*?order by requested_id::text[\s\S]*?pg_advisory_xact_lock/i,
  );
  assert.match(
    definition,
    /for v_request in[\s\S]*?with ordinality[\s\S]*?order by request_order/i,
  );
  assert.ok(
    definition.indexOf("for v_lock in") <
      definition.indexOf("for v_request in"),
    "todos os locks devem ser adquiridos antes do loop de resposta",
  );
});
