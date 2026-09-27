import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260927130000_harden_technical_admission_profile_and_status.sql",
  import.meta.url,
);

const source = await Deno.readTextFile(migrationUrl);

const rpcStart = source.search(
  /create or replace function public\.pre_vincular_aluno_tecnico_secure/i,
);
const searchStart = source.search(
  /create or replace function public\.search_gestao_available_students/i,
);
const rpc = source.slice(rpcStart, searchStart);
const searchRpc = source.slice(searchStart);

Deno.test("pré-vínculo define o status acadêmico somente pela fase da turma", () => {
  assert.ok(rpcStart >= 0, "RPC canônica ausente");
  assert.match(
    rpc,
    /when upper\(coalesce\(v_turma\.status, ''\)\) = 'EM_ANDAMENTO' then 'ATIVO'[\s\S]*else 'PENDENTE'/i,
  );
  assert.match(
    rpc,
    /if v_academic_status = 'ATIVO'[\s\S]*activate_started_technical_enrollment\(v_matricula\.id, false\)/i,
  );
  assert.match(
    rpc,
    /v_matricula\.status is distinct from v_academic_status[\s\S]*Status acadêmico divergente/i,
  );
  assert.doesNotMatch(
    rpc,
    /documentos_aluno|status_financeiro\s*=\s*'GERADA'|contas_receber/i,
  );
});

Deno.test("guarda server-side exige o cadastro pessoal e de endereço", () => {
  for (
    const field of [
      "v_aluno.nome",
      "v_aluno.cpf_cnpj",
      "v_aluno.nome_mae",
      "v_aluno.nome_pai",
      "v_aluno.endereco",
      "v_aluno.cep",
      "v_aluno.bairro",
      "v_aluno.cidade",
      "v_aluno.uf",
    ]
  ) {
    assert.match(rpc, new RegExp(field.replace(".", "\\."), "i"));
  }
  assert.match(rpc, /public\.is_valid_cpf\(v_aluno\.cpf_cnpj\)/i);
  assert.match(rpc, /v_aluno\.cep[\s\S]*<> 8/i);
  assert.match(rpc, /Cadastro mínimo do aluno incompleto/i);
  assert.doesNotMatch(
    rpc,
    /v_aluno\.(telefone|data_nascimento|rg)/i,
  );
});

Deno.test("Ensino Médio é informativo, não bloqueia a admissão e aceita EJA", () => {
  assert.doesNotMatch(
    rpc,
    /v_aluno\.(situacao_ensino_medio|escola_ensino_medio|serie_ensino_medio_atual|ano_previsto_conclusao_ensino_medio|ano_conclusao_ensino_medio)/i,
  );
  assert.match(
    source,
    /situacao_ensino_medio in \('CURSANDO', 'CONCLUIDO', 'EJA'\)/i,
  );
  assert.match(
    source,
    /Situação escolar informativa:[\s\S]*não bloqueia o ingresso técnico/i,
  );
});

Deno.test("RPC mantém autorização, idempotência e função privilegiada endurecida", () => {
  assert.match(rpc, /security definer[\s\S]*set search_path = ''/i);
  const authorization = rpc.indexOf(
    "Sem permissão para vincular aluno nesta turma.",
  );
  const replayLookup = rpc.indexOf("technical_financial_requests request");
  assert.ok(authorization >= 0 && replayLookup > authorization);
  assert.match(rpc, /v_existing\.actor_id is distinct from auth\.uid\(\)/i);
  assert.match(rpc, /'cobrancaGerada', false/i);
});

Deno.test("busca de candidatos expõe o perfil mínimo sem ampliar privilégios", () => {
  assert.ok(searchStart >= 0, "RPC de busca ausente");
  assert.match(searchRpc, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(
    searchRpc,
    /gestor_has_module\('gestao'\)[\s\S]*is_gestor_for_polo\(v_polo_id\)/i,
  );
  for (
    const field of [
      "nome_pai",
      "cep",
      "endereco",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "uf",
    ]
  ) {
    assert.match(searchRpc, new RegExp(`aluno\\.${field}`, "i"));
  }
  assert.match(
    searchRpc,
    /revoke execute on function public\.search_gestao_available_students[\s\S]*from public, anon/i,
  );
  assert.match(
    searchRpc,
    /grant execute on function public\.search_gestao_available_students[\s\S]*to authenticated, service_role/i,
  );
});
