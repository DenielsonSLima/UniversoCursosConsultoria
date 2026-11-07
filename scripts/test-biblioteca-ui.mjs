import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
const tests = [
  'modules/gestor/biblioteca/components/library-permissions.behavior.test.mjs',
  'modules/gestor/biblioteca/components/file-explorer.behavior.test.mjs',
  'modules/gestor/biblioteca/components/library-upload.behavior.test.mjs',
];
const jsdomPath = process.env.BIBLIOTECA_JSDOM_PATH
  || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH;

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: repository,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(jsdomPath ? {
      BIBLIOTECA_JSDOM_PATH: jsdomPath,
      INSTITUTIONAL_SELECT_JSDOM_PATH: jsdomPath,
    } : {}),
  },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
