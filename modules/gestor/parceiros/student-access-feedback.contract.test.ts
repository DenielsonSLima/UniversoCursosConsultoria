import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [serviceSource, mutationsSource] = await Promise.all([
  readFile(new URL('./portal-activation.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./hooks/useParceirosMutations.ts', import.meta.url), 'utf8'),
]);

test('contrato do convite de Aluno cobre criação, recuperação, vínculo e reconciliação', () => {
  const resultContract = serviceSource.slice(
    serviceSource.indexOf('export type InviteStudentResult'),
    serviceSource.indexOf('type ConfirmStudentEmailResult'),
  );

  for (const action of [
    'invite',
    'recovery',
    'link-existing-identity',
    'reconcile-invite',
  ]) {
    assert.ok(resultContract.includes(`'${action}'`), `ação ausente: ${action}`);
  }

  for (const field of ['profileLinked', 'profileLinkState', 'studentAccessPending']) {
    assert.match(resultContract, new RegExp(`\\b${field}\\?\\s*:`));
  }
});

test('feedback de vínculo ou reconciliação preserva a mensagem canônica do backend', () => {
  const linkBranchStart = mutationsSource.indexOf(
    '} else if (studentIdentityLinkedOrReconciled) {',
  );
  const inviteBranchStart = mutationsSource.indexOf(
    "} else if (studentAccessAction === 'invite') {",
  );
  const genericPendingStart = mutationsSource.indexOf(
    '} else if (created?.email && !studentAccessResult) {',
  );
  const linkBranch = mutationsSource.slice(linkBranchStart, inviteBranchStart);

  assert.ok(linkBranchStart >= 0, 'feedback específico de vínculo ausente');
  assert.ok(inviteBranchStart > linkBranchStart, 'convite deve ser tratado depois do vínculo');
  assert.ok(genericPendingStart > inviteBranchStart, 'fallback pendente deve ficar por último');
  assert.match(linkBranch, /accessMessage\s*\|\|/);
  assert.match(linkBranch, /studentAccessPending/);
  assert.match(linkBranch, /reconcile-invite/);
  assert.doesNotMatch(linkBranch, /receber o convite|reenviar|reenvio/i);
});

test('fallback que recomenda convite só ocorre sem resposta válida do backend', () => {
  assert.match(
    mutationsSource,
    /else if \(created\?\.email && !studentAccessResult\) \{[\s\S]*?ainda precisa receber o convite/,
  );
});

test('cadastro invalida lista e detalhe somente depois da preparação canônica do acesso', () => {
  const ensureIndex = mutationsSource.indexOf('portalActivationService.ensureStudentAccess');
  const finalInvalidationIndex = mutationsSource.indexOf('await Promise.all([', ensureIndex);
  const detailInvalidationIndex = mutationsSource.indexOf(
    'parceirosQueryKeys.detail(created.id)',
    finalInvalidationIndex,
  );
  const feedbackIndex = mutationsSource.indexOf(
    'const studentAccessAction = studentAccessResult?.action',
  );

  assert.ok(ensureIndex >= 0, 'preparação de acesso ausente');
  assert.ok(finalInvalidationIndex > ensureIndex, 'invalidação final deve ocorrer após preparar acesso');
  assert.ok(detailInvalidationIndex > finalInvalidationIndex, 'detalhe do aluno deve ser invalidado');
  assert.ok(feedbackIndex > detailInvalidationIndex, 'feedback só deve ocorrer após a invalidação final');
  assert.match(
    mutationsSource.slice(finalInvalidationIndex, feedbackIndex),
    /invalidatePartners\(\)/,
  );
});
