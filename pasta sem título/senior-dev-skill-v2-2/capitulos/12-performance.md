# Capítulo 11 — Performance e Otimização

> *"Performance não é uma feature. É a ausência de desperdício. Cada requisição desnecessária, cada dado recalculado, cada bundle carregado sem precisar — é desperdício."*

---

## Os 4 Pilares da Performance em ERP

```
1. CACHE INTELIGENTE   — Nunca buscar o que já foi buscado
2. QUERIES EFICIENTES  — Nunca trazer mais dados do que o necessário
3. REALTIME PRECISO    — Nunca recalcular o que o banco já calculou
4. RENDERIZAÇÃO SMART  — Nunca re-renderizar o que não mudou
```

---

## Pilar 1: Queries Eficientes no Banco

### Índices São Obrigatórios

```sql
-- Toda query de filtro precisa de índice
-- EXPLAIN ANALYZE é seu melhor amigo

-- Verificar se uma query está usando índices:
EXPLAIN ANALYZE
SELECT * FROM clientes
WHERE organization_id = 'org-id'
AND ativo = true
ORDER BY nome;

-- Se aparecer "Seq Scan" em vez de "Index Scan" → CRIE O ÍNDICE

-- Índice composto para filtros comuns:
CREATE INDEX idx_clientes_org_ativo_nome 
    ON clientes(organization_id, ativo, nome);

-- Índice parcial para dados ativos (muito eficiente):
CREATE INDEX idx_clientes_org_ativos 
    ON clientes(organization_id) 
    WHERE ativo = true;
```

### Evitar N+1 Queries

```typescript
// ❌ N+1: Para cada venda, busca o cliente separadamente
const vendas = await getVendas()
for (const venda of vendas) {
  venda.cliente = await getCliente(venda.cliente_id) // N queries!
}

// ✅ JOIN: Uma única query traz tudo
const { data } = await supabase
  .from('vendas')
  .select(`
    id,
    valor,
    data,
    cliente:clientes(id, nome, email)
  `)
  .eq('organization_id', orgId)
```

### Paginação Obrigatória em Listas

```typescript
// ❌ ERRADO: Buscar todos os registros
const { data } = await supabase
  .from('lancamentos')
  .select('*')
  .eq('organization_id', orgId)
// → 100k registros na memória? Isso trava o sistema.

// ✅ CORRETO: Paginação com cursor
const ITENS_POR_PAGINA = 50

const { data, count } = await supabase
  .from('lancamentos')
  .select('*', { count: 'exact' })
  .eq('organization_id', orgId)
  .order('data_transacao', { ascending: false })
  .range(pagina * ITENS_POR_PAGINA, (pagina + 1) * ITENS_POR_PAGINA - 1)
```

---

## Pilar 2: Bootstrap Otimizado

### O Problema das Múltiplas Requisições na Inicialização

```typescript
// ❌ INEFICIENTE: 5 round-trips ao inicializar
const { data: usuario } = useQuery({ queryFn: getUsuario })
const { data: organizacao } = useQuery({ queryFn: getOrganizacao })
const { data: permissoes } = useQuery({ queryFn: getPermissoes })
const { data: configuracoes } = useQuery({ queryFn: getConfiguracoes })
const { data: menuItems } = useQuery({ queryFn: getMenuItems })
// → 5 × latência de rede = UI trava por 500ms+
```

```typescript
// ✅ EFICIENTE: Uma Edge Function de bootstrap
// supabase/functions/bootstrap/index.ts

serve(async (req) => {
  const user = await getAuthenticatedUser(req)
  const orgId = req.headers.get('x-organization-id')
  
  // Uma query consolidada que traz tudo
  const { data } = await supabase.rpc('bootstrap_app', {
    p_user_id: user.id,
    p_org_id: orgId
  })
  
  return json(data)
})
```

```sql
-- RPC de bootstrap que consolida tudo em uma query
CREATE OR REPLACE FUNCTION public.bootstrap_app(
    p_user_id UUID,
    p_org_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'usuario', (
            SELECT row_to_json(u) FROM auth.users u WHERE u.id = p_user_id
        ),
        'organizacao', (
            SELECT row_to_json(o) FROM organizations o WHERE o.id = p_org_id
        ),
        'role', (
            SELECT role FROM organization_members
            WHERE user_id = p_user_id AND organization_id = p_org_id
        ),
        'configuracoes', (
            SELECT row_to_json(c) FROM org_configuracoes c WHERE c.organization_id = p_org_id
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Pilar 3: Debounce e Throttle

```typescript
// File: src/lib/hooks/useDebounce.ts

import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  
  return debouncedValue
}

// Uso em busca com autocomplete
export function BuscaClientes() {
  const [query, setQuery] = useState('')
  const queryDebounced = useDebounce(query, 300) // Espera 300ms após parar de digitar
  
  const { data: resultados } = useQuery({
    queryKey: ['clientes', 'busca', queryDebounced],
    queryFn: () => clienteService.buscar(queryDebounced),
    enabled: queryDebounced.length >= 3, // Mínimo 3 caracteres
  })
  
  return (
    <Input
      value={query}
      onChange={setQuery}
      placeholder="Buscar cliente..."
    />
  )
}
```

---

## Pilar 4: Seleção Precisa de Colunas

```typescript
// ❌ INEFICIENTE: Traz todas as colunas (inclusive arquivos, blobs, textos longos)
const { data } = await supabase
  .from('clientes')
  .select('*') // ← Pode incluir colunas desnecessárias e pesadas

// ✅ EFICIENTE: Só o que você vai usar
const { data: listaClientes } = await supabase
  .from('clientes')
  .select('id, nome, email, documento, ativo') // Apenas para exibir na lista

// Detalhes completos apenas quando abrir o modal de edição
const { data: clienteCompleto } = await supabase
  .from('clientes')
  .select('*')
  .eq('id', clienteId)
  .single()
```

---

## Pilar 5: Realtime Eficiente

```typescript
// ❌ INEFICIENTE: Subscription sem filtro (recebe TODOS os eventos)
const channel = supabase
  .channel('lancamentos')
  .on('postgres_changes', { 
    event: '*', 
    schema: 'public', 
    table: 'lancamentos'
    // Sem filtro → recebe mudanças de TODAS as organizações
  }, handler)

// ✅ EFICIENTE: Filtrar por organização e selecionar apenas colunas necessárias
const channel = supabase
  .channel(`lancamentos-${organizationId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'lancamentos',
    filter: `organization_id=eq.${organizationId}` // ← Crítico para multitenancy
  }, (payload) => {
    // Atualização cirúrgica do cache (não invalidar tudo)
    if (payload.eventType === 'INSERT') {
      queryClient.setQueryData(
        queryKeys.financeiro.extrato(contaId, periodo),
        (old) => [payload.new, ...(old ?? [])]
      )
    }
  })
```

---

## Checklist de Performance

Antes de finalizar qualquer feature:

**Banco de Dados:**
- [ ] As queries usam índices? (verificar com EXPLAIN ANALYZE)
- [ ] As listas têm paginação implementada?
- [ ] As queries selecionam apenas as colunas necessárias?
- [ ] Existe N+1 query que pode ser resolvida com JOIN?

**Frontend:**
- [ ] O carregamento inicial usa bootstrap consolidado?
- [ ] Buscas/filtros têm debounce configurado?
- [ ] O staleTime está configurado adequadamente para cada tipo de dado?
- [ ] As subscriptions Realtime filtram por organization_id?

**Geral:**
- [ ] O que acontece com 1.000 registros? E com 100.000?
- [ ] Existe alguma operação bloqueante da UI que poderia ser assíncrona?
- [ ] O bundle size foi verificado após adicionar novas dependências?

---

## Perguntas de Revisão

1. Uma query retorna 50.000 registros sem paginação e o servidor dá timeout. Qual foi a violação e como corrigir?
   → Regra #7. Adicionar `.range(from, to)` com máximo de 50–100 itens e controle de página no frontend.

2. `EXPLAIN ANALYZE` retornou `Seq Scan` numa tabela com 200.000 linhas. O que isso significa?
   → O banco está varrendo linha por linha sem índice. Adicionar um índice na coluna usada no `WHERE` ou `JOIN` resolverá com `Index Scan` e queries de ms em vez de segundos.

3. Dois componentes diferentes na mesma tela usam `useQuery` com a mesma query key. Quantas chamadas ao banco são feitas?
   → Uma. O TanStack Query deduplica requests com a mesma query key. Essa é uma das principais vantagens sobre `useEffect` + `fetch`.

4. Uma lista de categorias (muda raramente) tem `staleTime: 0`. Qual o impacto?
   → Toda navegação de tela dispara um refetch desnecessário. Com `staleTime: 30 * 60_000` (30 min), o dado em cache é reutilizado e só refetch manual ou expiração limpa o cache.

5. Um agente configurou `supabase.channel('*')` sem filtro de `organization_id`. Qual o risco?
   → O Realtime vai receber eventos de todas as organizações — um usuário da empresa A veria eventos da empresa B em tempo real. Violação da Regra #4.

*Próximo capítulo: [15-checklist-final.md](./15-checklist-final.md)*
