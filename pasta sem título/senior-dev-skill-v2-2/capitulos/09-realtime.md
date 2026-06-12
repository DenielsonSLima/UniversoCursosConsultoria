# Capítulo 07 — Cache Inteligente, Estado e Realtime

> *"ERP não carrega tudo toda vez. Ele pré-carrega dados críticos, mantém cache quente, sincroniza em background, e só faz hard refetch quando necessário."*

---

## O Problema do Fetch Ingênuo

Sem estratégia de cache, todo módulo faz uma requisição ao servidor sempre que o usuário abre. Em 50 usuários simultâneos:

```
50 usuários × 5 módulos × cada troca de tela = centenas de requisições/minuto
→ Throttling do servidor
→ UI travando esperando respostas
→ Experiência ruim
→ Custo de servidor desnecessário
```

---

## O Modelo Correto: Stale-While-Revalidate

```
1ª vez que abre o módulo:
  → Busca do servidor
  → Armazena no cache
  → Exibe na UI

2ª vez (dentro do staleTime):
  → Retorna do cache IMEDIATAMENTE (0ms de latência)
  → Em background: verifica se há dados novos
  → Se houver: atualiza silenciosamente

Após o staleTime:
  → Marca o cache como "stale"
  → Próximo acesso: retorna cache + dispara revalidação
```

---

## TanStack Query — Configuração Padrão

### Setup Global

```typescript
// File: src/lib/query-client.ts

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutos antes de considerar "stale"
      gcTime: 10 * 60 * 1000,        // 10 minutos no cache após não ser usado
      retry: 2,                       // Tentar 2 vezes em caso de falha
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000), // Backoff exponencial
      refetchOnWindowFocus: false,    // Não refetch ao voltar para a aba (Realtime cuida disso)
      refetchOnReconnect: true,       // Refetch ao reconectar à internet
    },
    mutations: {
      retry: 0,                       // Mutações não repetem (podem duplicar dados)
    }
  }
})
```

### Query Keys — Organização Hierárquica

```typescript
// File: src/lib/query-keys.ts
// Query keys organizadas hierarquicamente para invalidação precisa

export const queryKeys = {
  // Clientes
  clientes: {
    all: ['clientes'] as const,
    list: (orgId: string) => ['clientes', orgId, 'list'] as const,
    detail: (id: string) => ['clientes', id] as const,
  },
  
  // Financeiro
  financeiro: {
    extrato: (contaId: string, periodo: string) => 
      ['financeiro', 'extrato', contaId, periodo] as const,
    saldo: (contaId: string) => 
      ['financeiro', 'saldo', contaId] as const,
    titulos: {
      all: ['financeiro', 'titulos'] as const,
      apagar: (orgId: string) => ['financeiro', 'titulos', orgId, 'apagar'] as const,
      areceber: (orgId: string) => ['financeiro', 'titulos', orgId, 'areceber'] as const,
    }
  },
  
  // Vendas
  vendas: {
    all: (orgId: string) => ['vendas', orgId] as const,
    detail: (id: string) => ['vendas', id] as const,
    dashboard: (orgId: string, periodo: string) => 
      ['vendas', orgId, 'dashboard', periodo] as const,
  }
}
```

---

## Hooks com TanStack Query

### Hook de Listagem

```typescript
// File: src/modules/clientes/clientes.hooks.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { clienteService } from './clientes.service'
import { useOrganization } from '@/lib/hooks/useOrganization'

export function useClientes() {
  const { organizationId } = useOrganization()
  
  return useQuery({
    queryKey: queryKeys.clientes.list(organizationId),
    queryFn: () => clienteService.getAll(organizationId),
    staleTime: 5 * 60 * 1000,
    enabled: !!organizationId, // Só executa se tiver organization_id
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: queryKeys.clientes.detail(id),
    queryFn: () => clienteService.getById(id),
    enabled: !!id,
  })
}
```

### Hook de Mutação com Invalidação

```typescript
export function useCreateCliente() {
  const queryClient = useQueryClient()
  const { organizationId } = useOrganization()
  
  return useMutation({
    mutationFn: clienteService.create,
    onSuccess: (novoCliente) => {
      // Invalidação precisa: apenas a lista de clientes desta org
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.list(organizationId)
      })
      
      // Opcionalmente, adicionar ao cache diretamente (evita refetch)
      queryClient.setQueryData(
        queryKeys.clientes.detail(novoCliente.id),
        novoCliente
      )
    },
    onError: (error) => {
      // Log do erro para monitoramento
      console.error('Erro ao criar cliente:', error)
    }
  })
}

export function useDeleteCliente() {
  const queryClient = useQueryClient()
  const { organizationId } = useOrganization()
  
  return useMutation({
    mutationFn: clienteService.delete,
    onMutate: async (clienteId) => {
      // Cancelar queries pendentes para evitar conflito
      await queryClient.cancelQueries({
        queryKey: queryKeys.clientes.list(organizationId)
      })
      
      // Snapshot para rollback
      const clientesAnteriores = queryClient.getQueryData(
        queryKeys.clientes.list(organizationId)
      )
      
      // Atualização otimista
      queryClient.setQueryData(
        queryKeys.clientes.list(organizationId),
        (old: Cliente[]) => old?.filter(c => c.id !== clienteId) ?? []
      )
      
      return { clientesAnteriores }
    },
    onError: (err, clienteId, context) => {
      // Rollback em caso de erro
      if (context?.clientesAnteriores) {
        queryClient.setQueryData(
          queryKeys.clientes.list(organizationId),
          context.clientesAnteriores
        )
      }
    },
    onSettled: () => {
      // Sempre revalidar após a operação
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.list(organizationId)
      })
    }
  })
}
```

---

## Realtime — Sincronização Automática Entre Usuários

### O Problema Sem Realtime

```
Usuário A cria um cliente → banco atualizado
Usuário B está na mesma tela → não vê o novo cliente até dar F5

Em um ERP, isso é inaceitável.
```

### A Solução Correta: Realtime + Invalidação de Cache

```typescript
// File: src/modules/clientes/clientes.realtime.ts

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { useOrganization } from '@/lib/hooks/useOrganization'

export function useClientesRealtime() {
  const queryClient = useQueryClient()
  const { organizationId } = useOrganization()
  
  useEffect(() => {
    if (!organizationId) return
    
    const channel = supabase
      .channel(`clientes-${organizationId}`) // Canal por organização
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'clientes',
          filter: `organization_id=eq.${organizationId}` // ← CRÍTICO: filtrar por org
        },
        (payload) => {
          // Estratégia 1: Atualização cirúrgica do cache (mais eficiente)
          if (payload.eventType === 'INSERT') {
            queryClient.setQueryData(
              queryKeys.clientes.list(organizationId),
              (old: Cliente[] = []) => [payload.new as Cliente, ...old]
            )
          } else if (payload.eventType === 'UPDATE') {
            queryClient.setQueryData(
              queryKeys.clientes.list(organizationId),
              (old: Cliente[] = []) => old.map(c => 
                c.id === payload.new.id ? { ...c, ...payload.new } : c
              )
            )
          } else if (payload.eventType === 'DELETE') {
            queryClient.setQueryData(
              queryKeys.clientes.list(organizationId),
              (old: Cliente[] = []) => old.filter(c => c.id !== payload.old.id)
            )
          }
        }
      )
      .subscribe()
    
    // Cleanup: SEMPRE cancelar a subscription quando o componente desmontar
    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, queryClient])
}
```

### Uso no Componente

```tsx
// File: src/modules/clientes/clientes.page.tsx

export default function ClientesPage() {
  // Configura realtime para este módulo
  useClientesRealtime()
  
  // O resto da página funciona normalmente
  const { clientes, isLoading } = useClientes()
  // ...
}
```

---

## Reconexão Automática e Resiliência

```typescript
// Lidar com desconexões do WebSocket
export function useRealtimeResilience() {
  const queryClient = useQueryClient()
  
  useEffect(() => {
    const channel = supabase
      .channel('system-health')
      .on('system', { event: 'RECONNECT' }, () => {
        console.log('[Realtime] Reconectado — invalidando cache...')
        // Invalida TUDO para garantir sincronização após reconexão
        queryClient.invalidateQueries()
      })
      .subscribe()
    
    return () => supabase.removeChannel(channel)
  }, [queryClient])
}
```

---

## Bootstrapping — Carregamento Inicial Otimizado

```typescript
// Em vez de N requisições paralelas na inicialização:
// ❌ INEFICIENTE
const { data: user } = useQuery({ queryFn: getUser })
const { data: org } = useQuery({ queryFn: getOrganization })
const { data: permissions } = useQuery({ queryFn: getPermissions })
const { data: config } = useQuery({ queryFn: getConfig })
// → 4 round-trips ao servidor

// ✅ EFICIENTE: Uma única Edge Function de bootstrap
// supabase/functions/bootstrap/index.ts retorna tudo de uma vez
const { data: appData } = useQuery({
  queryKey: ['bootstrap', organizationId],
  queryFn: () => supabase.functions.invoke('bootstrap', {
    body: { organization_id: organizationId }
  }),
  staleTime: 10 * 60 * 1000, // Bootstrap cacheado por 10 minutos
})
// → 1 round-trip, dados completos
```

---

## Perguntas de Revisão — Cache e Realtime

- [ ] Existe um `staleTime` definido para cada tipo de dado baseado na frequência de mudança?
- [ ] As query keys são hierárquicas e permitem invalidação precisa?
- [ ] As subscriptions Realtime filtram por `organization_id`?
- [ ] O `useEffect` do Realtime tem cleanup (`return () => supabase.removeChannel(channel)`)?
- [ ] Existe lógica de reconexão que invalida o cache após desconexão?
- [ ] A inicialização da aplicação usa uma Edge Function de bootstrap para evitar múltiplos requests?
- [ ] As mutações invalidam apenas as queries relevantes (não `invalidateQueries()` global sem necessidade)?
- [ ] Operações críticas têm atualização otimista com rollback?

---

*Próximo capítulo: [14-typescript-padroes.md](./14-typescript-padroes.md)*
