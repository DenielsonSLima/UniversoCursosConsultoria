import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  serviceSource,
  inboxSource,
  modalSource,
  contractSource,
  alunoSecretariaSource,
  alunoPageSource,
  responsavelPageSource,
] = await Promise.all([
  readFile(new URL('./assinatura-eletronica.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./ElectronicSignatureInbox.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./ElectronicSignatureActionModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./assinatura-eletronica.contract.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../aluno/secretaria/SecretariaPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../aluno/aluno.page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../responsavel/responsavel.page.tsx', import.meta.url), 'utf8'),
]);

test('caixa operacional usa somente RPC contextual e não consulta tabelas diretamente', () => {
  assert.match(serviceSource, /assinatura_eletronica_listar_caixa_contexto/);
  assert.match(serviceSource, /assinatura_eletronica_obter_envelope/);
  assert.match(serviceSource, /p_perfil: params\.profile/);
  assert.match(serviceSource, /p_context_id: requiredUuid\(params\.contextId/);
  assert.doesNotMatch(serviceSource, /\.from\(['"][^'"]+['"]\)/);
});

test('cache da assinatura separa perfil, contexto, polo e aba', () => {
  assert.match(
    contractSource,
    /["']inbox["'],\s*profile,\s*contextId,\s*poloId,\s*status/s,
  );
  assert.match(inboxSource, /electronicSignatureQueryKeys\.inbox\(/);
  assert.doesNotMatch(inboxSource, /items\.(?:filter|sort)\(/);
});

test('ação apresentada depende dos campos canônicos devolvidos pelo serviço', () => {
  assert.match(inboxSource, /item\.canAct && item\.primaryAction === 'SIGN'/);
  assert.match(modalSource, /canonicalParticipant\?\.canAct/);
  assert.match(modalSource, /canonicalParticipant\.participantId === item\.participantId/);
});

test('senha e ticket permanecem somente em memória e a senha é limpa após reautenticar', () => {
  assert.match(modalSource, /const \[password, setPassword\] = useState\(''\)/);
  assert.match(modalSource, /ticketRef = useRef/);
  assert.match(modalSource, /setPassword\(''\)/);
  assert.doesNotMatch(modalSource, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(serviceSource, /localStorage|sessionStorage|indexedDB/i);
});

test('confirmação reutiliza a mesma chave lógica e o ticket opaco', () => {
  assert.match(modalSource, /requestIdRef\.current \|\| newRequestId\(\)/);
  assert.match(modalSource, /confirmSignature\(\{\s*requestId,\s*ticket: activeTicket\.value/s);
  assert.match(modalSource, /!password && !hasValidTicket/);
  assert.match(modalSource, /Tentar confirmar novamente/);
  assert.match(serviceSource, /action: ["']CONFIRM_SIGNATURE["']/);
});

test('detalhe valida SHA-256 e coerência do estado dos artefatos antes de exibir', () => {
  assert.match(serviceSource, /const SHA256_PATTERN = \/\^\[a-f0-9\]\{64\}\$\/u/);
  assert.match(serviceSource, /normalizeDocumentReadiness/);
  assert.match(serviceSource, /ready !== Boolean\(sha256 && timestamp\)/);
});

test('Aluno e Responsável enviam o contexto canônico para a caixa de assinaturas', () => {
  assert.match(alunoPageSource, /contextId=\{profile\.contextId \|\| ''\}/);
  assert.match(alunoSecretariaSource, /profile="ALUNO"/);
  assert.match(alunoSecretariaSource, /contextId=\{contextId\}/);
  assert.match(responsavelPageSource, /profile="RESPONSAVEL_LEGAL"/);
  assert.match(responsavelPageSource, /contextId=\{profile\.contextId \|\| ''\}/);
  assert.doesNotMatch(responsavelPageSource, /const SignatureNotice/);
});
