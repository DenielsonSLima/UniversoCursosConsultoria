/* global ReadableStream: readonly -- API Web disponível no runtime Deno. */
import { createProescV1Client, ProescV1ReadError } from './v1-client.ts';
import { createProescV1PacedTransport } from './v1-paced-transport.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const token = 'synthetic-queue-deadline-token';
const source = { unitId: '1', year: 2026, month: 9 };

function delayedBodies(delays: number[]) {
  let calls = 0, active = 0, maximum = 0;
  const cancelled: number[] = [];
  const transport: typeof fetch = () => {
    const index = calls++;
    active++; maximum = Math.max(maximum, active);
    let timer: ReturnType<typeof setTimeout>;
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true; active--; clearTimeout(timer);
    };
    return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        timer = setTimeout(() => {
          finish();
          controller.enqueue(new TextEncoder().encode('{"status":"success","data":[]}'));
          controller.close();
        }, delays[index]);
      },
      cancel() { cancelled.push(index); finish(); },
    }), { headers: { 'Content-Type': 'application/json' } }));
  };
  return { transport, stats: () => ({ calls, active, maximum, cancelled }) };
}

Deno.test('two 80ms bodies each receive their own 120ms HTTP budget after acquiring the queue', async () => {
  const fixture = delayedBodies([80, 80]);
  const transport = createProescV1PacedTransport(fixture.transport);
  const client = createProescV1Client({ token, transport, timeoutMs: 120 });
  const results = await Promise.allSettled([client.accountingData(source), client.accountingData(source)]);
  assert(results.every((result) => result.status === 'fulfilled'),
    'Queue wait consumed the second request HTTP budget');
  assert(fixture.stats().calls === 2 && fixture.stats().maximum === 1 && fixture.stats().active === 0);
});

Deno.test('the global deadline cancels a queued client before dispatch without becoming an HTTP timeout', async () => {
  const fixture = delayedBodies([80]);
  const transport = createProescV1PacedTransport(fixture.transport);
  const owner = createProescV1Client({ token, transport, timeoutMs: 200 }).accountingData(source);
  const globalDeadline = new AbortController();
  const queued = createProescV1Client({ token, transport, timeoutMs: 5, signal: globalDeadline.signal })
    .accountingData(source).catch((error: unknown) => error);
  const timer = setTimeout(() => globalDeadline.abort(), 25);
  try {
    const error = await queued;
    assert(error instanceof ProescV1ReadError && error.code === 'ABORTED');
    await owner;
    assert(fixture.stats().calls === 1 && fixture.stats().active === 0, 'Expired queue entry dispatched late');
  } finally { clearTimeout(timer); globalDeadline.abort(); await owner; }
});

Deno.test('HTTP timeout starts at dispatch and still aborts a slow body after a long queue wait', async () => {
  const fixture = delayedBodies([80, 100]);
  const transport = createProescV1PacedTransport(fixture.transport);
  const owner = createProescV1Client({ token, transport, timeoutMs: 200 }).accountingData(source);
  const queued = createProescV1Client({ token, transport, timeoutMs: 20 }).accountingData(source);
  const [first, second] = await Promise.allSettled([owner, queued]);
  assert(first.status === 'fulfilled');
  assert(second.status === 'rejected' && second.reason instanceof ProescV1ReadError
    && second.reason.code === 'TIMEOUT');
  assert(fixture.stats().calls === 2 && fixture.stats().cancelled.includes(1),
    'The HTTP timer expired in the queue instead of timing the dispatched body');
  assert(fixture.stats().maximum === 1 && fixture.stats().active === 0);
  assert(!String(second.reason).includes(token));
});
