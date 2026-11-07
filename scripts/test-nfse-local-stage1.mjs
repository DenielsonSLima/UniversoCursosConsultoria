import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const collect = directory => readdirSync(resolve(root, directory), { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? collect(`${directory}/${entry.name}`)
    : /\.test\.tsx?$/.test(entry.name) ? [`${directory}/${entry.name}`] : []);
const tests = [
  'modules/gestor/access-control.test.ts',
  'modules/gestor/gestor-navigation.config.test.ts',
  ...collect('modules/gestor/emissor-nfse'),
  ...collect('modules/gestor/configuracoes/nfse-portal-contribuinte'),
];
const directory = mkdtempSync(join(tmpdir(), 'nfse-local-tests-'));
try {
  const outputs = [];
  for (const [index, file] of tests.entries()) {
    const outfile = join(directory, `${index}.mjs`);
    await build({ entryPoints: [resolve(root, file)], outfile, bundle: true,
      platform: 'node', format: 'esm', loader: { '.css': 'empty' },
      plugins: [{ name: 'block-live-supabase', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, args => ({ path: args.path, namespace: 'blocked' }));
        builder.onLoad({ filter: /.*/, namespace: 'blocked' }, () => ({
          contents: 'export const supabase=new Proxy({},{get(){throw new Error("Supabase remoto bloqueado no teste local NFS-e")}});',
          loader: 'js',
        }));
      } }],
    });
    outputs.push(outfile);
  }
  const result = spawnSync(process.execPath, ['--test', ...outputs], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
