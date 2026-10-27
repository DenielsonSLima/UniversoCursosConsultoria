import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export async function progressRuntime() {
  const repo = resolve('.');
  const base = join(repo, 'modules/gestor/gestao/tecnicos/detalhes/components/financeiro');
  const temporary = await mkdtemp(join(tmpdir(), 'manual-progress-test-'));
  const output = join(temporary, 'bundle.mjs');
  const result = await build({
    stdin: { contents: `
      export * from '${base}/manual-cycle-observation.ts';
      export * from '${base}/manual-cycle-activity.ts';
      export * from '${base}/manual-cycle-progress.service.ts';
      export * from '${base}/manual-cycle-pending-observation.ts';
      export * from '${base}/hooks/useMatriculaTecnicaCicloManual.ts';
      export { default as Progress } from '${base}/FinanceiroCicloManualIssuanceProgress.tsx';
      export { default as LiveProgress } from '${base}/FinanceiroCicloManualLiveProgress.tsx';
      export { default as React } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
    `, resolveDir: repo, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
    plugins: [{ name: 'no-financial-network', setup(builder) {
      builder.onResolve({ filter: /^@tanstack\/react-query$/ }, () => ({ path: 'query', namespace: 'mock' }));
      builder.onResolve({ filter: /matricula-tecnica-ciclo-manual\.service$/ }, () => ({ path: 'issuance', namespace: 'mock' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'query' ? `
        export const useMutation=(config)=>config;
        export const useQueryClient=()=>globalThis.progressQueryClient;
        export const useQuery=(config)=>{globalThis.progressQueryOptions=config;return globalThis.progressQueryState;};
      ` : path === 'issuance' ? `
        export const matriculaTecnicaCicloManualService={generate:(input)=>globalThis.sendCycle(input),resume:(input)=>globalThis.sendCycle(input)};
      ` : `export const supabase={rpc:(...args)=>({abortSignal:(signal)=>globalThis.readProgressTransport(args,signal)})};` }));
    } }],
  });
  await writeFile(output, result.outputFiles[0].contents);
  return { ui: await import(pathToFileURL(output).href), cleanup: async () => {
    for (const key of ['progressQueryClient', 'progressQueryState', 'progressQueryOptions', 'sendCycle', 'readProgressTransport']) delete globalThis[key];
    await rm(temporary, { recursive: true, force: true });
  } };
}
