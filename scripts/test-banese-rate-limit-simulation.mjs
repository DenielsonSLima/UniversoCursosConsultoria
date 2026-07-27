import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';

const WINDOW_MS = 60_000;
const LIMIT = 60;
const CALL_INTERVAL_MS = 850;
let windowStartedAt = Date.now();
let callsInWindow = 0;

const server = createServer((request, response) => {
  if (request.url !== '/mock-banese/consulta') {
    response.writeHead(404).end();
    return;
  }
  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    callsInWindow = 0;
  }
  callsInWindow += 1;
  const status = callsInWindow > LIMIT ? 429 : 200;
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status, callsInWindow }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/mock-banese/consulta`;

try {
  const statuses = [];
  for (let index = 0; index < LIMIT + 1; index += 1) {
    if (index > 0) await wait(CALL_INTERVAL_MS);
    const response = await fetch(endpoint);
    statuses.push(response.status);
  }

  assert.equal(statuses.slice(0, LIMIT).every((status) => status === 200), true);
  assert.equal(statuses.at(-1), 429);
  console.log(JSON.stringify({
    environment: 'LOCAL_MOCK_ONLY',
    windowSeconds: WINDOW_MS / 1000,
    acceptedCalls: statuses.filter((status) => status === 200).length,
    throttledCalls: statuses.filter((status) => status === 429).length,
    issuedTitles: 0,
    conclusion: 'O tratamento de 60 sucessos e HTTP 429 foi validado localmente; isto não mede o limite real do Banese.',
  }, null, 2));
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
