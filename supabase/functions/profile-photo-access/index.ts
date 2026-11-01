import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from '../_shared/http.ts';
import { signPublicDocumentPhoto } from './access.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, request);
  if (isRateLimitExceeded(`profile-photo-access:${getClientIp(request)}`, 30, 60_000)) {
    return json({ error: 'Aguarde antes de consultar novamente.' }, 429, request);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Serviço indisponível.' }, 503, request);
  try {
    const body = await request.text();
    if (body.length > 4096) return json({ error: 'Solicitação inválida.' }, 400, request);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await signPublicDocumentPhoto(admin, JSON.parse(body));
    if (!result) return json({ error: 'Foto documental indisponível.' }, 404, request);
    return json(result, 200, request);
  } catch {
    // Código, caminho, conteúdo pessoal e URLs assinadas nunca entram no log.
    return json({ error: 'Foto documental indisponível.' }, 404, request);
  }
});
