import { resumeServiceFee } from './service-fee-resume.ts';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const fee = '00000000-0000-4000-8000-000000000001';
const cycle = '00000000-0000-4000-8000-000000000002';

Deno.test('normal C2 preserves the ordinary issuer when no service correction exists', async () => {
  let called = 0;
  await resumeServiceFee({ rpc(name, args) {
    called++;
    assert(name === 'resume_rejected_fee_service_recovery_secure', 'Wrong RPC');
    assert(args.p_receivable_id === fee && args.p_cycle_request_id === cycle, 'Wrong identity');
    assert(Object.keys(args).length === 2, 'No client-supplied amount, actor or bank identity');
    return Promise.resolve({ data: { handled: false }, error: null });
  } }, fee, cycle);
  assert(called === 1, 'One authenticated RPC');
});

for (const queued of [true, false]) {
  Deno.test(`service recovery queued=${queued} interrupts ordinary authorization and POST`, async () => {
    let ordinaryIssuance = false;
    let message = '';
    try {
      await resumeServiceFee({ rpc: () => Promise.resolve({
        data: { handled: true, queued, recoveryOnly: true }, error: null,
      }) }, fee, cycle);
      ordinaryIssuance = true;
    } catch (error) { message = (error as Error).message; }
    assert(!ordinaryIssuance, 'Never fall through to creation');
    assert(message.includes('Consultar novamente'), 'Explain how to follow progress');
    assert(!message.includes('13/13'), 'Never claim bank completion');
  });
}

Deno.test('RBAC, scope and drift errors stop recovery without fallback', async () => {
  const denied = { code: '42501', message: 'Sem permissão financeira.' };
  let captured: unknown;
  try {
    await resumeServiceFee({ rpc: () => Promise.resolve({ data: null, error: denied }) }, fee, cycle);
  } catch (error) { captured = error; }
  assert(captured === denied, 'Preserve the authorization failure');
});

for (const data of [null, [], {}, { handled: true, queued: true },
  { handled: true, queued: true, recoveryOnly: false }, { handled: true, recoveryOnly: true }]) {
  Deno.test(`malformed recovery response fails closed: ${JSON.stringify(data)}`, async () => {
    let rejected = false;
    try {
      await resumeServiceFee({ rpc: () => Promise.resolve({ data, error: null }) }, fee, cycle);
    } catch { rejected = true; }
    assert(rejected, 'Do not proceed from an unconfirmed recovery response');
  });
}
