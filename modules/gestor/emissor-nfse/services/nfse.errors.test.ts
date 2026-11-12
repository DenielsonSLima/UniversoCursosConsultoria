import assert from 'node:assert/strict';
import test from 'node:test';
import { mapNfseTransportError, NfseAccessError } from './nfse.errors.ts';
test('RPC known validation maps only under expected SQLSTATE and hides raw detail', () => {
  assert.match(mapNfseTransportError({code:'22023', message:'Certificado fora da validade.',details:'SECRET'}).message,/Configurações > Certificado/);
  assert.match(mapNfseTransportError({code:'40001',message:'O modelo mudou. Atualize os modelos.'}).message,/versão antes de salvar/);
  assert.ok(mapNfseTransportError({code:'42501',message:'SECRET'}) instanceof NfseAccessError);
  assert.doesNotMatch(mapNfseTransportError({code:'XX000',message:'Certificado fora da validade.'}).message,/vencido/);
});
test('unknown preparation remains unconfirmed, authentication does not assert permission removal', () => {
  const fallback='Preparação não confirmada; consulte a mesma operação.';
  assert.equal(mapNfseTransportError({code:'XX000',message:'SECRET'},fallback).message,fallback);
  assert.match(mapNfseTransportError({code:'PGRST301'}).message,/autenticação/);
  const abort=new Error('cancelled');abort.name='AbortError';
  assert.equal(mapNfseTransportError(abort),abort);
});
