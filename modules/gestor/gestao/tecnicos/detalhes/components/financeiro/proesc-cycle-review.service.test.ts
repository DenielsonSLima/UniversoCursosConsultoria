import assert from 'node:assert/strict';
import test from 'node:test';
import { supabase } from '../../../../../../../lib/supabase';
import { matriculaTecnicaCicloManualService } from './matricula-tecnica-ciclo-manual.service';

const input = {
  turmaId: 'synthetic-class', matriculaId: 'synthetic-enrollment', cicloNumero: 2,
  primeiroVencimento: '2026-10-15', requestId: 'synthetic-request',
  expectedRegraFingerprint: 'rule', expectedPoliticaFingerprint: 'policy',
  expectedCronogramaFingerprint: 'schedule', conferirProesc: true,
};

test('conferência Proesc bloqueia prévia e emissão antes de chamar o motor financeiro', async () => {
  const functionsDescriptor = Object.getOwnPropertyDescriptor(supabase, 'functions');
  const invoke = supabase.functions.invoke;
  const rpc = supabase.rpc;
  const calls: string[] = [];
  let classification = 'UNKNOWN';
  const mockInvoke = (async (name: string, options: any) => {
    calls.push(`${name}:${options.body.action}`);
    if (name !== 'proesc-api') return { data: null, error: new Error('motor financeiro simulado') };
    return { error: null, data: {
      classification, eligible: classification === 'C1',
      observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 299_000).toISOString(),
      reason: 'Conferência não libera emissão.', source: 'API_SCHEDULE_REVIEW',
    } };
  }) as typeof invoke;
  Object.defineProperty(supabase, 'functions', { value: { invoke: mockInvoke }, configurable: true });
  supabase.rpc = (async () => {
    calls.push('preview-rpc');
    return { data: null, error: new Error('prévia simulada') };
  }) as unknown as typeof rpc;
  try {
    for (classification of ['FULL', 'UNKNOWN']) {
      for (const action of ['preview', 'generate'] as const) {
        calls.length = 0;
        await assert.rejects(matriculaTecnicaCicloManualService[action](input), /não libera emissão/);
        assert.deepEqual(calls, ['proesc-api:review_cycles']);
      }
    }
    classification = 'C1';
    calls.length = 0;
    await assert.rejects(matriculaTecnicaCicloManualService.preview(input), /prévia simulada/);
    assert.deepEqual(calls, ['proesc-api:review_cycles', 'preview-rpc']);
    calls.length = 0;
    await assert.rejects(matriculaTecnicaCicloManualService.generate(input));
    assert.equal(calls[0], 'proesc-api:review_cycles');
    assert.equal(calls.length, 2);
    assert.match(calls[1], /:generate$/);

    calls.length = 0;
    await assert.rejects(matriculaTecnicaCicloManualService.preview({ ...input, conferirProesc: false }));
    assert.deepEqual(calls, ['preview-rpc']);
  } finally {
    if (functionsDescriptor) Object.defineProperty(supabase, 'functions', functionsDescriptor);
    else Reflect.deleteProperty(supabase, 'functions');
    supabase.rpc = rpc;
  }
});
