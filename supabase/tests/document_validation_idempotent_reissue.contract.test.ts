// @ts-nocheck -- contrato executado pelo Deno, fora do runtime da aplicação.

const migrationUrl = new URL(
  "../migrations/20260728073445_idempotent_document_reissue.sql",
  import.meta.url,
);
const hookUrl = new URL(
  "../../modules/shared/document-validation/use-document-validation-code.ts",
  import.meta.url,
);
const serviceUrl = new URL(
  "../../modules/shared/document-validation/document-validation.service.ts",
  import.meta.url,
);
const studentIrpfUrl = new URL(
  "../../modules/aluno/secretaria/SecretariaPage.tsx",
  import.meta.url,
);
const managedIrpfUrl = new URL(
  "../../modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoSecretaria.tsx",
  import.meta.url,
);
const historyUrl = new URL(
  "../../modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx",
  import.meta.url,
);
const secretariaDocumentsUrl = new URL(
  "../../modules/gestor/secretaria/shared/secretaria-documentos.service.ts",
  import.meta.url,
);
const whatsappIrpfUrl = new URL(
  "../functions/_shared/whatsapp-flow/irpf.ts",
  import.meta.url,
);
const whatsappEngineUrl = new URL(
  "../functions/_shared/whatsapp-flow/engine.ts",
  import.meta.url,
);

const [
  sql,
  hook,
  service,
  studentIrpf,
  managedIrpf,
  history,
  secretariaDocuments,
  whatsappIrpf,
  whatsappEngine,
] =
  await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(hookUrl),
    Deno.readTextFile(serviceUrl),
    Deno.readTextFile(studentIrpfUrl),
    Deno.readTextFile(managedIrpfUrl),
    Deno.readTextFile(historyUrl),
    Deno.readTextFile(secretariaDocumentsUrl),
    Deno.readTextFile(whatsappIrpfUrl),
    Deno.readTextFile(whatsappEngineUrl),
  ]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  assert(pattern.test(value), message);
}

Deno.test("leitura TanStack nunca registra reemissão", () => {
  const readStart = hook.indexOf("export const useDocumentValidationCode");
  const mutationStart = hook.indexOf(
    "export const useDocumentValidationReissue",
  );
  const readHook = hook.slice(readStart, mutationStart);

  assertMatch(
    readHook,
    /queryFn:\s*\(\)\s*=>\s*documentValidationService\.issue\(asReadOnlyIssue\(input!\)\)/,
    "queryFn precisa remover flags mutáveis antes de consultar",
  );
  assert(
    !/input\?\.registerReissue/.test(readHook),
    "registerReissue não pode participar da query key/dependências",
  );
  assertMatch(
    hook,
    /useMutation\([\s\S]*idempotencyKey[\s\S]*retry:\s*1/,
    "reemissão deve ser mutation com a mesma chave durante retry",
  );
  assertMatch(
    hook,
    /const issued = await mutation\.mutateAsync[\s\S]*pendingRequest\.current = null/,
    "falha ambígua deve preservar a chave para retry manual",
  );
});

Deno.test("serviço rejeita atalho ambíguo e exige reemissão explícita", () => {
  assertMatch(
    service,
    /if \(input\.registerReissue\)[\s\S]*Use documentValidationService\.reissue com chave de idempotência explícita/,
    "atalho effectful de issue deve falhar e orientar contrato explícito",
  );
  assertMatch(
    service,
    /'reemitir_documento_validacao_portal'[\s\S]*p_idempotency_key:\s*input\.idempotencyKey/,
    "RPC individual deve receber chave explícita",
  );
  assertMatch(
    service,
    /'reemitir_fichas_validacao_lote_portal'[\s\S]*p_idempotency_key:/,
    "lote cadastral deve usar endpoint idempotente transacional",
  );
  assertMatch(
    service,
    /'emitir_documento_validacao_portal'[\s\S]*p_registrar_reemissao:\s*false/,
    "emissão consultiva não deve incrementar contador",
  );
});

Deno.test("RPCs legadas não conseguem incrementar fora do ledger idempotente", async () => {
  const coreStart = sql.indexOf(
    "create or replace function public.emitir_documento_validacao_interno(",
  );
  const coreEnd = sql.indexOf("$function$;", coreStart);
  const core = sql.slice(coreStart, coreEnd);
  const coreGate = core.indexOf(
    "current_setting('app.document_reissue_authorized', true)",
  );
  const operationTimestamp = core.indexOf(
    "current_setting('app.document_reissue_at', true)",
  );
  const firstCanonicalMutation = core.indexOf(
    "insert into public.documentos_validacao (",
  );

  assert(
    coreGate > 0 &&
      coreGate < operationTimestamp &&
      coreGate < firstCanonicalMutation,
    "núcleo deve bloquear reemissão antes de aceitar timestamp ou mutar o registro",
  );
  assertMatch(
    core.slice(0, operationTimestamp),
    /if p_registrar_reemissao[\s\S]*Reemissão exige a RPC idempotente com chave explícita/,
    "flag legada true precisa falhar sem autorização transacional interna",
  );

  const legacyStart = sql.indexOf(
    "create or replace function public.emitir_documento_validacao_portal(",
  );
  const legacyEnd = sql.indexOf("$function$;", legacyStart);
  const legacy = sql.slice(legacyStart, legacyEnd);
  assertMatch(
    legacy,
    /if p_registrar_reemissao[\s\S]*current_setting\('app\.document_reissue_authorized', true\)[\s\S]*raise exception/,
    "wrapper legado também precisa falhar antes de encaminhar true",
  );

  const baseStart = sql.indexOf(
    "create or replace function public.emitir_documento_validacao(",
  );
  const baseEnd = sql.indexOf("$function$;", baseStart);
  const base = sql.slice(baseStart, baseEnd);
  assertMatch(
    base,
    /if p_registrar_reemissao[\s\S]*current_setting\('app\.document_reissue_authorized', true\)[\s\S]*raise exception/,
    "assinatura histórica sem sufixo também precisa bloquear true",
  );
  assertMatch(
    base,
    /from public\.emitir_documento_validacao_portal\(/,
    "assinatura histórica deve convergir no portal protegido",
  );

  const registrationMigration = await Deno.readTextFile(
    new URL(
      "../migrations/20260725233925_atomic_batch_and_canonical_registration_issuer.sql",
      import.meta.url,
    ),
  );
  const fichaStart = registrationMigration.indexOf(
    "create or replace function public.emitir_ficha_validacao_portal(",
  );
  const fichaEnd = registrationMigration.indexOf("$function$;", fichaStart);
  const ficha = registrationMigration.slice(fichaStart, fichaEnd);
  assertMatch(
    ficha,
    /from public\.emitir_documento_validacao_portal\([\s\S]*p_registrar_reemissao/,
    "ficha precisa convergir no portal protegido, sem chamar o núcleo",
  );
  assert(
    !/emitir_documento_validacao_interno/.test(ficha),
    "ficha não pode contornar o portal protegido",
  );

  const batchStart = registrationMigration.indexOf(
    "create or replace function public.emitir_fichas_validacao_lote_portal(",
  );
  const batchEnd = registrationMigration.indexOf("$function$;", batchStart);
  const batch = registrationMigration.slice(batchStart, batchEnd);
  assertMatch(
    batch,
    /from public\.emitir_ficha_validacao_portal\([\s\S]*p_registrar_reemissao/,
    "lote legado precisa convergir na ficha e, dela, no portal protegido",
  );
  assert(
    !/emitir_documento_validacao_interno/.test(batch),
    "lote legado não pode contornar o portal protegido",
  );

  const prepareStart = sql.indexOf(
    "create or replace function public.preparar_reemissao_documento_validacao_portal(",
  );
  const prepareEnd = sql.indexOf("$function$;", prepareStart);
  const prepare = sql.slice(prepareStart, prepareEnd);
  assert(
    !/set_config\(\s*'app\.document_reissue_authorized'/.test(prepare),
    "preparação não pode autorizar incremento canônico",
  );

  const confirmStart = sql.indexOf(
    "create or replace function public.reemitir_documento_validacao_portal(",
  );
  const confirmEnd = sql.indexOf("$function$;", confirmStart);
  const confirm = sql.slice(confirmStart, confirmEnd);
  const confirmedRetry = confirm.indexOf(
    "if v_stored.estado = 'CONFIRMADA' then",
  );
  const authorization = confirm.indexOf(
    "set_config('app.document_reissue_authorized', 'on', true)",
  );
  const issuerCall = confirm.indexOf(
    "from public.emitir_documento_validacao_interno(",
  );
  assert(
    confirmedRetry > 0 &&
      authorization > confirmedRetry &&
      issuerCall > authorization,
    "somente o confirmador, após resolver retry/ledger, pode abrir o gate do núcleo",
  );

  const authorizationSetters = [
    ...sql.matchAll(
      /set_config\(\s*'app\.document_reissue_authorized'\s*,\s*'on'\s*,\s*true\s*\)/g,
    ),
  ];
  assert(
    authorizationSetters.length === 1,
    `gate interno possui ${authorizationSetters.length} setters; esperado exatamente um`,
  );
});

Deno.test("portal atual não recursa pela implementação P1 arquivada e preserva gates do aluno", () => {
  const portalStart = sql.indexOf(
    "create or replace function public.emitir_documento_validacao_portal(",
  );
  const portalEnd = sql.indexOf("$function$;", portalStart);
  const portal = sql.slice(portalStart, portalEnd);

  assert(
    !/p1_emitir_documento_validacao_portal_20260719/.test(portal),
    "portal não pode chamar a versão P1 que retorna à assinatura pública e cria recursão",
  );
  assertMatch(
    portal,
    /from public\.emitir_documento_validacao_interno\(/,
    "portal deve convergir diretamente no núcleo protegido",
  );
  assertMatch(
    portal,
    /v_documento not in \([\s\S]*'carteirinha'[\s\S]*'cracha_estagio'[\s\S]*'declaracao_matricula'[\s\S]*'declaracao_irpf'/,
    "autoatendimento do aluno precisa manter allowlist fechada",
  );
  assertMatch(
    portal,
    /Carteirinha e crachá exigem matrícula técnica ativa em turma em andamento/,
    "documentos de identidade estudantil precisam validar vínculo técnico ativo",
  );
  assertMatch(
    portal,
    /Certificados são emitidos somente pela fila da Secretaria/,
    "primeira emissão de certificado não pode atravessar o portal genérico",
  );
});

Deno.test("ledger privado serializa a chave e devolve retry sem novo incremento", () => {
  assertMatch(
    sql,
    /create table if not exists\s+public\.documentos_validacao_reemissoes_idempotencia/,
    "ledger idempotente ausente",
  );
  assertMatch(
    sql,
    /enable row level security[\s\S]*revoke all on table public\.documentos_validacao_reemissoes_idempotencia\s+from public, anon, authenticated, service_role/,
    "ledger deve ser invisível a clientes e service_role direto",
  );
  assertMatch(
    sql,
    /pg_advisory_xact_lock\([\s\S]*hashtextextended\('document-reissue:' \|\| v_key/,
    "requisições concorrentes da mesma chave precisam ser serializadas",
  );
  const rpcStart = sql.indexOf(
    "public.reemitir_documento_validacao_portal(",
  );
  const storedStart = sql.indexOf(
    "if v_stored.estado = 'CONFIRMADA' then",
    rpcStart,
  );
  const firstIssue = sql.indexOf(
    "from public.emitir_documento_validacao_interno(",
    rpcStart,
  );
  assert(
    storedStart > 0 && storedStart < firstIssue,
    "retry deve retornar do ledger antes de chamar o emissor interno",
  );
  assertMatch(
    sql.slice(storedStart, firstIssue),
    /codigo := v_stored\.codigo[\s\S]*return next;\s*return;/,
    "chave já confirmada deve retornar o resultado armazenado",
  );
  assertMatch(
    sql.slice(storedStart, firstIssue),
    /not exists \([\s\S]*public\.documentos_validacao[\s\S]*status <> 'REVOGADO'/,
    "retry confirmado deve consultar o estado canônico e falhar após revogação",
  );

  const prepareStart = sql.indexOf(
    "create or replace function public.preparar_reemissao_documento_validacao_portal(",
  );
  const prepareEnd = sql.indexOf("$function$;", prepareStart);
  const prepare = sql.slice(prepareStart, prepareEnd);
  const confirmedPrepareRetry = prepare.indexOf(
    "if found and v_stored.estado = 'CONFIRMADA' then",
  );
  const preparedRetry = prepare.indexOf(
    "if found and v_stored.estado = 'PREPARADA' then",
  );
  const ledgerInsert = prepare.indexOf(
    "insert into public.documentos_validacao_reemissoes_idempotencia (",
  );
  assert(
    preparedRetry > 0 && preparedRetry < ledgerInsert,
    "retry de PREPARADA deve devolver o mesmo planejamento antes de sobrescrever o ledger",
  );
  assertMatch(
    prepare.slice(confirmedPrepareRetry, preparedRetry),
    /not exists \([\s\S]*public\.documentos_validacao[\s\S]*status <> 'REVOGADO'/,
    "preparação de retry confirmado deve falhar fechado após revogação",
  );
});

Deno.test("reemissão é coerente com uma única versão de policy", () => {
  const coreStart = sql.indexOf(
    "public.emitir_documento_validacao_interno(",
  );
  const coreEnd = sql.indexOf("$function$;", coreStart);
  const core = sql.slice(coreStart, coreEnd);

  assertMatch(
    core,
    /from public\.documentos_validacao_politicas policy[\s\S]*for share;/,
    "emissão precisa bloquear em SHARE a mesma policy editada com FOR UPDATE",
  );
  assertMatch(
    core,
    /v_prefixo := v_politica\.prefixo[\s\S]*v_politica\.validade_dias/,
    "prefixo e validade precisam vir da linha bloqueada",
  );
  assert(
    !/drop trigger[\s\S]*trg_aplicar_validade_turma_carteirinha/.test(sql),
    "migration não pode remover a validade especial da carteirinha",
  );
  assertMatch(
    sql,
    /returns table \([\s\S]*politica_versao integer,\s*validacao_publica boolean[\s\S]*validacao_publica := v_policy\.validacao_publica/,
    "preparação precisa antecipar a flag pública da mesma policy confirmada",
  );
});

Deno.test("segunda via preserva snapshot capturado e lote deriva chave da matrícula", () => {
  const coreStart = sql.indexOf(
    "create or replace function public.emitir_documento_validacao_interno(",
  );
  const coreEnd = sql.indexOf("$function$;", coreStart);
  const core = sql.slice(coreStart, coreEnd);
  assertMatch(
    core,
    /when p_registrar_reemissao then\s+documentos_validacao\.dados_emissao\s+\|\| jsonb_build_object/,
    "reemissão não pode trocar dados acadêmicos depois da captura da segunda via",
  );
  assertMatch(
    sql,
    /create or replace function public\.preservar_snapshot_documento_reemitido\(\)[\s\S]*new\.quantidade_emissoes = old\.quantidade_emissoes[\s\S]*new\.dados_emissao := old\.dados_emissao[\s\S]*create trigger trg_zy_preservar_snapshot_documento_reemitido/,
    "update auxiliar da ficha precisa preservar o snapshot já reemitido",
  );
  assertMatch(
    sql,
    /v_key \|\| ':' \|\| v_request\.requested_id::text/,
    "chave filha do lote deve depender da matrícula, não da posição recebida",
  );
  assert(
    !/v_key \|\| ':' \|\| v_request\.request_order::text/.test(sql),
    "reordenação do array não pode reassociar uma chave a outra matrícula",
  );
  assertMatch(
    secretariaDocuments,
    /idempotencyKey:\s*`\$\{input\.idempotencyKey\}:\$\{matricula\.id\}`/,
    "o lote genérico também deve derivar a chave estável da matrícula",
  );
  assert(
    !/idempotencyKey:\s*`\$\{input\.idempotencyKey\}:\$\{index \+ 1\}`/.test(
      secretariaDocuments,
    ),
    "o lote genérico não pode derivar identidade idempotente da posição",
  );
});

Deno.test("revogado falha fechado e expirado só renova por ação explícita", () => {
  const coreStart = sql.indexOf(
    "public.emitir_documento_validacao_interno(",
  );
  const coreEnd = sql.indexOf("$function$;", coreStart);
  const core = sql.slice(coreStart, coreEnd);

  assertMatch(
    core,
    /if status = 'REVOGADO'[\s\S]*Documento revogado não pode ser reutilizado ou reemitido/,
    "leitura não pode devolver código revogado",
  );
  assertMatch(
    core,
    /if validade_ate is not null and validade_ate < now\(\)[\s\S]*reemissão administrativa explícita/,
    "leitura de expirado deve falhar sem renovar silenciosamente",
  );
  assertMatch(
    core,
    /if found and v_status_existente = 'REVOGADO'[\s\S]*raise exception/,
    "ação explícita também deve bloquear revogado",
  );
  assertMatch(
    core,
    /validade_ate = case\s+when p_registrar_reemissao then excluded\.validade_ate\s+else documentos_validacao\.validade_ate/,
    "somente reemissão explícita deve renovar a validade comum",
  );
  assertMatch(
    core,
    /quantidade_emissoes = documentos_validacao\.quantidade_emissoes\s*\+ case when p_registrar_reemissao then 1 else 0 end/,
    "contador deve crescer somente na ação explícita",
  );
});

Deno.test("IRPF consulta na query e registra somente na ação do gestor", () => {
  const studentIrpfLine = studentIrpf.match(
    /const irpfValidation = useDocumentValidationCode\([^;]+;/,
  )?.[0] || "";
  assert(
    !/registerReissue/.test(studentIrpfLine),
    "portal do aluno não pode registrar reemissão ao abrir/refazer query",
  );

  assertMatch(
    managedIrpf,
    /useDocumentValidationReissue\(irpfValidationInput\)/,
    "workspace gerenciado precisa declarar mutation de reemissão",
  );
  assertMatch(
    managedIrpf,
    /const printRegisteredIrpf = async[\s\S]*await irpfReissue\.reissue\(\)[\s\S]*window\.print\(\)/,
    "IRPF gerenciado deve registrar por ação antes de imprimir",
  );
});

Deno.test("IRPF do WhatsApp usa a RPC idempotente com chave estável", () => {
  assertMatch(
    whatsappIrpf,
    /admin\.rpc\("reemitir_documento_validacao_portal"[\s\S]*p_idempotency_key:\s*idempotencyKey/,
    "WhatsApp precisa registrar a ação pela RPC idempotente",
  );
  assert(
    !/emitir_documento_validacao(?:_portal)?[\s\S]*p_registrar_reemissao:\s*true/.test(
      whatsappIrpf,
    ),
    "WhatsApp não pode reutilizar o atalho legado de reemissão",
  );
  assertMatch(
    whatsappEngine,
    /const requestKey = String\(session\?\.data\?\.irpfRequestKey[\s\S]*const idempotencyKey = \[[\s\S]*"whatsapp-irpf"[\s\S]*requestKey[\s\S]*option\.matriculaId[\s\S]*option\.year[\s\S]*\]\.join\(":"\)/,
    "retry do mesmo envio precisa reconstruir a chave da ação persistida",
  );
  assertMatch(
    whatsappEngine,
    /issueIrpfDocument\(admin, option, idempotencyKey\)/,
    "engine precisa encaminhar a chave estável ao emissor",
  );
  assertMatch(
    whatsappEngine,
    /const irpfRequestKey = createIrpfRequestKey\(\)[\s\S]*status: "choosing_irpf_year"[\s\S]*irpfRequestKey/,
    "a escolha de ano precisa persistir um nonce novo por oferta",
  );
  assertMatch(
    whatsappEngine,
    /result\.options\.length === 1[\s\S]*status: "choosing_irpf_year"[\s\S]*irpfRequestKey[\s\S]*irpfPendingOption/,
    "a oferta de ano único também precisa persistir a ação antes da emissão",
  );
  assertMatch(
    whatsappEngine,
    /if \(session\.status === "choosing_irpf_year"\)[\s\S]*irpfPendingOption[\s\S]*sendIrpf/,
    "falha ambígua de ano único deve poder repetir com o mesmo nonce",
  );
  assert(
    !/status: "issuing_irpf"/.test(whatsappEngine),
    "o fluxo não pode gravar um status ausente do check constraint",
  );
  assertMatch(
    whatsappIrpf,
    /Deno\.env\.get\("PUBLIC_SITE_URL"\)/,
    "WhatsApp deve usar somente a origem pública canônica configurada",
  );
  assert(
    !/Deno\.env\.get\("(?:SITE_URL|APP_URL|VITE_PUBLIC_SITE_URL)"\)/.test(
      whatsappIrpf,
    ),
    "WhatsApp não pode aceitar aliases que apontem para o portal interno",
  );
  assertMatch(
    whatsappIrpf,
    /url\.protocol !== "https:"[\s\S]*isPrivateOrLocalHostname\(url\.hostname\)/,
    "origem pública do WhatsApp deve exigir HTTPS e recusar host local/privado",
  );
});

Deno.test("histórico reutiliza chave após falha e preserva gates de assets", () => {
  assertMatch(
    history,
    /reissueRequestRef = useRef[\s\S]*createDocumentReissueKey\(\)/,
    "histórico precisa manter chave estável por operação",
  );
  assertMatch(
    history,
    /idempotencyKey:\s*reissueRequestRef\.current\.idempotencyKey/,
    "segunda via deve enviar a chave estável ao serviço",
  );
  assertMatch(
    history,
    /const prepareReissueOutput = async[\s\S]*await waitForDocumentAssets\(container\)[\s\S]*await downloadEmissionPdf\([\s\S]*false/,
    "assets e captura PDF devem terminar antes do incremento",
  );
  assertMatch(
    history,
    /await prepareReissueOutput\(selectedEmission\)[\s\S]*await confirmCanonicalReissue\(canonicalEmission\)[\s\S]*saveEmissionPdfBlob\(pdfBlob, canonicalEmission\)[\s\S]*finishReissueRequest\(\)/,
    "PDF só pode ser confirmado e salvo depois da captura sem efeitos colaterais",
  );
});
