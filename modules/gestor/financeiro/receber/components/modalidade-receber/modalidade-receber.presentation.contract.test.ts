import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [presentationSource, operationsSource] = await Promise.all([
  readFile(new URL('./ReceivableItemPresentation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./useModalidadeReceberOperations.ts', import.meta.url), 'utf8'),
]);

test('quarentena não oferece ação manual nem libera o documento', () => {
  const branchStart = presentationSource.indexOf('{isBaneseIdentityQuarantine ?');
  const branchEnd = presentationSource.indexOf(
    ': hasExternalChargeUrl || canOpenBanese ? (',
    branchStart,
  );
  assert.notEqual(branchStart, -1);
  assert.notEqual(branchEnd, -1);

  const quarantineBranch = presentationSource.slice(branchStart, branchEnd);
  assert.match(quarantineBranch, /isBaneseIdentityQuarantine \? null/);
  assert.doesNotMatch(
    quarantineBranch,
    /Consultar|Regularizar|Reemitir|onSync|onOpenCharge|>\s*Abrir\s*</i,
  );
});

test('título Banese existente nunca cai na ação de enviar ao banco', () => {
  const openBranch = presentationSource.indexOf(
    'hasExternalChargeUrl || canOpenBanese ? (',
  );
  const baneseClosedBranch = presentationSource.indexOf(
    ') : isBanese ? null : (',
    openBranch,
  );
  const syncAction = presentationSource.indexOf(
    'actions.onSync(item.id!)',
    baneseClosedBranch,
  );

  assert.notEqual(openBranch, -1);
  assert.notEqual(baneseClosedBranch, -1);
  assert.notEqual(syncAction, -1);
  assert.ok(openBranch < baneseClosedBranch);
  assert.ok(baneseClosedBranch < syncAction);
});

test('sincronização ignorada não apresenta confirmação bancária falsa', () => {
  const skippedGuard = operationsSource.indexOf('const skipped =');
  const successToast = operationsSource.indexOf("toast.success('Cobrança enviada'");

  assert.notEqual(skippedGuard, -1);
  assert.notEqual(successToast, -1);
  assert.ok(skippedGuard < successToast);
  assert.match(operationsSource, /asaas_sync_skipped === true/);
  assert.match(operationsSource, /toast\.info\([\s\S]*?'Cobrança não enviada'/);
});
