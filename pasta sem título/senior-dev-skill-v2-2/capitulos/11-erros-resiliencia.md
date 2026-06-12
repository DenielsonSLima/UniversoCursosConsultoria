# Capítulo 10 — Tratamento de Erros e Resiliência

> *"Um sistema sênior não é aquele que nunca falha. É aquele que falha com graciosidade, se recupera sozinho, e nunca perde dados."*

---

## A Filosofia do Erro

Erros são inevitáveis:
- Rede cai no meio de uma operação
- Banco de dados atinge limite de conexões
- API de terceiro retorna 500
- Usuário fecha a aba durante um pagamento

A questão não é "como evitar erros", mas "o que acontece QUANDO um erro ocorre".

---

## Hierarquia de Tratamento de Erros

```
ERRO OCORRE no banco/backend
         ↓
EDGE FUNCTION captura e categoriza
         ↓
RESPONSE estruturada com código HTTP correto
         ↓
FRONTEND recebe e interpreta o código
         ↓
UI exibe mensagem adequada ao usuário
         ↓
LOG estruturado registra para diagnóstico
```

---

## Erros no Banco de Dados (PostgreSQL)

```sql
-- Erros devem ser nomeados para facilitar o tratamento
CREATE OR REPLACE FUNCTION processar_pagamento(...)
RETURNS JSON AS $$
BEGIN
    -- Verificar saldo
    IF v_saldo < p_valor THEN
        -- Erro nomeado que pode ser capturado na Edge Function
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: saldo=%, solicitado=%', v_saldo, p_valor
            USING ERRCODE = 'P0001'; -- RAISE EXCEPTION customizado
    END IF;
    
    IF v_titulo_status = 'pago' THEN
        RAISE EXCEPTION 'TITULO_JA_PAGO'
            USING ERRCODE = 'P0002';
    END IF;
    
    -- ... operação
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log e re-lança para a Edge Function tratar
        RAISE NOTICE 'Erro em processar_pagamento: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;
```

---

## Erros na Edge Function

```typescript
// File: supabase/functions/_shared/errors.ts

// Mapeamento de erros do banco para respostas HTTP
export const DB_ERROR_MAP: Record<string, { status: number; code: string }> = {
  'SALDO_INSUFICIENTE': { status: 409, code: 'SALDO_INSUFICIENTE' },
  'TITULO_JA_PAGO': { status: 409, code: 'TITULO_JA_PAGO' },
  'CONTA_NAO_ENCONTRADA': { status: 404, code: 'CONTA_NAO_ENCONTRADA' },
  'ACESSO_NEGADO': { status: 403, code: 'FORBIDDEN' },
  'VALOR_INVALIDO': { status: 400, code: 'VALIDATION_ERROR' },
}

export function handleDatabaseError(error: Error): Response {
  // Verificar se é um erro nomeado do banco
  for (const [key, response] of Object.entries(DB_ERROR_MAP)) {
    if (error.message.includes(key)) {
      return new Response(
        JSON.stringify({ error: response.code, message: error.message }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
  
  // Erro inesperado do banco
  console.error('[DB_ERROR]', error.message)
  return new Response(
    JSON.stringify({ error: 'DATABASE_ERROR' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )
}

// Template de Edge Function com tratamento completo
export async function withErrorHandling(
  handler: (req: Request) => Promise<Response>
): Promise<(req: Request) => Promise<Response>> {
  return async (req: Request) => {
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: 'VALIDATION_ERROR', details: err.errors }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (err instanceof Error) {
        return handleDatabaseError(err)
      }
      return new Response(
        JSON.stringify({ error: 'UNKNOWN_ERROR' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}
```

---

## Erros no Frontend

### Error Boundary para Módulos

```tsx
// File: src/lib/ui/ErrorBoundary.tsx

import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  moduleName?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log para monitoramento (Sentry, LogRocket, etc.)
    console.error(`[ErrorBoundary:${this.props.moduleName}]`, error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h3 className="font-semibold text-red-700">
            Algo deu errado no módulo {this.props.moduleName}
          </h3>
          <p className="mt-1 text-sm text-red-500">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-3 text-sm text-red-600 underline"
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    
    return this.props.children
  }
}
```

### Hook de Tratamento de Erros de Mutação

```typescript
// File: src/lib/hooks/useErrorHandler.ts

import { toast } from 'sonner' // ou qualquer lib de toast

// Mapeamento de códigos de erro para mensagens amigáveis
const ERROR_MESSAGES: Record<string, string> = {
  'SALDO_INSUFICIENTE': 'Saldo insuficiente para realizar esta operação.',
  'TITULO_JA_PAGO': 'Este título já foi pago anteriormente.',
  'CONTA_NAO_ENCONTRADA': 'Conta não encontrada.',
  'FORBIDDEN': 'Você não tem permissão para realizar esta ação.',
  'VALIDATION_ERROR': 'Dados inválidos. Verifique os campos e tente novamente.',
  'NETWORK_ERROR': 'Erro de conexão. Verifique sua internet e tente novamente.',
  'INTERNAL_ERROR': 'Erro interno do sistema. Tente novamente em alguns instantes.',
}

export function useErrorHandler() {
  const handleError = (error: unknown, contexto?: string) => {
    let codigo = 'INTERNAL_ERROR'
    
    if (error instanceof Error) {
      // Tentar extrair código do erro estruturado
      try {
        const parsed = JSON.parse(error.message)
        codigo = parsed.error ?? codigo
      } catch {
        // Se não for JSON, usar mensagem direta
        if (error.message.includes('fetch')) codigo = 'NETWORK_ERROR'
      }
    }
    
    const mensagem = ERROR_MESSAGES[codigo] ?? 'Ocorreu um erro inesperado.'
    
    toast.error(mensagem, {
      description: contexto ? `Contexto: ${contexto}` : undefined,
      duration: 5000,
    })
    
    // Log para diagnóstico
    console.error(`[${contexto ?? 'Erro'}]`, codigo, error)
  }
  
  return { handleError }
}

// Uso em componentes
export function useCreateCliente() {
  const { handleError } = useErrorHandler()
  
  return useMutation({
    mutationFn: clienteService.create,
    onSuccess: () => toast.success('Cliente criado com sucesso!'),
    onError: (error) => handleError(error, 'Criar Cliente'),
  })
}
```

---

## Estados de Carregamento e Erro na UI

```tsx
// File: src/lib/ui/AsyncState.tsx
// Componente para padronizar estados de loading/error/empty

interface AsyncStateProps<T> {
  isLoading: boolean
  error: Error | null
  data: T | undefined
  children: (data: T) => ReactNode
  emptyMessage?: string
  loadingComponent?: ReactNode
}

export function AsyncState<T extends unknown[]>({
  isLoading,
  error,
  data,
  children,
  emptyMessage = 'Nenhum registro encontrado.',
  loadingComponent
}: AsyncStateProps<T>) {
  if (isLoading) {
    return loadingComponent ?? (
      <div className="flex justify-center p-8">
        <Spinner size="lg" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        ⚠️ Erro ao carregar dados: {error.message}
      </div>
    )
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {emptyMessage}
      </div>
    )
  }
  
  return <>{children(data)}</>
}

// Uso:
export function ClienteList() {
  const { data: clientes, isLoading, error } = useClientes()
  
  return (
    <AsyncState
      isLoading={isLoading}
      error={error}
      data={clientes}
      emptyMessage="Nenhum cliente cadastrado ainda."
    >
      {(clientes) => (
        <div className="grid gap-4">
          {clientes.map(c => <ClienteCard key={c.id} cliente={c} />)}
        </div>
      )}
    </AsyncState>
  )
}
```

---

## Resiliência em Operações Críticas

### Nunca Perca uma Operação Financeira

```typescript
// Para operações críticas (pagamentos, transferências):
// 1. Feedback imediato ao usuário
// 2. Verificação do estado real após operação
// 3. Não depender apenas do response da requisição

export function usePagamento() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: pagamentosService.processar,
    
    onMutate: () => {
      // Bloquear UI durante operação crítica para evitar duplo clique
      return { startTime: Date.now() }
    },
    
    onSuccess: (resultado, variables, context) => {
      toast.success('Pagamento processado com sucesso!')
      
      // Invalidar TODO o estado financeiro após pagamento
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
    },
    
    onError: (error, variables, context) => {
      // Em operações financeiras, SEMPRE verificar o estado real no banco
      // mesmo após erro (pode ter processado mas retornado erro de rede)
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      
      handleError(error, 'Processamento de Pagamento')
    },
    
    onSettled: () => {
      // SEMPRE revalidar após operação financeira, independente do resultado
      queryClient.invalidateQueries({ queryKey: ['titulos'] })
    }
  })
}
```

---

## Checklist de Revisão — Tratamento de Erros

- [ ] Todos os erros do banco têm nome e são mapeados para status HTTP corretos?
- [ ] A Edge Function trata ZodError separadamente (400) de erros do banco?
- [ ] O frontend exibe mensagem amigável para cada código de erro?
- [ ] Existe ErrorBoundary nos módulos para evitar crash da aplicação inteira?
- [ ] Operações financeiras invalidam o cache mesmo após erro (verificar estado real)?
- [ ] O usuário recebe feedback imediato (loading, sucesso, erro) em toda ação?
- [ ] Todos os erros são logados de forma estruturada para diagnóstico?

---

*Próximo capítulo: [12-performance.md](./12-performance.md)*
