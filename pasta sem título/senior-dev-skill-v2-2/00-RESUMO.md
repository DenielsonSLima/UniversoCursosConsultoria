# 00 — Resumo Executivo

> Leitura de 10 minutos. Tudo que você precisa saber antes de codar.

---

## Os 4 Pilares do Sistema

### Pilar 1 — Documentar Antes de Programar
```
HLD  → Mapa do sistema (visão de 30.000 pés)
BRD  → Regras de negócio testáveis
CRD  → Contratos de API (input/output/erros)
IDL  → Padrão de código (nomes, pastas, estruturas)
```
Sem documentação, cada dev inventa seu próprio padrão. Com documentação, até um LLM novo produz código consistente.

### Pilar 2 — Separação Rigorosa de Responsabilidades
```
Página (.page.tsx)     → Orquestra: busca dados, monta tela
Componente (/components) → Funcionalidade de interação
UI (/ui)               → Visual puro, zero lógica de negócio
Hook (.hooks.ts)       → Bridge entre componente e dados
Service (.service.ts)  → Acesso a dados e APIs
Edge Function          → Lógica segura, validação, banco
PostgreSQL             → Fonte da verdade, cálculos críticos
```

### Pilar 3 — Segurança em 3 Camadas Independentes
```
Camada 1 (Frontend)    → Não exibe o que não deve
Camada 2 (Edge Func.)  → Valida JWT + Zod + permissão
Camada 3 (Banco/RLS)   → Filtra dados por organização
```
Se a camada 1 falhar, a 2 segura. Se a 2 falhar, a 3 segura.

### Pilar 4 — Self-Annealing (Sistema que Aprende)
```
Bug acontece → Diagnostica → Corrige → Documenta → Sistema mais forte
```
Todo bug que chega em produção deve atualizar as diretivas para nunca mais acontecer.

---

## O Fluxo Correto de Dados

```
Usuário age no Componente
        ↓
Componente chama Hook
        ↓
Hook chama Service
        ↓
Service chama Edge Function (POST) ou Supabase diretamente (GET simples)
        ↓
Edge Function: valida JWT → valida Zod → verifica permissão → chama RPC
        ↓
PostgreSQL: executa RPC atomicamente → RLS filtra → retorna resultado
        ↓
TanStack Query invalida cache
        ↓
UI re-renderiza automaticamente
```

---

## Anti-Padrões — Nunca Faça

```typescript
// ❌ Componente fazendo fetch direto
useEffect(() => { fetch('/api/dados') }, [])

// ❌ service_role no frontend
createClient(url, process.env.VITE_SERVICE_ROLE_KEY)

// ❌ Saldo calculado no frontend
const novoSaldo = saldo + valor
supabase.from('contas').update({ saldo: novoSaldo })

// ❌ Query sem paginação
supabase.from('lancamentos').select('*') // pode ser 100k linhas

// ❌ Sem validação na Edge Function
const { conta_id, valor } = await req.json() // sem Zod

// ❌ Tabela sem organization_id
CREATE TABLE produtos (id UUID, nome TEXT) -- empresas misturadas!
```

---

## Estrutura de Pastas Padrão

```
src/
├── modules/
│   └── {modulo}/
│       ├── {modulo}.page.tsx      ← Orquestra
│       ├── {modulo}.service.ts    ← Acesso a dados
│       ├── {modulo}.hooks.ts      ← TanStack Query
│       ├── {modulo}.types.ts      ← Tipos TypeScript
│       └── components/            ← Componentes do módulo
├── lib/
│   ├── ui/                        ← Componentes visuais puros
│   ├── supabase/                  ← Cliente e helpers
│   └── utils/                     ← Funções puras utilitárias
├── store/                         ← Zustand (estado de UI)
└── types/                         ← Tipos globais

supabase/
├── functions/                     ← Edge Functions
├── migrations/                    ← SQL versionado
└── seed.sql
```

---

## Modelo Mental: Multitenancy

```
Org A                    Org B
 ├── User 1               ├── User 3
 ├── User 2               └── User 4
 └── Dados A ←───────────────────── invisível para B
              RLS garante isso no banco
              Nenhum código adicional necessário
              Mesmo SELECT * retorna apenas dados da org autenticada
```

---

## Para Memorizar (Cole na sua mesa)

```
┌─────────────────────────────────────────────┐
│  SE TIVER DÚVIDA, PERGUNTE:                 │
│                                             │
│  1. Quem é responsável por isso?            │
│     (cada camada tem 1 responsabilidade)    │
│                                             │
│  2. O que acontece se 2 usuários fizerem    │
│     isso ao mesmo tempo?                    │
│     (concorrência — use RPC atômica)        │
│                                             │
│  3. O que acontece se a rede cair no meio?  │
│     (resiliência — erro gracioso)           │
│                                             │
│  4. Se eu for empresa B, consigo ver        │
│     dados da empresa A?                     │
│     (isolamento — RLS + organization_id)    │
│                                             │
│  5. O que acontece com 10.000 registros?    │
│     (escala — índice + paginação)           │
└─────────────────────────────────────────────┘
```
