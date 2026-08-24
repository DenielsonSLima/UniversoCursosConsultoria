import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSources = async (paths: string[]) => (
  await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
).join('\n');

const serviceModules = [
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.shared.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.transport.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.api.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.api-administration.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.api-archive.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.api-diary.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.api-signing.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.archive-normalizers.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.consent-normalizers.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.envelope-normalizers.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.service.inbox-normalizers.ts',
];
const contractModules = [
  '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.inbox.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.legal.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.presentation.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.query-keys.ts',
  '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.stamp.ts',
];
const modalModules = [
  '../../../shared/assinatura-eletronica/ElectronicSignatureActionModal.tsx',
  '../../../shared/assinatura-eletronica/ElectronicSignatureActionModalContent.tsx',
  '../../../shared/assinatura-eletronica/ElectronicSignatureConsentForm.tsx',
  '../../../shared/assinatura-eletronica/useElectronicSignatureActionModal.ts',
];

const [
  serviceSource,
  contractSource,
  modalSource,
  pageSource,
  archiveSource,
  archiveDetailSource,
  turmaServiceSource,
] = await Promise.all([
  readSources(serviceModules),
  readSources(contractModules),
  readSources(modalModules),
  readFile(new URL('./SecretariaAssinaturasPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./SecretariaAssinaturasAcervo.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./SecretariaAssinaturasAcervoDetailDialog.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./secretaria-assinaturas-acervo.service.ts', import.meta.url), 'utf8'),
]);

const archiveUiSource = `${archiveSource}\n${archiveDetailSource}`;

test('modal carrega e apresenta o termo canônico completo antes do aceite', () => {
  assert.match(serviceSource, /assinatura_eletronica_obter_termo/);
  assert.match(serviceSource, /p_participante_id:\s*requiredUuid\(\s*params\.participantId/);
  assert.match(modalSource, /electronicSignatureQueryKeys\.consentTerm\(/);
  assert.match(modalSource, /consentTerm\.sections\.map\(/);
  assert.match(modalSource, /consentTerm\.title/);
  assert.match(modalSource, /consentTerm\.versionLabel/);
  assert.match(modalSource, /consentTerm\?\.confirmationMessage/);
  assert.match(modalSource, /type="checkbox"/);
  assert.match(modalSource, /!consentTerm\s*\|\|\s*!consentAccepted/s);
});

test('reauth envia somente o aceite canônico carregado no servidor', () => {
  assert.match(
    modalSource,
    /consent:\s*\{\s*accepted: true,\s*termId: consentTerm\.termId,\s*sha256: consentTerm\.sha256/s,
  );
  assert.match(serviceSource, /action:\s*["']REAUTHENTICATE["'][\s\S]*?password,\s*[\s\S]*?consent,/);
  assert.match(serviceSource, /normalizeRequiredSha256\(\s*params\.consent\.sha256/);
  assert.doesNotMatch(modalSource, /subtle\.digest|createHash|SHA-256.*=/);
});

test('PDF original abre uma aba no gesto do usuário antes da espera assíncrona', () => {
  const popupIndex = modalSource.search(
    /const previewWindow = window\.open\((?:''|""),\s*(?:'_blank'|"_blank")\)/,
  );
  const relativeAwaitIndex = modalSource.slice(popupIndex).search(
    /await electronicSignatureService\s*\.createArtifactDownloadUrl/,
  );
  const awaitIndex = relativeAwaitIndex < 0 ? -1 : popupIndex + relativeAwaitIndex;
  assert.ok(popupIndex >= 0, 'a janela de visualização deve nascer no clique');
  assert.ok(awaitIndex > popupIndex, 'a Edge deve responder depois de a janela existir');
  assert.match(modalSource, /previewWindow\?\.close\(\)/);
  assert.match(modalSource, /Abrir novamente enquanto o link estiver válido/);
});

test('acervo usa paginação keyset e filtros exclusivamente no RPC', () => {
  assert.match(archiveSource, /useInfiniteQuery\(/);
  assert.match(archiveSource, /initialPageParam: null as ElectronicSignatureArchiveCursor \| null/);
  assert.match(archiveSource, /getNextPageParam: \(lastPage\) => lastPage\.nextCursor \|\| undefined/);
  assert.match(archiveSource, /pages\.flatMap\(\(page\) => page\.items\)/);
  assert.doesNotMatch(archiveSource, /items\.(?:filter|sort)\(/);
  for (const rpcArgument of [
    'p_context_id',
    'p_polo_id',
    'p_documento',
    'p_status',
    'p_busca',
    'p_turma_id',
    'p_finalizado_de',
    'p_finalizado_ate',
    'p_limite',
    'p_cursor_finalizado_em',
    'p_cursor_envelope_id',
  ]) {
    assert.match(serviceSource, new RegExp(`\\b${rpcArgument}\\s*:`));
  }
  assert.match(serviceSource, /civilDateToMaceioIso\(\s*to,\s*["']A data final["'],\s*true\s*\)/);
});

test('query keys isolam perfil, contexto, polo e todos os filtros', () => {
  assert.match(
    contractSource,
    /["']archive["'],\s*profile,\s*contextId,\s*poloId/s,
  );
  assert.match(
    contractSource,
    /electronicSignatureQueryKeys\.archiveLists\(profile,\s*contextId,\s*poloId\),\s*["']list["'],\s*filters/s,
  );
  assert.match(archiveSource, /electronicSignatureQueryKeys\.archiveList\(/);
  assert.match(archiveSource, /electronicSignatureQueryKeys\.archiveTurmas\(["']GESTOR["'],\s*contextId,\s*normalizedPoloId\)/);
  assert.match(archiveSource, /electronicSignatureQueryKeys\.archiveLists\(["']GESTOR["'],\s*contextId,\s*normalizedPoloId\)/);
});

test('download é RBAC-aware, idempotente e não expõe caminho do Storage', () => {
  assert.match(serviceSource, /ELECTRONIC_SIGNATURE_ARCHIVE_FUNCTION\s*=\s*["']assinatura-eletronica-acervo["']/);
  assert.match(serviceSource, /profile: normalizeArtifactProfile\(params\.profile\)/);
  assert.match(modalSource, /profile !== ["']PROFESSOR["'] && profile !== ["']COORDENADOR["']/);
  assert.match(archiveSource, /profile:\s*["']GESTOR["']/);
  assert.match(archiveSource, /["']CREATE_ARTIFACT_DOWNLOAD_URL["']/);
  assert.match(archiveSource, /clearElectronicSignatureRequestId\(/);
  assert.doesNotMatch(`${archiveSource}\n${contractSource}`, /storage_path|storagePath|bucket_id|bucketId/);
});

test('downloads do acervo também reservam a aba antes do await da mutation', () => {
  const popupIndex = archiveSource.indexOf("const previewWindow = window.open('', '_blank')");
  const mutationIndex = archiveSource.indexOf('artifactMutation.mutate({', popupIndex);
  assert.ok(popupIndex >= 0);
  assert.ok(mutationIndex > popupIndex);
  assert.match(archiveSource, /previewWindow\.location\.replace\(download\.url\)/);
  assert.match(archiveSource, /link exibido nos detalhes do documento/);
});

test('acervo aceita de um a seis signatários e não usa o papel como chave visual', () => {
  const normalizerStart = serviceSource.indexOf('const normalizeArchiveItem = (');
  const normalizerEnd = serviceSource.indexOf('const normalizeArchiveCursor', normalizerStart);
  const archiveNormalizer = serviceSource.slice(normalizerStart, normalizerEnd);
  assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart);
  assert.match(archiveNormalizer, /assertDiarySignerCount\(source\.signers, "O diário finalizado"\)/);
  assert.doesNotMatch(archiveNormalizer, /length !== 2|PROFESSOR|COORDENADOR/);
  assert.doesNotMatch(archiveSource, /key=\{signer\.role\}/);
  assert.match(archiveSource, /key=\{`\$\{item\.envelopeId\}:signer:\$\{signerIndex\}`\}/);
});

test('navegação e acervo preservam teclado, semântica responsiva e validador público', () => {
  assert.match(pageSource, /Tipos de documento/);
  assert.match(pageSource, /label: 'Diários'/);
  assert.match(pageSource, /label: 'Contratos'/);
  assert.match(pageSource, /label: 'Matrículas'/);
  assert.match(pageSource, /Assinatura ainda não habilitada/);
  assert.match(pageSource, /disabled=\{!card\.enabled\}/);
  assert.match(pageSource, /role="tablist"/);
  assert.match(pageSource, /role="tab"/);
  assert.match(pageSource, /ArrowRight/);
  assert.match(pageSource, /aria-selected=\{selected\}/);
  assert.match(archiveUiSource, /role="dialog"/);
  assert.match(archiveSource, /<table/);
  assert.match(archiveSource, /md:hidden/);
  assert.match(archiveUiSource, /\/validador\?code=\$\{encodeURIComponent\(item\.validationCode\)\}/);
  assert.match(archiveUiSource, /Visualizar documento final/);
  assert.match(archiveUiSource, /Abrir comprovante/);
});

test('filtro de turma usa somente RPC contextual autorizada', () => {
  assert.match(turmaServiceSource, /assinatura_eletronica_opcoes_acervo_gestor/);
  assert.match(turmaServiceSource, /p_context_id:\s*requiredUuid\(params\.contextId/);
  assert.match(turmaServiceSource, /p_polo_id:\s*requiredUuid\(params\.poloId/);
  assert.match(turmaServiceSource, /assertExactKeys\(payload,\s*\[["']items["']\]/);
  assert.doesNotMatch(turmaServiceSource, /\.from\(|usuarios_sistema|auth\.admin|service_role/);
});
