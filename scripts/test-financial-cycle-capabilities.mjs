import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'universo-capabilities-'));
const entryPoints = [
  'modules/gestor/financeiro/receber/components/modalidade-receber/receivable-source-capabilities.test.tsx',
  'modules/gestor/financeiro/receber/components/modalidade-receber/receivable-external-history-actions.test.ts',
];
for (const [index, entry] of entryPoints.entries()) {
  const output = join(directory, `case-${index}.cjs`);
  await build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: output,
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'block-financial-network', setup(builder) {
      builder.onLoad({ filter: /lib\/supabase\.ts$/ }, () => ({
        contents: 'export const supabase = new Proxy({}, {get() {throw new Error("Financial network forbidden in presentation test");}});',
        loader: 'ts',
      }));
    } }],
  });
  execFileSync(process.execPath, ['--test', output], { stdio: 'inherit' });
}
