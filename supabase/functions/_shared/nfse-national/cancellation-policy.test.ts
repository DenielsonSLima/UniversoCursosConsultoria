import { evaluateCancellationPolicy, type CancellationPolicyInput } from './cancellation-policy.ts';

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
function fixture(): CancellationPolicyInput {
  return {
    now: '2026-11-08T12:00:00Z', actorAuthorizedAsIssuer: true,
    document: { accessKey: '0'.repeat(50), environment: 'HOMOLOGACAO', municipalityCode: '2802908',
      state: 'AUTHORIZED', serviceAmount: '123.45', recipientIdentified: true, taxesPaid: false },
    eventEligibility: { accessKey: '0'.repeat(50), environment: 'HOMOLOGACAO', checkedAt: '2026-11-08T11:59:00Z',
      validUntil: '2026-11-08T12:01:00Z', directCancellationAllowed: true, analysisRequestAllowed: true },
    municipalRules: { source: 'MUNICIPAL_PARAMETER_API', municipalityCode: '2802908', environment: 'HOMOLOGACAO',
      checkedAt: '2026-11-08T11:59:00Z', validUntil: '2026-11-08T12:01:00Z',
      deadline: { mode: 'UNTIL', at: '2026-11-08T13:00:00Z' }, maximumValue: { mode: 'LIMIT', amount: '1000.00' },
      unidentifiedRecipientAllowed: false, cancellationAfterTaxPaymentAllowed: false, analysisRequestAllowed: true },
  };
}

Deno.test('cancelamento exige provas atuais, mesmo documento e regras municipais explicitas', () => {
  const input = fixture();
  const ready = evaluateCancellationPolicy(input);
  assert(ready.cancel.allowed && ready.requestAnalysis.allowed);
  for (const changed of [
    { ...input, actorAuthorizedAsIssuer: false }, { ...input, municipalRules: null },
    { ...input, eventEligibility: null }, { ...input, now: '2026-11-08T12:02:00Z' },
    { ...input, document: { ...input.document, state: 'CANCELLED' as const } },
    { ...input, municipalRules: { ...input.municipalRules!, environment: 'PRODUCAO' as const } },
  ]) {
    const result = evaluateCancellationPolicy(changed);
    assert(!result.cancel.allowed && !result.requestAnalysis.allowed);
  }
});

Deno.test('prazo, valor, identificacao e tributos bloqueiam direto; analise e outra intencao', () => {
  const input = fixture();
  const result = evaluateCancellationPolicy({ ...input,
    document: { ...input.document, recipientIdentified: false, taxesPaid: true },
    municipalRules: { ...input.municipalRules!, deadline: { mode: 'UNTIL', at: '2026-11-08T11:00:00Z' },
      maximumValue: { mode: 'LIMIT', amount: '123.44' } },
  });
  assert(!result.cancel.allowed && result.requestAnalysis.allowed);
  for (const code of ['E0822', 'E0823', 'E0824', 'E0827']) assert(result.cancel.blockers.includes(code));
});

Deno.test('ausencia nao vira permissao nem prazo nacional fixo', () => {
  const input = fixture();
  const result = evaluateCancellationPolicy({ ...input,
    document: { ...input.document, recipientIdentified: null, taxesPaid: null },
    eventEligibility: { ...input.eventEligibility!, analysisRequestAllowed: null },
    municipalRules: { ...input.municipalRules!, deadline: null, maximumValue: null },
  });
  assert(!result.cancel.allowed && !result.requestAnalysis.allowed);
  assert(result.cancel.blockers.includes('MUNICIPAL_DEADLINE_UNKNOWN'));
  assert(result.cancel.blockers.includes('MUNICIPAL_MAXIMUM_VALUE_UNKNOWN'));
});

Deno.test('dados malformados de fontes externas nao promovem desconhecido a permitido', () => {
  const input = fixture();
  for (const malformed of [undefined, null, 'true', 'false', 1]) {
    const result = evaluateCancellationPolicy({ ...input,
      document: { ...input.document, recipientIdentified: malformed, taxesPaid: malformed },
      municipalRules: { ...input.municipalRules!, unidentifiedRecipientAllowed: true,
        cancellationAfterTaxPaymentAllowed: true },
    } as never);
    assert(!result.cancel.allowed);
    assert(result.cancel.blockers.includes('RECIPIENT_RULE_UNKNOWN'));
    assert(result.cancel.blockers.includes('TAX_PAYMENT_RULE_UNKNOWN'));
    const actor = evaluateCancellationPolicy({ ...input, actorAuthorizedAsIssuer: malformed } as never);
    assert(!actor.cancel.allowed && !actor.requestAnalysis.allowed);
  }
  const environment = evaluateCancellationPolicy({ ...input,
    document: { ...input.document, environment: 'OUTRO' },
  } as never);
  assert(!environment.cancel.allowed && !environment.requestAnalysis.allowed);
});

Deno.test('datas impossiveis e valores numericos malformados bloqueiam sem TypeError', () => {
  const input = fixture();
  for (const amount of [123.45, null, undefined, {}, '1e3']) {
    const result = evaluateCancellationPolicy({ ...input,
      document: { ...input.document, serviceAmount: amount },
    } as never);
    assert(!result.cancel.allowed && !result.requestAnalysis.allowed);
    assert(result.cancel.blockers.includes('CANONICAL_SERVICE_AMOUNT_REQUIRED'));
  }
  for (const invalid of ['2026-11-31T12:00:00Z', '2026-02-29T12:00:00Z', '2026-11-08T25:00:00Z']) {
    const result = evaluateCancellationPolicy({ ...input,
      municipalRules: { ...input.municipalRules!, validUntil: invalid },
    });
    assert(!result.cancel.allowed && !result.requestAnalysis.allowed);
    const deadline = evaluateCancellationPolicy({ ...input,
      municipalRules: { ...input.municipalRules!, deadline: { mode: 'UNTIL', at: invalid } },
    });
    assert(!deadline.cancel.allowed);
    assert(deadline.cancel.blockers.includes('MUNICIPAL_DEADLINE_UNKNOWN'));
  }
});
