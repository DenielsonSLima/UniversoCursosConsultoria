/* global ReadableStream: readonly, ReadableStreamDefaultController: readonly */
import { createProescV1PacedTransport } from './v1-paced-transport.ts';
import { createProescV1Client, ProescV1ReadError } from './v1-client.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const rejected = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('Expected rejection');
};
const source = 'https://source.invalid/';
function controlledSource() {
  let calls = 0;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = 0;
  const transport: typeof fetch = () => {
    calls++;
    return Promise.resolve(calls === 1 ? new Response(new ReadableStream<Uint8Array>({
      start(value) { controller = value; }, cancel() { cancelled++; },
    })) : new Response('next'));
  };
  return {
    transport, calls: () => calls, cancelled: () => cancelled,
    finish() { controller.enqueue(new TextEncoder().encode('first')); controller.close(); },
    fail() { controller.error(new Error('PRIVATE_PROVIDER_BODY')); },
  };
}

Deno.test('two readers cannot overlap even after headers resolve and before the first body ends', async () => {
  const f = controlledSource(); const paced = createProescV1PacedTransport(f.transport);
  const first = await paced(source);
  const second = paced(source);
  await tick(); assert(f.calls() === 1, 'Headers released the active GET too early');
  f.finish(); assert(await first.text() === 'first');
  assert(await (await second).text() === 'next' && f.calls() === 2);
});

Deno.test('an aborted queued reader never dispatches or lets its successor bypass the active GET', async () => {
  const f = controlledSource(); const paced = createProescV1PacedTransport(f.transport);
  const first = await paced(source);
  const controller = new AbortController();
  const cancelled = rejected(paced(source, { signal: controller.signal }));
  const third = paced(source);
  controller.abort(); await cancelled; await tick(); assert(f.calls() === 1);
  f.finish(); await first.text(); await (await third).text();
  assert(f.calls() === 2, 'An expired queue entry dispatched late');
});

Deno.test('caller abort during the body cancels that reader and allows the live sibling to continue', async () => {
  const f = controlledSource(); const paced = createProescV1PacedTransport(f.transport);
  const controller = new AbortController();
  const first = await paced(source, { signal: controller.signal });
  const body = rejected(first.text());
  const second = paced(source);
  controller.abort(); await body;
  assert(await (await second).text() === 'next');
  assert(f.cancelled() === 1 && f.calls() === 2);
});

Deno.test('429 blocks queued and future reads without retries, while retaining the original status', async () => {
  let calls = 0;
  const paced = createProescV1PacedTransport(async () => {
    calls++; await tick(); return new Response('PRIVATE_PROVIDER_BODY', { status: 429 });
  });
  const first = paced(source);
  const queued = rejected(paced(source));
  const response = await first; assert(response.status === 429);
  await response.body?.cancel();
  const errors = [await queued, await rejected(paced(source))];
  assert(calls === 1 && errors.every((error) => !String(error).includes('PRIVATE_PROVIDER_BODY')));
});

Deno.test('transport and stream failures close the gate without exposing provider errors', async () => {
  let calls = 0;
  const transportFailure = createProescV1PacedTransport(async () => {
    calls++; throw new Error('PRIVATE_URL_AND_TOKEN');
  });
  const failures = await Promise.all([rejected(transportFailure(source)), rejected(transportFailure(source))]);
  assert(calls === 1 && failures.every((error) => !String(error).includes('PRIVATE_URL_AND_TOKEN')));
  const f = controlledSource(); const paced = createProescV1PacedTransport(f.transport);
  const response = await paced(source);
  const body = rejected(response.text()); const queued = rejected(paced(source));
  f.fail(); const streamFailures = await Promise.all([body, queued]);
  assert(f.calls() === 1 && streamFailures.every((error) => !String(error).includes('PRIVATE_PROVIDER_BODY')));
});

Deno.test('consumer cancellation before EOF closes the gate and settles queued readers', async () => {
  const f = controlledSource(); const paced = createProescV1PacedTransport(f.transport);
  const response = await paced(source); const queued = rejected(paced(source));
  await response.body?.cancel(); await queued;
  assert(f.calls() === 1 && f.cancelled() === 1);
});

Deno.test('the global client deadline removes a queued GET without a late network request', async () => {
  const f = controlledSource(); const paced = createProescV1PacedTransport(f.transport);
  const first = await paced(source);
  const client = createProescV1Client({ token: 'a'.repeat(32), transport: paced,
    timeoutMs: 10, signal: AbortSignal.timeout(10) });
  const error = await rejected(client.accountingData({ unitId: '1', year: 2026, month: 9 }));
  assert(error instanceof ProescV1ReadError && error.code === 'ABORTED');
  f.finish(); await first.text(); await tick(); assert(f.calls() === 1);
  await (await paced(source)).text(); assert(f.calls() === 2);
});

Deno.test('an optional bounded interval is measured after body completion and is abortable', async () => {
  const starts: number[] = [];
  const paced = createProescV1PacedTransport(async () => {
    starts.push(Date.now()); return new Response('ok');
  }, { intervalMs: 30 });
  await (await paced(source)).text(); const firstDone = Date.now();
  const controller = new AbortController();
  const queued = rejected(paced(source, { signal: controller.signal }));
  controller.abort(); await queued;
  await (await paced(source)).text();
  assert(starts.length === 2 && starts[1] - firstDone >= 25);
});
