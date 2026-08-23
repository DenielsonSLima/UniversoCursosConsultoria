import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const readModuleFamily = async (matches: (name: string) => boolean) => {
  const directory = new URL(".", import.meta.url);
  const names = (await readdir(directory)).filter(matches).sort();
  return (await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  )).join("\n");
};

const [
  serviceSource,
  contractSource,
  panelSource,
  modalSource,
  requestIdSource,
] = await Promise.all([
  readModuleFamily((name) =>
    name.startsWith("assinatura-eletronica.service") && name.endsWith(".ts")
  ),
  readModuleFamily((name) =>
    name.startsWith("assinatura-eletronica.contract") && name.endsWith(".ts")
  ),
  readFile(
    new URL(
      "../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioElectronicSignaturePanel.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readModuleFamily((name) =>
    (
      name.startsWith("ElectronicSignatureActionModal") ||
      name === "ElectronicSignatureConsentForm.tsx" ||
      name.startsWith("useElectronicSignature")
    ) &&
    /\.tsx?$/u.test(name)
  ),
  readFile(
    new URL("./electronic-signature-request-id.ts", import.meta.url),
    "utf8",
  ),
]);

test("lookup canônico é a única autoridade de restauração do envelope do diário", () => {
  assert.match(
    serviceSource,
    /assinatura_eletronica_obter_envelope_diario_atual/,
  );
  assert.match(
    serviceSource,
    /value === null \|\| value === undefined\s*\? null\s*: normalizeEnvelopeDetail\(value\)/,
  );
  assert.match(
    panelSource,
    /electronicSignatureService\.getCurrentDiaryEnvelope/,
  );
  assert.doesNotMatch(panelSource, /sessionStorage|localStorage|setItem\(/);
});

test("solicitação e preparo oficial usam contratos distintos e idempotentes", () => {
  assert.match(
    serviceSource,
    /assinatura_eletronica_solicitar_envelope_diario/,
  );
  assert.match(serviceSource, /assinatura-eletronica-diario-artefatos/);
  assert.match(panelSource, /'REQUEST_DIARY_ENVELOPE'/);
  assert.match(panelSource, /action: 'PREPARE_ORIGINAL'/);
  assert.match(panelSource, /'PREPARE_DIARY_ORIGINAL'/);
  assert.doesNotMatch(
    panelSource,
    /useDiarioPdfDownload|generateDiarioPdf|html2canvas|jsPDF/,
  );
  assert.match(
    panelSource,
    /clearElectronicSignatureRequestId\('PREPARE_DIARY_ORIGINAL', prepareScope\);\s*clearElectronicSignatureRequestId\('REQUEST_DIARY_ENVELOPE', requestScope\);/s,
  );
  assert.doesNotMatch(
    panelSource,
    /if \(created\) \{\s*clearElectronicSignatureRequestId\('REQUEST_DIARY_ENVELOPE'/s,
  );
});

test("todos os estados terminais exigem ação explícita para uma nova versão", () => {
  for (
    const status of [
      "ASSINADO",
      "RECUSADO",
      "CANCELADO",
      "EXPIRADO",
      "SUBSTITUIDO",
    ]
  ) {
    assert.match(panelSource, new RegExp(`'${status}'`));
  }
  assert.match(panelSource, /isTerminal\s*\?\s*'Solicitar nova versão'/s);
});

test("query key do diário isola perfil, contexto, polo, turma e disciplina", () => {
  assert.match(
    contractSource,
    /["']diary-envelope["'],\s*profile,\s*contextId,\s*poloId,\s*turmaId,\s*disciplinaId/s,
  );
  assert.match(panelSource, /electronicSignatureQueryKeys\.diaryEnvelope\(/);
});

test("finalização oficial ocorre somente após sinal canônico e mantém retry após reload", () => {
  assert.match(modalSource, /if \(result\.requiresFinalization\)/);
  assert.match(modalSource, /action: ["']FINALIZE["']/);
  assert.match(modalSource, /["']FINALIZE_DIARY["']/);
  assert.match(
    modalSource,
    /detail\?\.envelope\.status === ["']FINALIZANDO["']/,
  );
  const recoveryStart = modalSource.indexOf(
    "const canRecoverFinalization = Boolean(",
  );
  const recoveryEnd = modalSource.indexOf("const closeSafely", recoveryStart);
  const recovery = modalSource.slice(recoveryStart, recoveryEnd);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
  assert.match(
    recovery,
    /canonicalParticipant\.order === canonicalParticipants\.length/,
  );
  assert.match(
    recovery,
    /canonicalParticipants\.every\(\(participant\) =>\s*participant\.status === ["']ASSINADO["']\s*\)/,
  );
  assert.doesNotMatch(
    recovery,
    /profile === ["']COORDENADOR["']|canonicalParticipant\?\.role === ["']COORDENADOR["']/,
  );
  assert.match(modalSource, /Tentar finalizar documento/);
  assert.doesNotMatch(modalSource, /action: ["']PREPARE_ORIGINAL["']/);
});

test("cliente aceita a lista canônica de 1..6 sem derivar ordem por papel", () => {
  const requestStart = serviceSource.indexOf(
    "normalizeDiaryEnvelopeRequest = (",
  );
  const requestEnd = serviceSource.indexOf(
    "normalizeOptionalEnvelopeDetail",
    requestStart,
  );
  const requestNormalizer = serviceSource.slice(requestStart, requestEnd);
  assert.ok(requestStart >= 0 && requestEnd > requestStart);
  assert.match(
    requestNormalizer,
    /normalizeCanonicalDiaryParticipants\(source\.participants\)/,
  );
  assert.match(
    serviceSource,
    /signers\.length < 1[\s\S]*?signers\.length > ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS/,
  );
  assert.match(serviceSource, /participant\.order !== index \+ 1/);
  assert.doesNotMatch(requestNormalizer, /PROFESSOR|COORDENADOR/);
});

test("sessionStorage é usado somente pelo módulo de requestIds", () => {
  assert.match(requestIdSource, /sessionStorage/);
  assert.match(
    requestIdSource,
    /STORAGE_PREFIX = 'universo:assinatura-eletronica:request:v1'/,
  );
  assert.doesNotMatch(
    requestIdSource,
    /envelopeStatus|envelopeDetail|participants|artifact/,
  );
});
