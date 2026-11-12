import assert from 'node:assert/strict';
import test from 'node:test';
import { individualTransportError } from './nfse-individual.errors.ts';
import { nfseRuleError } from '../services/nfse-rule-errors.ts';
const failure = (error: unknown, status = 400) => ({ context: new Response(JSON.stringify({ error }), { status }) });
test('exact endpoint failures identify permission and throttle without inventing rejection', async () => {
  assert.match((await individualTransportError(failure('RATE_LIMITED', 429))).message, /limite de tentativas/);
  assert.match((await individualTransportError(failure('INDIVIDUAL_SCOPE_DENIED', 403))).message, /unidade selecionada/);
  assert.match((await individualTransportError(failure('INVALID_INDIVIDUAL_COMMAND'))).message, /não identificou um campo/);
});
test('unknown outcome preserves reconciliation before retry and hides arbitrary payloads', async () => {
  for (const error of [failure('SECRET-XML'), failure('__proto__'), { message: 'SECRET-XML' }, {context:new Response('SECRET-XML', {status:502})}, null]) {
    const result = await individualTransportError(error);
    assert.match(result.message, /consulte esta mesma operação/);
    assert.doesNotMatch(result.message, /SECRET-XML|__proto__/);
  }
});
test('known rules explain correction destination without alleging ambiguous cause', () => {
  assert.match(nfseRuleError('Tomador ativo com documento válido obrigatório.')!, /cadastro do aluno ou parceiro/);
  assert.match(nfseRuleError('Revise a configuração e o certificado de produção.')!, /não identifica qual/);
  assert.match(nfseRuleError('Certificado fora da validade.')!, /Configurações > Certificado/);
  assert.equal(nfseRuleError('__proto__'), null);
  assert.equal(nfseRuleError('Tomador ativo com documento válido obrigatório. TOKEN'), null);
  assert.equal(nfseRuleError({message:'secret'}), null);
});

test('503 identifies service outage without asserting a fiscal outcome or exposing body', async () => {
  const result = await individualTransportError({context:new Response('SECRET-XML', {status:503})});
  assert.match(result.message, /indisponível \(HTTP 503\)/);
  assert.match(result.message, /não confirma envio nem rejeição/);
  assert.doesNotMatch(result.message, /SECRET-XML/);
});

test('automatic observation can stop on access errors and respect throttle without reading private payloads', async () => {
  const denied = await individualTransportError(failure('INDIVIDUAL_SCOPE_DENIED', 403));
  assert.equal((denied as Error & { status: number }).status, 403);
  assert.equal((denied as Error & { code: string }).code, 'INDIVIDUAL_SCOPE_DENIED');
  const limited = await individualTransportError({ context: new Response(JSON.stringify({ error: 'RATE_LIMITED', secret: 'FORBIDDEN' }),
    { status: 429, headers: { 'Retry-After': '120' } }) });
  assert.equal((limited as Error & { retryAfterMs: number }).retryAfterMs, 120000);
  assert.equal((limited as Error & { status: number }).status, 429);
  assert.equal((limited as Error & { beforeDispatch: boolean }).beforeDispatch, true);
  assert.doesNotMatch(JSON.stringify(limited), /FORBIDDEN/);
  const ambiguous = await individualTransportError({ context: new Response('unknown gateway body', { status: 429 }) });
  assert.equal('beforeDispatch' in ambiguous, false, 'An arbitrary gateway error never authorizes another fiscal POST');
});
