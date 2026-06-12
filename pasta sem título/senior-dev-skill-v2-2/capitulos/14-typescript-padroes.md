# Capítulo 08 — Padrões, Nomenclatura e Estrutura de Código

> *"Código sem padrão é como uma cidade sem endereços. Todo mundo sabe que existe, ninguém sabe onde está."*

---

## Por Que Padronizar?

Em um time com múltiplos desenvolvedores (ou múltiplas LLMs), sem padrão você tem:
- Arquivos em lugares aleatórios
- Nomes que não dizem o que a coisa faz
- Funções duplicadas em módulos diferentes
- Novos membros perdendo horas para entender a estrutura

Com padrão, qualquer pessoa (ou LLM) consegue encontrar qualquer coisa em segundos.

---

## Estrutura de Diretórios Completa

```
projeto/
│
├── SKILL.md                              ← Instruções para qualquer LLM
├── CLAUDE.md                             ← Espelho do SKILL.md
├── AGENTS.md                             ← Espelho do SKILL.md
│
├── src/
│   ├── app/                              ← Configuração de rotas (Next.js/React Router)
│   │   ├── layout.tsx
│   │   └── (routes)/
│   │
│   ├── modules/                          ← Domínios de negócio
│   │   ├── auth/
│   │   │   ├── auth.page.tsx
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.hooks.ts
│   │   │   ├── auth.types.ts
│   │   │   └── components/
│   │   │       ├── LoginForm.tsx
│   │   │       └── RegisterForm.tsx
│   │   │
│   │   ├── clientes/
│   │   │   ├── clientes.page.tsx
│   │   │   ├── clientes.service.ts
│   │   │   ├── clientes.hooks.ts
│   │   │   ├── clientes.realtime.ts
│   │   │   ├── clientes.types.ts
│   │   │   └── components/
│   │   │       ├── ClienteList.tsx
│   │   │       ├── ClienteCard.tsx
│   │   │       ├── ClienteFormAdd.tsx
│   │   │       └── ClienteFormEdit.tsx
│   │   │
│   │   └── financeiro/
│   │       ├── financeiro.page.tsx
│   │       ├── financeiro.types.ts
│   │       ├── services/                 ← Múltiplos services para domínio complexo
│   │       │   ├── extrato.service.ts
│   │       │   ├── pagamentos.service.ts
│   │       │   ├── relatorios.service.ts
│   │       │   └── transferencias.service.ts
│   │       └── components/
│   │           ├── ExtratoTable.tsx
│   │           ├── PagamentoModal.tsx
│   │           └── DashboardFinanceiro.tsx
│   │
│   ├── lib/                              ← Código compartilhado
│   │   ├── ui/                           ← Componentes visuais sem lógica
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Spinner.tsx
│   │   │   ├── Table.tsx
│   │   │   └── index.ts                  ← Re-exporta tudo
│   │   │
│   │   ├── hooks/                        ← Hooks globais
│   │   │   ├── useOrganization.ts
│   │   │   ├── useUser.ts
│   │   │   └── usePermissions.ts
│   │   │
│   │   ├── supabase.ts                   ← Client singleton
│   │   ├── query-client.ts              ← TanStack Query config
│   │   ├── query-keys.ts                ← Query keys centralizadas
│   │   └── utils/
│   │       ├── formatters.ts            ← formatDate, formatCurrency, etc.
│   │       ├── validators.ts            ← validarCPF, validarCNPJ, etc.
│   │       └── constants.ts            ← MAX_FILE_SIZE, PLANOS, etc.
│   │
│   └── types/
│       └── global.types.ts              ← Tipos compartilhados entre módulos
│
├── supabase/
│   ├── functions/                        ← Edge Functions (backend)
│   │   ├── bootstrap/
│   │   │   └── index.ts
│   │   ├── criar-cliente/
│   │   │   └── index.ts
│   │   ├── processar-pagamento/
│   │   │   └── index.ts
│   │   └── _shared/                      ← Código compartilhado entre functions
│   │       ├── auth.ts
│   │       ├── cors.ts
│   │       └── response.ts
│   │
│   └── migrations/                       ← Migrações SQL versionadas
│       ├── 20240101000001_initial.sql
│       ├── 20240101000002_rls_policies.sql
│       └── 20240101000003_indexes.sql
│
└── sql/                                  ← SQL organizado por tipo
    ├── rpcs/
    │   ├── inserir_lancamento.sql
    │   └── transferir_entre_contas.sql
    ├── triggers/
    │   └── updated_at.sql
    └── views/
        └── vw_extrato_financeiro.sql
```

---

## Convenções de Nomenclatura

### Arquivos

| Tipo | Convenção | Exemplo |
|---|---|---|
| Componente React | PascalCase | `ClienteCard.tsx` |
| Arquivo de módulo | kebab-case ou camelCase com sufixo | `clientes.page.tsx` |
| Hook | camelCase com prefixo `use` | `useClientes.ts` |
| Service | camelCase com sufixo `.service` | `clientes.service.ts` |
| Tipos TypeScript | camelCase com sufixo `.types` | `clientes.types.ts` |
| Edge Function | kebab-case | `processar-pagamento/index.ts` |
| Migration SQL | timestamp + descrição | `20240101000001_create_clients.sql` |

### Código TypeScript

```typescript
// ✅ CORRETO

// Interfaces e Types: PascalCase
interface Cliente {
  id: string
  nome: string
  organizationId: string
}

type CreateClienteDTO = Omit<Cliente, 'id' | 'createdAt'>

// Enums: PascalCase com valores UPPER_SNAKE_CASE
enum PlanoOrganizacao {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}

// Funções: camelCase descritivo (verbo + objeto)
function calcularSaldoConta(lancamentos: Lancamento[]): number { ... }
function validarDocumentoCliente(documento: string): boolean { ... }
async function buscarClientesPorOrganizacao(orgId: string): Promise<Cliente[]> { ... }

// Constantes: UPPER_SNAKE_CASE
const MAX_TENTATIVAS_PAGAMENTO = 3
const TEMPO_CACHE_PADRAO_MS = 5 * 60 * 1000
const LIMITE_DESCONTO_SEM_APROVACAO = 0.30

// Variáveis: camelCase descritivo (nunca: a, b, x, temp, data)
const clienteEncontrado = clientes.find(c => c.id === clienteId)
const totalVendasMes = vendas.reduce((soma, v) => soma + v.valor, 0)
```

### SQL

```sql
-- Tabelas: snake_case, plural
CREATE TABLE organization_members (...);
CREATE TABLE financial_transactions (...);

-- Colunas: snake_case
organization_id, created_at, updated_at, is_active

-- Funções/Procedures: snake_case, verbo + substantivo
CREATE FUNCTION inserir_lancamento(...);
CREATE FUNCTION verificar_saldo_suficiente(...);

-- Índices: idx_{tabela}_{coluna(s)}
CREATE INDEX idx_clientes_organization_id ON clientes(organization_id);
CREATE INDEX idx_lancamentos_org_data ON lancamentos(organization_id, data_transacao DESC);

-- Policies: descritivas
CREATE POLICY "members_can_read_clientes" ON clientes FOR SELECT ...;
CREATE POLICY "admins_can_delete_records" ON records FOR DELETE ...;

-- Views: prefixo vw_
CREATE VIEW vw_extrato_financeiro AS ...;
CREATE VIEW vw_dashboard_vendas AS ...;
```

---

## Padrão de Arquivo: Service

```typescript
// File: src/modules/clientes/clientes.service.ts
// PADRÃO: Um objeto com métodos nomeados por operação de negócio

import { supabase } from '@/lib/supabase'
import type { Cliente, CreateClienteDTO, UpdateClienteDTO } from './clientes.types'

export const clienteService = {
  // getAll: busca lista completa
  async getAll(organizationId: string): Promise<Cliente[]> {
    const { data, error } = await supabase.functions.invoke('listar-clientes', {
      body: { organization_id: organizationId }
    })
    if (error) throw new Error(error.message)
    return data as Cliente[]
  },

  // getById: busca item específico
  async getById(id: string): Promise<Cliente> {
    const { data, error } = await supabase.functions.invoke('buscar-cliente', {
      body: { id }
    })
    if (error) throw new Error(error.message)
    return data as Cliente
  },

  // create: criação com DTO tipado
  async create(dto: CreateClienteDTO): Promise<Cliente> {
    const { data, error } = await supabase.functions.invoke('criar-cliente', {
      body: dto
    })
    if (error) throw new Error(error.message)
    return data as Cliente
  },

  // update: atualização parcial
  async update(id: string, dto: UpdateClienteDTO): Promise<Cliente> {
    const { data, error } = await supabase.functions.invoke('atualizar-cliente', {
      body: { id, ...dto }
    })
    if (error) throw new Error(error.message)
    return data as Cliente
  },

  // delete: remoção com apenas o ID
  async delete(id: string): Promise<void> {
    const { error } = await supabase.functions.invoke('excluir-cliente', {
      body: { id }
    })
    if (error) throw new Error(error.message)
  },
}
```

---

## Anti-Padrões Proibidos

```typescript
// ❌ PROIBIDO: Nome genérico de função
async function handle(data: any) { ... }
async function process(x: any) { ... }
function doThing(input: any) { ... }

// ❌ PROIBIDO: Variáveis sem significado
const d = new Date()
const r = await fetch(url)
let x = 0

// ❌ PROIBIDO: any sem justificativa
function formatarDado(dado: any): any { ... }

// ❌ PROIBIDO: Comentário que repete o código
// Incrementa i
i++

// ❌ PROIBIDO: Arquivo com múltiplas responsabilidades
// financeiro.service.ts com clientes, vendas E financeiro dentro

// ❌ PROIBIDO: Import de módulo diferente dentro de /lib/ui
// src/lib/ui/Button.tsx importando clienteService
```

---

## Checklist de Revisão — Padrões e Nomenclatura

- [ ] Os arquivos seguem a convenção de nomenclatura do IDL?
- [ ] Os componentes React são PascalCase?
- [ ] As funções têm nomes descritivos (verbo + objeto)?
- [ ] As constantes são UPPER_SNAKE_CASE?
- [ ] Não há uso de `any` sem justificativa explícita?
- [ ] Não há variáveis com nomes de letra única (exceto em loops)?
- [ ] As tabelas SQL são snake_case e plural?
- [ ] Os índices seguem o padrão `idx_{tabela}_{coluna}`?
- [ ] Cada arquivo tem uma responsabilidade única?

---

*Próximo capítulo: [10-testes.md](./10-testes.md)*
