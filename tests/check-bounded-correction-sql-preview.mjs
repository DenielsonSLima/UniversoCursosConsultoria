// Validate actual authenticated SQL-preview JSON through the shipping UI and Edge parsers.
// Usage: node tests/check-bounded-correction-sql-preview.mjs preview.json operationId matriculaId turmaId poloId
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [inputPath,operationId,matriculaId,turmaId,poloId]=process.argv.slice(2);
if(!inputPath||!operationId||!matriculaId||!turmaId||!poloId) throw Error('Provide actual SQL preview JSON and independently known operation/enrollment/class/polo IDs.');
const bundle=async(entry,name)=>{
  const outfile=resolve(`tmp/${name}.mjs`);
  await build({entryPoints:[entry],outfile,bundle:true,format:'esm',platform:'node'});
  return import(pathToFileURL(outfile));
};
const edge=await bundle('supabase/functions/technical-manual-cycle-issuance/bounded-correction-context.ts','actual-sql-preview-edge');
const ui=await bundle('modules/gestor/gestao/tecnicos/detalhes/components/financeiro/bounded-correction.ts','actual-sql-preview-ui');
const preview=JSON.parse(readFileSync(inputPath,'utf8'));
const parsedUi=ui.parseCorrectionPreview(preview);
const context=edge.parseBoundedCorrectionContext(preview,
  {action:'resume',matriculaId,cicloNumero:1,correctionOperationId:operationId},
  {matriculaId,turmaId,poloId});
assert.equal(context.requestId,preview.cycleContext.requestId);
assert.equal(parsedUi.consent.requestId,context.boundedCorrection.consentRequestId);
assert.deepEqual(context.ciclo.recebiveis.map(r=>r.id),preview.installments.map(r=>r.id));
assert.equal(context.ciclo.recebiveis.length,12);
console.log('PASS: actual SQL preview parses in UI and Edge, preserving canonical original C1 request and 12 receipt identities. No bank action performed.');
