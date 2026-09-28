import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp', 'document-identity-tests-'));
const tests = [
  'modules/gestor/secretaria/historico-emissoes/document-identity-update.test.ts',
  'modules/shared/utils/studentIdentityDocument.test.ts',
  'modules/shared/utils/student-document-presentation.test.ts',
  'modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha-identity.rendering.test.tsx',
  'modules/gestor/secretaria/historico-emissoes/emission-pasta-enrollment.pdf.test.ts',
  'modules/gestor/secretaria/historico-emissoes/emission-registration-identity.pdf.test.ts',
  'modules/gestor/secretaria/historico-emissoes/emission-pasta-photo.pdf.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminou com código ${result.status}`);
}

try {
  run(process.execPath, ['--test', 'modules/gestor/secretaria/historico-emissoes/template-parser.voter-snapshot.test.ts']);
  run('deno', ['test', '--allow-read',
    'supabase/tests/ficha_enrollment_number_snapshot.contract.test.ts',
    'supabase/tests/student_card_identity_snapshot.contract.test.ts',
    'supabase/tests/document_identity_versions.contract.test.ts',
  ]);
  const bundles = [];
  for (const [index, path] of tests.entries()) {
    const outfile = join(directory, `identity-${index}.test.mjs`);
    await build({
      entryPoints: [join(root, path)], outfile, bundle: true,
      platform: 'node', format: 'esm', packages: 'external',
      target: 'node24', logLevel: 'silent',
      define: {
        'import.meta.env': JSON.stringify({
          VITE_PUBLIC_SITE_URL: 'https://universocc.com.br',
          VITE_SUPABASE_URL: 'http://localhost',
          VITE_SUPABASE_ANON_KEY: 'test',
        }),
      },
    });
    bundles.push(outfile);
  }
  run(process.execPath, ['--test', ...bundles]);
} finally {
  await rm(directory, { recursive: true, force: true });
}
