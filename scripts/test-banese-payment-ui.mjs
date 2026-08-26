import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const testFiles = [
  'modules/aluno/financeiro/banese/banese-payment.utils.test.ts',
  'modules/aluno/financeiro/banese/hooks/useBaneseBoletoDocument.test.ts',
  'modules/aluno/cursos/eadCheckoutOptions.test.ts',
  'modules/aluno/financeiro/alunoEadPaymentOptions.test.ts',
  'modules/ead/components/eadPaymentQrImage.test.ts',
];
const outputFiles = testFiles.map((_, index) =>
  join(tmpdir(), `universo-banese-payment-${index}.test.mjs`)
);

try {
  await Promise.all(testFiles.map((testFile, index) =>
    build({
      entryPoints: [testFile],
      outfile: outputFiles[index],
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    })
  ));

  const result = spawnSync(process.execPath, ['--test', ...outputFiles], {
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  await Promise.all(outputFiles.map((outputFile) => rm(outputFile, { force: true })));
}
