import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readWorkerSecret } from '../_shared/worker-secret-read.ts';
import { safeEqual } from '../banese-reconciliation-worker/request-guards.ts';
import { cancelAuthorizedPdvTitle } from './service.ts';
import { reissueCanceledPdvTitle } from './reissue.ts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secret = await readWorkerSecret(admin, 'get_banese_reconciliation_worker_secret', { minimumLength: 32 });
  if (!secret.ok || !safeEqual(req.headers.get('X-Banese-Worker-Token') || '', secret.secret.trim())) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }
  try {
    const text = await req.text();
    if (text.length > 200) return json({ error: 'BODY' }, 400);
    const body = JSON.parse(text);
    if (Object.keys(body).length !== 1 || !/^[0-9a-f-]{36}$/.test(body.receivableId)) return json({ error: 'BODY' }, 400);
    const canceled = await cancelAuthorizedPdvTitle(admin, body.receivableId);
    return json(canceled.state === 'CANCELED'
      ? await reissueCanceledPdvTitle(admin, body.receivableId) : canceled);
  } catch {
    // A timeout remains fenced and can only resume the same title. No new POST.
    return json({ error: 'PDV_CANCELLATION_REQUIRES_REVIEW' }, 409);
  }
});
