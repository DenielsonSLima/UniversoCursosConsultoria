// @ts-nocheck -- contrato estático executado pelo Deno fora do bundle web.

const migrationUrl = new URL(
  "../migrations/20260812021500_add_cracha_preceptor_vertical_snapshot.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function functionBody(signature: string) {
  const start = sql.indexOf(signature);
  assert(start >= 0, `função não encontrada: ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert(end > start, `corpo não encerrado: ${signature}`);
  return sql.slice(start, end);
}

Deno.test("salvamento vertical usa allowlist de preceptor e não congela dados de aluno", () => {
  const save = functionBody(
    "create or replace function public.save_modelo_documento_template_secure(",
  );

  assert(
    save.includes("'CR80_VERTICAL_V1'"),
    "o modelo precisa exigir o layout CR80 vertical",
  );
  assert(
    save.includes("position('{{ALUNO_' in upper(v_source::text))"),
    "tokens de aluno precisam ser bloqueados sem depender de maiúsculas/minúsculas",
  );
  assert(
    /group by btrim\(item\.value ->> 'id'\)[\s\S]*identificadores únicos/i.test(save),
    "campos devem ter IDs únicos",
  );
  assert(
    /'foto' and v_field_value <> ''[\s\S]*snapshot seguro/i.test(save)
      && /'qrcode' and v_field_value <> 'QR_VALIDADOR_CRACHA'/i.test(save),
    "foto e QR devem ficar sob controle do servidor",
  );
  for (const token of [
    "PRECEPTOR_NOME",
    "PRECEPTOR_CARGO",
    "PRECEPTOR_AREA",
    "PRECEPTOR_REGISTRO",
    "POLO_NOME",
    "DATA_HOJE",
    "DATA_VALIDADE",
    "VALIDACAO_CODIGO",
  ]) {
    assert(save.includes(`{{${token}}}`), `token permitido ausente: ${token}`);
  }
  assert(
    /v_content := jsonb_build_object\([\s\S]*'fields', v_fields[\s\S]*v_content - 'status'/i.test(save),
    "o conteúdo deve ser reconstruído por allowlist e sem status controlado pelo navegador",
  );
  assert(
    save.includes("https://[^[:space:]]{1,2000}")
      && save.includes("^#[0-9A-Fa-f]{6}$"),
    "fundos HTTPS e cores hexadecimais precisam ser validados",
  );
});

Deno.test("emissão congela data nos payloads e mantém replay personalizado idempotente", () => {
  const emission = functionBody(
    "create or replace function public.preparar_emissao_carteirinha_preceptor_secure(",
  );
  const baseCall = emission.indexOf(
    "public.preparar_emissao_carteirinha_preceptor_base_secure(",
  );
  const replayGuard = emission.indexOf("Replay de resposta final");
  const documentLoop = emission.indexOf("for v_document in select value");

  assert(baseCall >= 0, "a emissão deve delegar ao emissor original endurecido");
  assert(
    !emission.includes("preceptor_vertical_base_secure"),
    "a camada nova não pode chamar o wrapper antigo que duplica mensagem em replay",
  );
  assert(
    replayGuard > baseCall && documentLoop > replayGuard,
    "o replay final precisa ser detectado antes de qualquer mutação do credential",
  );
  assert(
    /'Mensagem complementar: ' \|\| v_message[\s\S]*position\(/.test(emission)
      || /position\([\s\S]*'Mensagem complementar: ' \|\| v_message/.test(emission),
    "a mensagem personalizada precisa ser incluída uma única vez",
  );
  assert(
    emission.includes("at time zone 'UTC'")
      && emission.includes("at time zone 'America/Maceio'"),
    "a data ISO e a data exibida devem ter fusos explícitos",
  );
  assert(
    emission.includes("'{render_payload,snapshot,emissao}'")
      && emission.includes("'{render_payload,rendered,emissao}'")
      && emission.includes("'{emissao}'")
      && emission.includes("'{renderedDocument}'"),
    "snapshot e render persistidos precisam receber a emissão canônica",
  );
  assert(
    /update public\.secretaria_documentos_emissao_requisicoes request[\s\S]*set resposta = v_response/i.test(emission),
    "o ledger precisa armazenar a resposta final para o replay",
  );
});
