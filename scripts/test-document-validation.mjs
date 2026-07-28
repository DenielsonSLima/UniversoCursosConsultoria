import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = await mkdtemp(
  join(tmpdir(), 'universo-document-validation-tests-'),
);
const historyTest = resolve(
  root,
  'modules/gestor/secretaria/historico-emissoes/document-validation-rendering.test.ts',
);
const historyTestBundle = join(
  outputDirectory,
  'document-validation-rendering.test.mjs',
);
const denoTests = [
  'modules/shared/document-validation/document-validation-url.test.ts',
  'modules/shared/document-validation/document-validation-qrcode.test.ts',
  'modules/shared/qrcode/local-qrcode.test.ts',
  'modules/shared/qrcode/document-assets.test.ts',
  'modules/gestor/secretaria/shared/pdf-blob-print.test.ts',
  'modules/gestor/secretaria/historico-emissoes/certificate-emission-contract.test.ts',
  'modules/gestor/secretaria/historico-emissoes/reissue-flow.test.ts',
  'modules/gestor/cadastros/modelos-documentos/validacao-documental/document-validation-policies.realtime.test.ts',
  'modules/gestor/cadastros/modelos-documentos/validacao-documental/document-validation-policies.registry.test.ts',
  'modules/gestor/cadastros/modelos-documentos/validacao-documental/document-validation-policies.ui.test.ts',
  'modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-validation-flow.test.ts',
  'modules/public/validator/validator.contract.test.ts',
  'modules/public/validator/validator.fields.test.ts',
  'modules/public/validator/validator-page.flow.test.ts',
  'supabase/tests/document_validation_public_profiles.contract.test.ts',
  'supabase/tests/document_validation_policy_governance.contract.test.ts',
  'supabase/tests/document_validation_idempotent_reissue.contract.test.ts',
  'supabase/tests/document_validation_migration_ledger.contract.test.ts',
  'supabase/tests/diario_canonical_validation.contract.test.ts',
];

const runChecked = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(
      `${command} terminou com código ${result.status ?? 'desconhecido'}.`,
    );
    error.exitCode = result.status ?? 1;
    throw error;
  }
};

try {
  runChecked('deno', [
    'test',
    '--allow-read',
    ...denoTests,
  ]);

  await build({
    entryPoints: [historyTest],
    outfile: historyTestBundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    define: {
      'import.meta.env': JSON.stringify({
        VITE_PUBLIC_SITE_URL: 'https://universocc.com.br',
        VITE_SUPABASE_URL: 'http://localhost',
        VITE_SUPABASE_ANON_KEY: 'test',
      }),
    },
  });

  runChecked(process.execPath, ['--test', historyTestBundle]);
} catch (error) {
  process.exitCode = Number.isInteger(error?.exitCode)
    ? error.exitCode
    : 1;
  console.error(error);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
