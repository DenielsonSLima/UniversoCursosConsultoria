import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'rejected-fee-tests-'));
const tests=['supabase/functions/technical-rejected-fee-correction/contract.test.ts',
 'supabase/functions/technical-rejected-fee-correction/adapter.test.ts',
 'supabase/functions/technical-rejected-fee-correction/ambiguous-recovery.test.ts',
 'supabase/functions/technical-manual-cycle-issuance/claim-recovery-integration.test.ts'];
try {
 const built=[];
 for(const [index,entry] of tests.entries()) {
 const outfile=join(directory,`${index}.test.mjs`);
 await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',alias:{'npm:qrcode@1.5.4':'qrcode'},
 banner:{js:"import nodeTest from 'node:test';import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);const Deno={test:nodeTest};"}});
 built.push(outfile);
 }
 const result=spawnSync(process.execPath,['--test','supabase/tests/rejected-fee-correction.isolated.test.mjs',...built],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{await rm(directory,{recursive:true,force:true});}
