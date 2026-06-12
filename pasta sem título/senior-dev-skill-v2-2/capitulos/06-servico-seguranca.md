# Capítulo 04 — Camada de Serviço, Edge Functions e Segurança

> *"O backend é o porteiro rigoroso. Ele verifica tudo, confia em nada, e protege o banco de dados como um cofre."*

---

## Estrutura de uma Edge Function Bem Escrita

```typescript
// File: supabase/functions/processar-pagamento/index.ts

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'

// 1. SCHEMA DE VALIDAÇÃO (nunca confie no frontend)
const PagamentoSchema = z.object({
  titulo_id: z.string().uuid(),
  valor: z.number().positive(),
  conta_origem_id: z.string().uuid(),
})

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    // 2. AUTENTICAÇÃO
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'UNAUTHORIZED' }, 401)

    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return json({ error: 'UNAUTHORIZED' }, 401)

    // 3. VALIDAÇÃO DOS DADOS
    const body = await req.json()
    const parseResult = PagamentoSchema.safeParse(body)
    if (!parseResult.success) {
      return json({ error: 'VALIDATION_ERROR', details: parseResult.error.errors }, 400)
    }

    // 4. LÓGICA DE NEGÓCIO (service_role APENAS aqui dentro)
    const supabaseAdmin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error: dbError } = await supabaseAdmin.rpc('processar_pagamento', {
      ...parseResult.data, p_user_id: user.id
    })

    if (dbError) {
      if (dbError.message.includes('SALDO_INSUFICIENTE')) return json({ error: 'SALDO_INSUFICIENTE' }, 409)
      throw dbError
    }

    // 5. LOGGING DE AUDITORIA
    console.log(JSON.stringify({ event: 'pagamento_processado', user_id: user.id, ...parseResult.data }))

    return json({ success: true, ...data }, 200)

  } catch (err) {
    console.error('Erro:', err)
    return json({ error: 'INTERNAL_ERROR' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
  })
}
```

---

## Regras Absolutas de Segurança

### R02 — service_role NUNCA vai ao frontend

```typescript
// ❌ CATASTRÓFICO — Com essa chave, RLS é ignorado, sistema todo comprometido
const supabase = createClient(url, process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY!)

// ✅ CORRETO — Frontend usa apenas anon key (RLS se aplica normalmente)
const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
```

### R08 — Endpoints por funcionalidade, não por tabela

```
❌ ERRADO:     POST /lancamentos | GET /contas | PUT /clientes/{id}
✅ CORRETO:    POST /processar-pagamento | GET /extrato-financeiro | PUT /atualizar-cliente
```

### R06 — Validação Agressiva com Zod

```typescript
const CriarClienteSchema = z.object({
  nome: z.string().min(2).max(200).trim(),
  email: z.string().email().toLowerCase(),
  documento: z.string().regex(/^\d{11}$|^\d{14}$/),
  organization_id: z.string().uuid(),
  limite_credito: z.number().min(0).max(1_000_000).optional().default(0),
})
```

---

## Tratamento de Erros HTTP Correto

| Situação | Status | Código |
|---|---|---|
| Dados inválidos (schema) | `400` | `VALIDATION_ERROR` |
| Não autenticado | `401` | `UNAUTHORIZED` |
| Sem permissão | `403` | `FORBIDDEN` |
| Não encontrado | `404` | `NOT_FOUND` |
| Conflito de estado | `409` | `SALDO_INSUFICIENTE`, etc. |
| Erro interno | `500` | `INTERNAL_ERROR` |

---

## Checklist — Camada de Serviço

- [ ] Edge Function valida dados com Zod antes de qualquer operação?
- [ ] Autenticação é verificada antes da lógica de negócio?
- [ ] `service_role` key está apenas no servidor?
- [ ] Endpoints refletem funcionalidades de negócio, não tabelas CRUD?
- [ ] Erros HTTP têm status codes corretos?
- [ ] Eventos sensíveis têm logs de auditoria estruturados?
- [ ] Edge Function trata todos os caminhos possíveis de erro?

---

## Perguntas de Revisão

1. Um dev colocou `SUPABASE_SERVICE_ROLE_KEY` em `.env` com prefixo `VITE_`. Qual é o risco?
   → O Vite expõe variáveis `VITE_*` no bundle do frontend. Qualquer usuário pode abrir o DevTools e ver a chave. Com `service_role`, qualquer um teria acesso total ao banco ignorando RLS.

2. Qual a diferença entre autenticação e autorização na prática desta Edge Function?
   → Autenticação: `getUser()` retornou usuário válido (JWT ok). Autorização: esse usuário pertence à organização do recurso que está tentando acessar.

3. Uma Edge Function não usa Zod mas valida os dados com `if (!body.valor)`. É suficiente?
   → Não. Zod garante tipo, formato, range e presença em uma única passagem. A validação manual costuma ter lacunas — por exemplo, `!body.valor` passa para `valor = 0`, que é inválido para um lançamento financeiro.

4. Um agente gerou uma Edge Function que retorna `500` com `error: error.message`. O que está errado?
   → `error.message` pode conter informação interna (nome de tabela, stack trace, query SQL). Retorne mensagem genérica ao cliente e logue o detalhe no servidor.

5. Por que endpoints devem ser nomeados por funcionalidade de negócio e não por tabela CRUD?
   → `POST /criar-lancamento` encapsula toda a lógica (validação, atomicidade, RLS). `POST /lancamentos` sugere um CRUD simples e convida o desenvolvedor a "só inserir uma linha", pulando toda a proteção.

*Próximo capítulo: [07-banco-dados.md](./07-banco-dados.md)*
