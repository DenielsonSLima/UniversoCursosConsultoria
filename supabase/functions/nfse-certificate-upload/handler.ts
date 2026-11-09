import { CertificateError, inspectPkcs12, MAX_PFX_BYTES, type ParsedCertificate } from './certificate.ts';

interface UploadScope { actorId: string; credentialPoloId: string; cnpj: string; configurationVersion: number }
export interface UploadIntent { contextId: string; poloId: string; environment: string; month: string; requestId: string }
export interface CertificateUploadDependencies {
  authorize(req: Request,intent: UploadIntent): Promise<UploadScope>;
  trustAnchors(): string[];
  store(intent: UploadIntent,scope: UploadScope,certificate: ParsedCertificate): Promise<unknown>;
  rateLimited(req: Request): boolean;
  respond(req: Request,body: unknown,status: number): Response;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES=MAX_PFX_BYTES+8192;

async function boundedBody(req: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(req.headers.get('content-length'))>MAX_BODY_BYTES || !req.body) throw new CertificateError('INVALID_UPLOAD_SIZE');
  const reader=req.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
  try {
    for (;;) {
      const {value,done}=await reader.read(); if (done) break;
      size+=value.length;
      if (size>MAX_BODY_BYTES) throw new CertificateError('INVALID_UPLOAD_SIZE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const body=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) {body.set(chunk,offset); offset+=chunk.length;}
  return body;
}

/** Credential data lives only in request memory and the privileged Vault writer. */
export function createCertificateUploadHandler(deps: CertificateUploadDependencies) {
  return async (req: Request) => {
    if (req.method!=='POST') return deps.respond(req,{error:'METHOD_NOT_ALLOWED'},405);
    if (deps.rateLimited(req)) return deps.respond(req,{error:'RATE_LIMITED'},429);
    let bytes: Uint8Array | undefined;
    let uploadedBody: Uint8Array | undefined;
    try {
      const intent={contextId:req.headers.get('x-nfse-context') || '',poloId:req.headers.get('x-nfse-polo') || '',
        environment:req.headers.get('x-nfse-environment') || '',month:req.headers.get('x-nfse-month') || '',
        requestId:req.headers.get('x-request-id') || ''};
      if (![intent.contextId,intent.poloId,intent.requestId].every(value=>uuid.test(value))
        || !['HOMOLOGACAO','PRODUCAO'].includes(intent.environment)
        || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(intent.month)) throw new CertificateError('INVALID_UPLOAD_SCOPE');
      // Authenticate and authorize before reading/decrypting any uploaded material.
      const scope=await deps.authorize(req,intent);
      const anchors=deps.trustAnchors();
      if (!anchors.length) return deps.respond(req,{error:'ICP_TRUST_STORE_UNAVAILABLE'},503);
      const type=req.headers.get('content-type') || '';
      if (!/^multipart\/form-data;\s*boundary=/i.test(type)) throw new CertificateError('MULTIPART_REQUIRED');
      const body=await boundedBody(req);
      uploadedBody=body;
      const form=await new Response(body,{headers:{'content-type':type}}).formData();
      if ([...form.keys()].some(key=>!['certificate','password'].includes(key))
        || form.getAll('certificate').length!==1 || form.getAll('password').length!==1) throw new CertificateError('INVALID_UPLOAD_FIELDS');
      const file=form.get('certificate'); const password=form.get('password');
      if (!(file instanceof File) || typeof password!=='string' || password.length>1024
        || !/\.(pfx|p12)$/i.test(file.name) || file.size<1 || file.size>MAX_PFX_BYTES
        || !['','application/x-pkcs12','application/pkcs12','application/octet-stream'].includes(file.type)) {
        throw new CertificateError('INVALID_PFX_UPLOAD');
      }
      bytes=new Uint8Array(await file.arrayBuffer());
      const parsed=inspectPkcs12(bytes,password,anchors);
      if (parsed.metadata.cnpj!==scope.cnpj) throw new CertificateError('CERTIFICATE_CNPJ_MISMATCH');
      const result=await deps.store(intent,scope,parsed);
      if (!result || typeof result!=='object' || Array.isArray(result)) throw new CertificateError('INVALID_STORE_RESPONSE');
      const metadata=result as Record<string,unknown>;
      if (metadata.configured!==true || metadata.chainVerified!==true || metadata.representationVerified!==false
        || metadata.revocationStatus!=='UNKNOWN' || metadata.readiness!=='BLOCKED'
        || typeof metadata.expiresAt!=='string' || !Number.isFinite(Date.parse(metadata.expiresAt))) {
        throw new CertificateError('INVALID_STORE_RESPONSE');
      }
      return deps.respond(req,{configured:true,expiresAt:metadata.expiresAt,chainVerified:true,
        revocationStatus:'UNKNOWN',representationVerified:false,readiness:'BLOCKED'},200);
    } catch(error) {
      return deps.respond(req,{error:error instanceof CertificateError?error.code:'UPLOAD_NOT_AUTHORIZED_OR_UNAVAILABLE'},
        error instanceof CertificateError?400:403);
    } finally {bytes?.fill(0); uploadedBody?.fill(0);}
  };
}
