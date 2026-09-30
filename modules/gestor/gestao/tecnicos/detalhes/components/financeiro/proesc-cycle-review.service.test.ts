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

test('T42 durável usa autoridade local; revisão pendente preserva o preflight Proesc', async () => {
  const functionsDescriptor = Object.getOwnPropertyDescriptor(supabase, 'functions');
  const invoke = supabase.functions.invoke;
  const rpc = supabase.rpc;
  const calls: string[] = [];
  const mockInvoke = (async (name: string, options: any) => {
    calls.push(`${name}:${options.body.action}`);
    return { data: null, error: new Error('motor financeiro simulado') };
  }) as typeof invoke;
  Object.defineProperty(supabase, 'functions', { value: { invoke: mockInvoke }, configurable: true });
  supabase.rpc = (async () => {
    calls.push('preview-rpc');
    return { data: null, error: new Error('prévia simulada') };
  }) as unknown as typeof rpc;
  try {
    calls.length = 0;
    await assert.rejects(matriculaTecnicaCicloManualService.preview(input), /Proesc/);
    assert.deepEqual(calls, ['proesc-api:review_cycles']);

    calls.length = 0;
    await assert.rejects(matriculaTecnicaCicloManualService.generate(input));
    assert.deepEqual(calls, ['proesc-api:review_cycles']);

    calls.length = 0;
    await assert.rejects(
      matriculaTecnicaCicloManualService.preview({ ...input, conferirProesc: false }),
      /prévia simulada/,
    );
    assert.deepEqual(calls, ['preview-rpc']);
  } finally {
    if (functionsDescriptor) Object.defineProperty(supabase, 'functions', functionsDescriptor);
    else Reflect.deleteProperty(supabase, 'functions');
    supabase.rpc = rpc;
  }
});
