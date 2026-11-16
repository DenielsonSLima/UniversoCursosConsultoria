import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateEadCouponsEnvironment } from './coupons-environment.ts';

const local = { dev: true, enabled: 'true', supabaseUrl: 'http://127.0.0.1:54321', frontendHostname: 'localhost' };
const production = { dev: false, enabled: undefined, supabaseUrl: 'https://kfekgwyqozhicpfuunpo.supabase.co',
  frontendHostname: 'www.universocc.com.br', frontendProtocol: 'https:' };

test('desenvolvimento exige opt-in e conexão loopback', () => {
  assert.equal(evaluateEadCouponsEnvironment(local), true);
  assert.equal(evaluateEadCouponsEnvironment({ ...local, supabaseUrl: 'http://localhost:54321' }), true);
  assert.equal(evaluateEadCouponsEnvironment({ ...local, supabaseUrl: 'http://[::1]:54321' }), true);
  for (const patch of [
    { dev: false }, { enabled: undefined }, { enabled: 'false' }, { enabled: true },
    { frontendHostname: 'universocc.com.br' }, { supabaseUrl: production.supabaseUrl },
    { supabaseUrl: 'http://localhost.example.com' }, { supabaseUrl: 'http://localhost@remote.example.com' },
    { supabaseUrl: 'http://user:pass@localhost:54321' }, { supabaseUrl: 'http://localhost?target=remote' },
    { supabaseUrl: 'http://localhost/proxy' }, { supabaseUrl: 'file://localhost/database' },
    { supabaseUrl: '' }, { supabaseUrl: null },
  ]) assert.equal(evaluateEadCouponsEnvironment({ ...local, ...patch }), false, JSON.stringify(patch));
});

test('produção e Preview autorizados exigem HTTPS e o projeto Supabase exato', () => {
  for (const frontendHostname of ['www.universocc.com.br', 'universocc.com.br',
    'universo-cursos-consultoria.vercel.app',
    'universo-cursos-consultoria-abc123xyz-denielson-limas-projects.vercel.app',
    'universo-cursos-consultoria-git-cupons-ead-denielson-limas-projects.vercel.app']) {
    assert.equal(evaluateEadCouponsEnvironment({ ...production, frontendHostname }), true, frontendHostname);
  }
  for (const patch of [
    { dev: true }, { enabled: 'false' }, { frontendProtocol: 'http:' }, { frontendProtocol: undefined },
    { frontendHostname: 'localhost' }, { frontendHostname: undefined },
    { frontendHostname: 'universocc.com.br.example.com' }, { frontendHostname: 'portal.universocc.com.br' },
    { frontendHostname: 'universo-cursos-consultoria-abc-outro-owner.vercel.app' },
    { frontendHostname: 'outro-projeto-abc-denielson-limas-projects.vercel.app' },
    { frontendHostname: 'universo-cursos-consultoria-abc-denielson-limas-projects.vercel.app.example.com' },
    { supabaseUrl: 'https://outro-projeto.supabase.co' }, { supabaseUrl: 'http://kfekgwyqozhicpfuunpo.supabase.co' },
    { supabaseUrl: 'https://kfekgwyqozhicpfuunpo.supabase.co:444' },
    { supabaseUrl: 'https://kfekgwyqozhicpfuunpo.supabase.co?target=other' },
    { supabaseUrl: 'https://kfekgwyqozhicpfuunpo.supabase.co/proxy' },
    { supabaseUrl: 'https://user@kfekgwyqozhicpfuunpo.supabase.co' },
    { supabaseUrl: 'https://kfekgwyqozhicpfuunpo.supabase.co.evil.example' },
  ]) assert.equal(evaluateEadCouponsEnvironment({ ...production, ...patch }), false, JSON.stringify(patch));
});
