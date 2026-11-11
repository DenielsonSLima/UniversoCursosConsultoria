import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseEnvironmentStore, nfseEnvironmentPreferenceKey } from './nfse-environment.store.ts';

const scope = { contextKey: 'institutional-context', poloId: 'matrix' };
const key = nfseEnvironmentPreferenceKey(scope)!;
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); } };
};

test('configuration and issuer observers receive the same explicit environment and unsubscribe cleanly', () => {
  const storage = memoryStorage(), store = createNfseEnvironmentStore(() => storage);
  const configuration: string[] = [], issuer: string[] = [];
  assert.equal(store.get(key), 'PRODUCAO');
  const closeConfiguration = store.subscribe(key, () => configuration.push(store.get(key)));
  const closeIssuer = store.subscribe(key, () => issuer.push(store.get(key)));
  store.set(key, 'HOMOLOGACAO'); store.set(key, 'HOMOLOGACAO');
  assert.deepEqual(configuration, ['HOMOLOGACAO']); assert.deepEqual(issuer, ['HOMOLOGACAO']);
  closeConfiguration(); store.set(key, 'PRODUCAO'); closeIssuer(); store.set(key, 'HOMOLOGACAO');
  assert.deepEqual(configuration, ['HOMOLOGACAO']); assert.deepEqual(issuer, ['HOMOLOGACAO', 'PRODUCAO']);
  assert.deepEqual([...storage.values.values()], ['HOMOLOGACAO'], 'Storage contains a UI preference, never a fiscal configuration or credential');
});

test('explicit homologation survives remount/reload without changing another company or institutional context', () => {
  const storage = memoryStorage();
  createNfseEnvironmentStore(() => storage).set(key, 'HOMOLOGACAO');
  const restored = createNfseEnvironmentStore(() => storage);
  assert.equal(restored.get(key), 'HOMOLOGACAO');
  for (const changed of [{ ...scope, poloId: 'branch' }, { ...scope, contextKey: 'another-context' }]) {
    assert.equal(restored.get(nfseEnvironmentPreferenceKey(changed)), 'PRODUCAO');
  }
  assert.notEqual(nfseEnvironmentPreferenceKey({ contextKey: 'a:b', poloId: 'c' }),
    nfseEnvironmentPreferenceKey({ contextKey: 'a', poloId: 'b:c' }));
});

test('invalid stored or requested values and incomplete scopes cannot create another environment', () => {
  const storage = memoryStorage(); storage.values.set(key, 'arbitrary-environment');
  const store = createNfseEnvironmentStore(() => storage);
  assert.equal(store.get(key), 'PRODUCAO');
  store.set(key, 'invalid' as never); assert.equal(store.get(key), 'PRODUCAO');
  for (const empty of [{}, { contextKey: scope.contextKey }, { poloId: scope.poloId }]) {
    const missing = nfseEnvironmentPreferenceKey(empty);
    assert.equal(missing, null); store.set(missing, 'HOMOLOGACAO'); assert.equal(store.get(missing), 'PRODUCAO');
  }
  assert.equal(storage.values.size, 1);
});

test('denied or unavailable session storage retains a shared in-memory choice without throwing', () => {
  for (const storage of [() => undefined, () => { throw new Error('Synthetic privacy restriction'); },
    () => ({ getItem: () => { throw new Error('Read denied'); }, setItem: () => { throw new Error('Write denied'); } })]) {
    const store = createNfseEnvironmentStore(storage);
    assert.equal(store.get(key), 'PRODUCAO'); store.set(key, 'HOMOLOGACAO'); assert.equal(store.get(key), 'HOMOLOGACAO');
  }
});
