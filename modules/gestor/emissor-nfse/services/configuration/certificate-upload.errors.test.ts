import assert from 'node:assert/strict';
import test from 'node:test';
import { certificateUploadError } from './certificate-upload.errors.ts';

const failure=(error: unknown,status=400)=>({context:new Response(JSON.stringify({error}),{status})});

test('reports trust-store, expiry and CNPJ failures separately from password',async()=>{
  assert.match((await certificateUploadError(failure('ICP_TRUST_STORE_UNAVAILABLE',503))).message,/cadeia de confiança configurada/);
  assert.match((await certificateUploadError(failure('CERTIFICATE_EXPIRED_OR_NOT_YET_VALID'))).message,/vencido/);
  assert.match((await certificateUploadError(failure('CERTIFICATE_CNPJ_MISMATCH'))).message,/CNPJ/);
  assert.match((await certificateUploadError(failure('INVALID_PFX_PASSWORD_OR_DATA'))).message,/abrir o arquivo/);
});

test('unknown and malformed responses never expose raw secret-bearing text',async()=>{
  const marker='SYNTHETIC-SECRET-MUST-NOT-APPEAR';
  const inputs=[failure(marker),failure('__proto__'),{message:marker},
    {context:new Response(marker,{status:500})},failure({password:marker}),null];
  for(const input of inputs){
    const result=await certificateUploadError(input);
    assert.ok(result instanceof Error);
    assert.doesNotMatch(result.message,new RegExp(marker));
    assert.match(result.message,/não confirma senha incorreta/);
  }
});

test('maps only safe gateway status and keeps unknown outcomes explicit',async()=>{
  assert.match((await certificateUploadError(failure('unknown',401))).message,/sessão/);
  assert.match((await certificateUploadError(failure('unknown',404))).message,/indisponível/);
  assert.match((await certificateUploadError(failure('unknown',429))).message,/um minuto/);
  assert.match((await certificateUploadError(failure('unknown',504))).message,/Atualize a situação/);
});
