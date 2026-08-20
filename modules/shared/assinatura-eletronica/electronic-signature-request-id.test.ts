import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearElectronicSignatureRequestId,
  getOrCreateElectronicSignatureRequestId,
} from './electronic-signature-request-id.ts';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test('reutiliza requestId persistido para a mesma operação e escopo', () => {
  const storage = new MemoryStorage();
  const uuid = '11111111-1111-4111-8111-111111111111';
  const scope = ['GESTOR', 'contexto-a', 'polo-a', 'turma-a', 'disciplina-a'];
  const first = getOrCreateElectronicSignatureRequestId(
    'REQUEST_DIARY_ENVELOPE',
    scope,
    { storage, createUuid: () => uuid },
  );
  const replay = getOrCreateElectronicSignatureRequestId(
    'REQUEST_DIARY_ENVELOPE',
    scope,
    { storage, createUuid: () => '22222222-2222-4222-8222-222222222222' },
  );
  assert.equal(first, uuid);
  assert.equal(replay, uuid);
});

test('separa as chaves de solicitação, preparo, finalização e download', () => {
  const storage = new MemoryStorage();
  const scope = ['COORDENADOR', 'contexto-b', 'envelope-b'];
  const request = getOrCreateElectronicSignatureRequestId(
    'REQUEST_DIARY_ENVELOPE',
    scope,
    { storage, createUuid: () => '33333333-3333-4333-8333-333333333333' },
  );
  const prepare = getOrCreateElectronicSignatureRequestId(
    'PREPARE_DIARY_ORIGINAL',
    scope,
    { storage, createUuid: () => '44444444-4444-4444-8444-444444444444' },
  );
  const finalize = getOrCreateElectronicSignatureRequestId(
    'FINALIZE_DIARY',
    scope,
    { storage, createUuid: () => '55555555-5555-4555-8555-555555555555' },
  );
  const download = getOrCreateElectronicSignatureRequestId(
    'CREATE_ARTIFACT_DOWNLOAD_URL',
    [...scope, 'DOCUMENTO_FINAL'],
    { storage, createUuid: () => '88888888-8888-4888-8888-888888888888' },
  );
  assert.notEqual(request, prepare);
  assert.notEqual(prepare, finalize);
  assert.notEqual(request, finalize);
  assert.notEqual(finalize, download);
});

test('reutiliza a chave do mesmo artefato após falha e separa classes', () => {
  const storage = new MemoryStorage();
  const baseScope = ['GESTOR', 'contexto-d', 'envelope-d'];
  const first = getOrCreateElectronicSignatureRequestId(
    'CREATE_ARTIFACT_DOWNLOAD_URL',
    [...baseScope, 'DOCUMENTO_FINAL'],
    { storage, createUuid: () => '99999999-9999-4999-8999-999999999999' },
  );
  const retry = getOrCreateElectronicSignatureRequestId(
    'CREATE_ARTIFACT_DOWNLOAD_URL',
    [...baseScope, 'DOCUMENTO_FINAL'],
    { storage, createUuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  );
  const receipt = getOrCreateElectronicSignatureRequestId(
    'CREATE_ARTIFACT_DOWNLOAD_URL',
    [...baseScope, 'COMPROVANTE_EVIDENCIA'],
    { storage, createUuid: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  );
  assert.equal(first, retry);
  assert.notEqual(first, receipt);
});

test('limpa somente a operação concluída', () => {
  const storage = new MemoryStorage();
  const scope = ['GESTOR', 'contexto-c', 'envelope-c'];
  const first = getOrCreateElectronicSignatureRequestId(
    'FINALIZE_DIARY',
    scope,
    { storage, createUuid: () => '66666666-6666-4666-8666-666666666666' },
  );
  clearElectronicSignatureRequestId('FINALIZE_DIARY', scope, { storage });
  const second = getOrCreateElectronicSignatureRequestId(
    'FINALIZE_DIARY',
    scope,
    { storage, createUuid: () => '77777777-7777-4777-8777-777777777777' },
  );
  assert.notEqual(first, second);
});
