// @ts-nocheck -- contratos de entrega executados pelo Deno, fora da aplicação.

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));
const [whatsappIrpf, whatsappEngine, history, session] = await Promise.all([
  read("../functions/_shared/whatsapp-flow/irpf.ts"),
  read("../functions/_shared/whatsapp-flow/engine.ts"),
  read("../../modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx"),
  read("../../modules/gestor/secretaria/historico-emissoes/useReissueSession.ts"),
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertMatch(value: string, pattern: RegExp, message: string) {
  assert(pattern.test(value), message);
}

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
  assertMatch(history, /const reissueSession = useReissueSession\(context\.userId\)/,
    "a página precisa usar a sessão idempotente extraída");
  assert((history.match(/reissueSession\.getRequest\(emission\)/g) || []).length === 2,
    "preparação e confirmação precisam compartilhar a mesma chave");
  assertMatch(session, /discardStale:[\s\S]*error\.code === '40001'[\s\S]*finish\(\)/,
    "falhas recuperáveis não podem descartar a chave; conflito obsoleto deve encerrar a tentativa");
  assertMatch(
    session,
    /const request = useRef[\s\S]*if \(request\.current\?\.fingerprint !== fingerprint\)[\s\S]*createDocumentReissueKey\(\)/,
    "histórico precisa manter chave estável por operação",
  );
  assertMatch(
    session,
    /idempotencyKey:\s*request\.current\.idempotencyKey/,
    "segunda via deve enviar a chave estável ao serviço",
  );
  assertMatch(
    history,
    /const prepareReissueOutput = async[\s\S]*await waitForDocumentAssets\(container\)[\s\S]*await downloadEmissionPdf\([\s\S]*false/,
    "assets e captura PDF devem terminar antes do incremento",
  );
  assertMatch(
    history,
    /await prepareReissueOutput\(selectedEmission\)[\s\S]*await confirmCanonicalReissue\(canonicalEmission\)[\s\S]*saveEmissionPdfBlob\(pdfBlob, canonicalEmission\)[\s\S]*reissueSession\.finish\(\)/,
    "PDF só pode ser confirmado e salvo depois da captura sem efeitos colaterais",
  );
});
