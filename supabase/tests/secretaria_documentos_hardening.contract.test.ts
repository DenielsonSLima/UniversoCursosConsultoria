// @ts-nocheck -- contrato estático executado pelo Deno fora do bundle web.

const hardeningUrl = new URL(
  "../migrations/20260807052500_harden_document_models_and_emissions.sql",
  import.meta.url,
);

const baseUrl = new URL(
  "../migrations/20260807050000_create_secretaria_documentos_contrato_preceptor_calendario.sql",
  import.meta.url,
);

const [hardening, base] = await Promise.all([
  Deno.readTextFile(hardeningUrl),
  Deno.readTextFile(baseUrl),
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

Deno.test("contrato legado ativo é reaberto em revisão auditável", () => {
  assert(
    /with modelos_legados_em_revisao as[\s\S]*status = 'EM_REVISAO'[\s\S]*model\.status = 'ATIVO'/i.test(hardening),
    "modelos ativos legados precisam entrar em revisão antes da emissão",
  );
  assert(
    /insert into public\.documentos_modelos_historico[\s\S]*from modelos_legados_em_revisao/i.test(hardening),
    "a transição de legado precisa deixar histórico auditável",
  );
});

Deno.test("salvamento de contrato não cria revisão ativa sem aprovação", () => {
  const save = functionBody(
    hardening,
    "create or replace function public.save_modelo_documento_template_secure(",
  );

  assert(
    /if \(v_current\.conteudo - 'status'\) is not distinct from v_content then[\s\S]*insert into public\.documentos_modelos_requisicoes[\s\S]*return public\.get_modelo_documento_template_secure/i.test(save),
    "salvamento sem alteração material deve manter a revisão atual",
  );
  assert(
    /Toda mudança material exige uma nova aprovação explícita[\s\S]*v_status := 'EM_REVISAO'/i.test(save),
    "mudança material precisa entrar em revisão",
  );
  assert(
    !/when v_current\.status = 'ATIVO'[\s\S]*then 'ATIVO'/i.test(save),
    "save não pode preservar ATIVO por decisão do navegador",
  );
});

Deno.test("aprovação usa a própria revisão e grava um único ledger", () => {
  const approval = functionBody(
    hardening,
    "create or replace function public.aprovar_modelo_contrato_aluno_secure(",
  );

  assert(
    /if v_current\.status <> 'EM_REVISAO' then/i.test(approval),
    "somente revisão explícita pode ser aprovada",
  );
  assert(
    /status = 'ATIVO'[\s\S]*insert into public\.documentos_modelos_aprovacoes[\s\S]*v_current\.revisao/i.test(approval),
    "aprovação deve tornar ativa a mesma revisão e gravar o ledger correspondente",
  );
  assert(
    !/revisao = model\.revisao \+ 1/i.test(approval),
    "aprovação não pode criar uma revisão ativa sem conteúdo revisado",
  );
  assert(
    /v_current\.status = 'ATIVO'[\s\S]*documentos_modelos_aprovacoes[\s\S]*v_current\.revisao/i.test(approval),
    "estado ativo existente precisa comprovar sua aprovação antes de ser aceito",
  );
});

Deno.test("emissão de contrato não contorna o ledger por revisão", () => {
  const wrapper = functionBody(
    hardening,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );

  assert(
    /alter function public\.preparar_emissao_contrato_aluno_secure\(uuid, text, uuid\[\], text, uuid\)\s+rename to preparar_emissao_contrato_aluno_base_secure/i.test(hardening),
    "a implementação anterior precisa ficar privada atrás do wrapper",
  );
  assert(
    /documentos_modelos_aprovacoes[\s\S]*approval\.modalidade = v_modalidade[\s\S]*approval\.revisao = v_model\.revisao/i.test(wrapper),
    "wrapper deve exigir aprovação da modalidade e revisão emitida",
  );
  assert(
    /return public\.preparar_emissao_contrato_aluno_base_secure\(/i.test(wrapper),
    "após o gate, a emissão deve reutilizar o emissor canônico",
  );
  assert(
    /revoke all on function public\.preparar_emissao_contrato_aluno_base_secure[\s\S]*from public, anon, authenticated, service_role/i.test(hardening),
    "emissor base não pode permanecer invocável pelos clientes",
  );
  assert(
    /grant execute on function public\.preparar_emissao_contrato_aluno_secure[\s\S]*to authenticated, service_role/i.test(hardening),
    "somente o wrapper autorizado deve permanecer disponível",
  );

  const previousEmitter = functionBody(
    base,
    "create or replace function public.preparar_emissao_contrato_aluno_secure(",
  );
  assert(
    /v_model\.status <> 'ATIVO'/i.test(previousEmitter),
    "o emissor canônico preservado ainda exige estado ativo",
  );
});

Deno.test("QR e conteúdo personalizado continuam canônicos no banco", () => {
  assert(
    /O QR Code é obrigatório para contrato de aluno/i.test(hardening),
    "contrato não pode desligar QR pelo cliente",
  );
  const renderer = functionBody(
    hardening,
    "create or replace function public.renderizar_contrato_aluno_documento(",
  );
  assert(
    /Mensagem complementar:/i.test(renderer),
    "mensagem personalizada precisa integrar o render canônico do contrato",
  );
});
