import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const folder = await mkdtemp(join(tmpdir(), 'history-emission-ui-'));
const output = join(folder, 'filters.test.cjs');
try {
  await build({
    entryPoints: [resolve('modules/gestor/secretaria/historico-emissoes/emissions-filters.ui.test.tsx')],
    outfile: output, bundle: true, platform: 'node', format: 'cjs',
    loader: { '.css': 'empty' },
    plugins: [{name:'history-list-fixture',setup(plugin){
      plugin.onResolve({filter:/historico-emissoes\.service$/},()=>({path:'listing',namespace:'fixture'}));
      plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const historicoEmissoesService = {
        loadFilters: async () => globalThis.__historyFilterTest.filters,
        loadEmissions: params => globalThis.__historyFilterTest.load(params),
      };`}));
    }}],
  });
  const result = spawnSync(process.execPath,['--test','--test-force-exit',output,
    'modules/gestor/secretaria/historico-emissoes/emissions-list.service.test.mjs'],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  process.exitCode=result.status ?? 1;
}finally{await rm(folder,{recursive:true,force:true});}
