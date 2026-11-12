import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { describePartnerGoogleIdentity, partnerGoogleStatusKey } from './partner-google-status.ts';
const status = { email:'corrected@example.invalid',has_auth_user:true,google_linked:false,google_email:null,linked_at:null };

test('contato corrigido separa cache antigo, inclusive resposta antiga atrasada', async () => {
  const client=new QueryClient();
  const oldKey=partnerGoogleStatusKey('fixture','typo@example.invalid');
  const newKey=partnerGoogleStatusKey('fixture','corrected@example.invalid');
  try {
    client.setQueryData(oldKey,{...status,has_auth_user:false});
    assert.equal(client.getQueryData(newKey),undefined);
    await client.fetchQuery({queryKey:newKey,queryFn:async()=>status});
    client.setQueryData(oldKey,{...status,has_auth_user:false});
    assert.deepEqual(client.getQueryData(newKey),status);
    await client.invalidateQueries({queryKey:['partner-google-identity-status','fixture']});
    assert.equal(client.getQueryState(newKey)?.isInvalidated,true);
  } finally {client.clear();}
});
test('chave normaliza contato, isola alunos e nao expoe identidade interna',()=>{
  assert.deepEqual(partnerGoogleStatusKey('fixture',' USER@Example.invalid '),partnerGoogleStatusKey('fixture','user@example.invalid'));
  assert.notDeepEqual(partnerGoogleStatusKey('other',status.email),partnerGoogleStatusKey('fixture',status.email));
});
test('ausencia Google nao confunde validade do contato com acesso por matricula',()=>{
  assert.match(describePartnerGoogleIdentity(status,'Aluno'),/matrícula e senha é independente/);
  assert.match(describePartnerGoogleIdentity({...status,has_auth_user:false},'Aluno'),/não indica que o e-mail de contato seja inválido/);
  assert.equal(describePartnerGoogleIdentity({...status,google_linked:true,google_email:'google@example.invalid'},'Professor'),'Google vinculado em google@example.invalid.');
});
