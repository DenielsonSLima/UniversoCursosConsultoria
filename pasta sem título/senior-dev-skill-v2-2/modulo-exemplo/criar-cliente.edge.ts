// supabase/functions/criar-cliente/index.ts
//
// ✅ REGRA #2 — service_role apenas aqui, nunca no frontend
// ✅ REGRA #6 — validação Zod na entrada
// ✅ Verifica JWT (autenticação) + organização (autorização)
// ✅ Retorna erros com HTTP codes corretos e mensagem amigável
// ✅ Sem stack trace na resposta — apenas no log do servidor

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ─── Schema de Validação (Zod) ────────────────────────────────────────────

const CreateClienteSchema = z.object({
  nome:     z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  email:    z.string().email('E-mail inválido'),
  telefone: z.string().regex(/^\+?[\d\s\-()]{8,}$/, 'Telefone inválido').optional(),
});

// ─── Helpers de Resposta ──────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const error = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: code, message, ...(details ? { details } : {}) }, status);

// ─── Handler Principal ────────────────────────────────────────────────────

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ─── 1. Autenticação — quem está chamando? ───────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return error('UNAUTHORIZED', 'Token de autenticação obrigatório', 401);

    // Cliente com service_role (acesso admin) — NUNCA exposto ao frontend
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // ← server-side only
    );

    // Verifica o JWT do usuário
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) return error('UNAUTHORIZED', 'Token inválido ou expirado', 401);

    // ─── 2. Autorização — usuário tem organização ativa? ─────────────────
    const { data: membro } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .single();

    if (!membro) return error('FORBIDDEN', 'Usuário sem organização ativa', 403);
    if (!['admin', 'membro'].includes(membro.role)) {
      return error('FORBIDDEN', 'Permissão insuficiente para criar clientes', 403);
    }

    // ─── 3. Validação — dados de entrada corretos? (Zod) ─────────────────
    const body = await req.json().catch(() => null);
    if (!body) return error('VALIDATION_ERROR', 'Body inválido ou ausente', 400);

    const parsed = CreateClienteSchema.safeParse(body);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten().fieldErrors);
    }

    const { nome, email, telefone } = parsed.data;

    // ─── 4. Regra de negócio — email já cadastrado na organização? ────────
    const { data: existente } = await supabaseAdmin
      .from('clientes')
      .select('id')
      .eq('organization_id', membro.organization_id)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existente) {
      return error('CONFLICT', 'Já existe um cliente com este e-mail nesta organização', 409);
    }

    // ─── 5. Persistência — organização_id vem do servidor, não do body ───
    const { data: cliente, error: insertError } = await supabaseAdmin
      .from('clientes')
      .insert({
        organization_id: membro.organization_id, // ← SEMPRE do servidor
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone?.trim() ?? null,
        ativo: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // ─── 6. Resposta de sucesso ───────────────────────────────────────────
    return json(cliente, 201);

  } catch (err) {
    // Log estruturado no servidor (sem expor ao cliente)
    console.error(JSON.stringify({
      function: 'criar-cliente',
      error: err instanceof Error ? err.message : 'unknown',
      timestamp: new Date().toISOString(),
    }));

    // Mensagem genérica ao cliente
    return error('INTERNAL_ERROR', 'Erro interno. Tente novamente em alguns segundos.', 500);
  }
});
