import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

// Only the coupon lot and its existing checkout regressions. No service, remote
// database or payment provider is contacted by these synthetic tests.
const folders = ['modules/ead/cupons', 'modules/gestor/secretaria/cupons-ead/formularios',
  'modules/gestor/secretaria/cupons-ead', 'supabase/tests'];
const sources = folders.flatMap(folder => readdirSync(folder)
  .filter(name => /(?:coupon|cupom|cupon).*\.test\.(?:ts|mjs)$/.test(name))
  .map(name => `${folder}/${name}`));
sources.push('modules/gestor/secretaria/cupons-navigation.interaction.test.mjs');
sources.push('supabase/functions/gateways/checkout/ead-coupon-checkout.test.ts');

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env: {
    ...process.env,
    JSDOM_MODULE_PATH: process.env.JSDOM_MODULE_PATH || process.env.EAD_TEST_JSDOM_MODULE,
    EAD_TEST_JSDOM_MODULE: process.env.EAD_TEST_JSDOM_MODULE || process.env.JSDOM_MODULE_PATH,
  } });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
};

run(process.execPath, ['--test', ...sources]);
run('deno', ['test', '--no-check', '--allow-env', '--allow-read', '--unstable-sloppy-imports',
  'modules/aluno/cursos/eadCheckoutOptions.test.ts',
  'modules/aluno/cursos/eadPurchaseState.test.ts',
  'modules/aluno/financeiro/alunoEadPaymentOptions.test.ts',
  'supabase/functions/gateways/checkout/ead-context.test.ts',
  'supabase/functions/gateways/checkout/ead-finance.test.ts',
  'supabase/functions/gateways/checkout/ead-checkout-attempt.test.ts',
]);
