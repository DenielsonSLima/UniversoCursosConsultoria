import type { NfseScope } from '../../types/nfse.types';
import { assertScope, boolean, oneOf, record, string } from '../nfse.validation';
import { NfseContractError, NfseUnavailableError } from '../nfse.errors';
import { NFSE_CONFIGURATION_ENABLED } from './configuration.service';

/** Call directly from the form: never put credential inputs into mutation/query caches. */
export async function uploadNfseCertificate(scope: NfseScope,file: File,password: string,requestId: string) {
  assertScope(scope);
  if (!NFSE_CONFIGURATION_ENABLED) throw new NfseUnavailableError();
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || file.size<1 || file.size>128*1024
    || !/\.(pfx|p12)$/i.test(file.name) || password.length>1024) throw new NfseContractError();
  const form=new FormData(); form.append('certificate',file); form.append('password',password);
  const {supabase}=await import('../../../../../lib/supabase');
  const {data,error}=await supabase.functions.invoke('nfse-certificate-upload',{body:form,headers:{
    'x-nfse-context':scope.contextKey,'x-nfse-polo':scope.poloId,'x-nfse-environment':scope.environment,
    'x-nfse-month':scope.month,'x-request-id':requestId,
  }});
  if (error) throw new Error('Não foi possível cadastrar o certificado. Confira arquivo, senha e disponibilidade do acesso.');
  const response=record(data);
  if (!boolean(response.configured) || response.chainVerified!==true || response.representationVerified!==false) throw new NfseContractError();
  return {configured:true,expiresAt:string(response.expiresAt),readiness:oneOf(response.readiness,['BLOCKED']),
    revocationStatus:oneOf(response.revocationStatus,['UNKNOWN'])};
}
