import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from '../_shared/http.ts';
import { createCertificateUploadHandler } from './handler.ts';
import { officialTrustAnchors } from './trust-store.ts';

const handler=createCertificateUploadHandler({
  respond(req,body,status) {
    const response=json(body,status,req);
    response.headers.set('Cache-Control','no-store');
    return response;
  },
  rateLimited:req=>isRateLimitExceeded(`nfse-a1:${getClientIp(req)}`,5,60_000),
  trustAnchors:()=>officialTrustAnchors(Deno.env.get('NFSE_ICP_BRASIL_CA_BUNDLE')),
  async authorize(req,intent) {
    const token=req.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(token)) throw new Error('AUTH_REQUIRED');
    const user=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_ANON_KEY') || '',{
      global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:identity,error:authError}=await user.auth.getUser();
    if (authError || !identity.user) throw new Error('AUTH_REQUIRED');
    const {data,error}=await user.rpc('authorize_nfse_certificate_upload_secure',{
      p_context_key:intent.contextId,p_polo_id:intent.poloId,p_environment:intent.environment,p_month:intent.month,
    });
    if (error || !data || data.actorId!==identity.user.id) throw new Error('SCOPE_DENIED');
    return data;
  },
  async store(intent,scope,certificate) {
    const admin=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data,error}=await admin.rpc('store_nfse_certificate_internal',{
      p_actor_id:scope.actorId,p_context_key:intent.contextId,p_polo_id:intent.poloId,p_environment:intent.environment,
      p_month:intent.month,p_request_id:intent.requestId,p_configuration_version:scope.configurationVersion,
      p_metadata:certificate.metadata,p_material:certificate.material,
    });
    if (error) throw new Error('CERTIFICATE_STORE_DENIED');
    return data;
  },
});

Deno.serve(req=>req.method==='OPTIONS'
  ? new Response('ok',{headers:buildCorsHeaders(req)}) : handler(req));
