import type { NfseScope } from '../../types/nfse.types';
import { assertScope, boolean, oneOf, record, string } from '../nfse.validation';
import { NfseContractError, NfseUnavailableError } from '../nfse.errors';
import { NFSE_CONFIGURATION_ENABLED } from './configuration.service';
import { certificateUploadError } from './certificate-upload.errors';

/** Call directly from the form: never put credential inputs into mutation/query caches. */
export async function uploadNfseCertificate(scope: NfseScope,file: File,password: string,requestId: string) {
  assertScope(scope);
  if (!NFSE_CONFIGURATION_ENABLED) throw new NfseUnavailableError();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new NfseContractError();
  if (file.size<1 || file.size>128*1024 || !/\.(pfx|p12)$/i.test(file.name)) {
    throw new Error('Selecione um arquivo PFX/P12 válido, com até 128 KB.');
  }
  if (password.length>1024) throw new Error('A senha excede o limite de 1.024 caracteres.');
  const form=new FormData(); form.append('certificate',file); form.append('password',password);
  const {supabase}=await import('../../../../../lib/supabase');
  const {data,error}=await supabase.functions.invoke('nfse-certificate-upload',{body:form,headers:{
    'x-nfse-context':scope.contextKey,'x-nfse-polo':scope.poloId,'x-nfse-environment':scope.environment,
    'x-nfse-month':scope.month,'x-request-id':requestId,
  }});
  if (error) throw await certificateUploadError(error);
  const response=record(data);
  if (!boolean(response.configured) || response.chainVerified!==true || response.representationVerified!==false) throw new NfseContractError();
  const expiresAt=string(response.expiresAt);
  if (!Number.isFinite(Date.parse(expiresAt))) throw new NfseContractError();
  return {configured:true,expiresAt,readiness:oneOf(response.readiness,['BLOCKED']),
    revocationStatus:oneOf(response.revocationStatus,['UNKNOWN'])};
}

