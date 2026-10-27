import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
export async function managerUIRuntime() {
  const repo=resolve('.');
  const folder=join(repo,'modules/gestor/gestao/tecnicos/detalhes/components/financeiro');
  const temporary=await mkdtemp(join(tmpdir(),'manager-cycle-ui-'));
  const output=join(temporary,'bundle.mjs');
  const result=await build({
    stdin:{contents:`
      export {default as React} from 'react';
      export {renderToStaticMarkup} from 'react-dom/server';
      export * from '${folder}/financial-row-isolation.ts';
      export * from '${folder}/matricula-tecnica-ciclo-manual.parser.ts';
      export * from '${folder}/matricula-tecnica-ciclo-manual.service.ts';
      export * from '${repo}/modules/shared/financeiro/matricula/selectors.ts';
      export * from '${repo}/modules/shared/financeiro/matricula/parser.ts';
      export {default as Choice} from '${folder}/FinanceiroManagerCycleChoice.tsx';
      export {default as Status} from '${folder}/FinanceiroCicloManualStatus.tsx';
      export {default as Dialog} from '${folder}/FinanceiroCicloManualDialog.tsx';
      `,resolveDir:repo,loader:'tsx'},
    bundle:true,write:false,platform:'node',format:'esm',
    banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"},
    alias:{'@':repo},plugins:[{name:'isolated-no-network',setup(builder){
      builder.onResolve({filter:/hooks\/useMatriculaTecnicaCicloManual$/},()=>({path:'preview',namespace:'fixture-hook'}));
      builder.onLoad({filter:/.*/,namespace:'fixture-hook'},()=>({contents:`
        export const usePreviewCicloFinanceiroTecnicoManual=(input,enabled)=>{
          globalThis.lastPreviewInput=input;globalThis.lastPreviewEnabled=enabled;
          return {data:null,isPlaceholderData:false,isFetching:false,isError:false,isLoading:false};
        };`}));
      builder.onResolve({filter:/lib\/supabase$/},()=>({path:'transport',namespace:'fixture-transport'}));
      builder.onLoad({filter:/.*/,namespace:'fixture-transport'},()=>({contents:`
        export const supabase={rpc:async(...args)=>{
          globalThis.rpcCalls.push(args);
          return globalThis.managerSQLRpc ? globalThis.managerSQLRpc(...args)
            : {data:globalThis.rpcResponse,error:null};
        },functions:{invoke:async(...args)=>{
          globalThis.invokeCalls.push(args);return {data:globalThis.invokeResponse,error:null};
        }}};`}));
    }}],
  });
  await writeFile(output,result.outputFiles[0].contents);
  globalThis.rpcCalls=[];globalThis.invokeCalls=[];
  return {ui:await import(pathToFileURL(output).href),cleanup:async()=>{
    for(const key of ['managerSQLRpc','rpcCalls','invokeCalls','rpcResponse','invokeResponse','lastPreviewInput','lastPreviewEnabled']) delete globalThis[key];
    await rm(temporary,{recursive:true,force:true});
  }};
}
