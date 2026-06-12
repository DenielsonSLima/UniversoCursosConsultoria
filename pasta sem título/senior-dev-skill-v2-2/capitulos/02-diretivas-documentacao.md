# Capítulo 2 — Diretivas e Documentação: HLD, BRD, CRD, IDL

**Duração:** 20 min | **Nível:** Fundamental | **Pré-requisito:** Cap. 1

> Programar sem documentar é como construir uma casa sem planta.
> Você chega a algum lugar — mas não necessariamente onde queria.

---

## A Ordem Correta de Trabalho

```
1️⃣  Pensar no sistema       →  HLD
2️⃣  Definir regras          →  BRD
3️⃣  Definir contratos       →  CRD
4️⃣  Definir padrão de código →  IDL
5️⃣  SÓ ENTÃO programar
```

Esta ordem evita o maior desperdício do desenvolvimento: refazer algo que
poderia ter sido evitado com 30 minutos de documentação.

---

## HLD — High Level Design (Mapa do Sistema)

Responde: *Qual problema resolve? Quais tecnologias? Quais módulos?*

```markdown
# HLD — Sistema de Gestão Multi-Empresa

## Problema
Empresas precisam controlar finanças, clientes e operações
com isolamento total de dados entre si (multitenancy).

## Stack
- Frontend: React 18 + TypeScript + Vite + TanStack Query + Zustand
- Backend:  Supabase (PostgreSQL + Edge Functions + Auth + Realtime)
- Deploy:   Vercel (frontend) + Supabase Cloud (backend)

## Módulos Principais
- auth          → Login, registro, recuperação, sessão
- organizations → Multi-empresa, membros, roles
- clientes      → Cadastro, busca, histórico
- financeiro    → Lançamentos, contas, extrato, relatórios
- configuracoes → Usuários, permissões, plano

## Fluxo de Dados
[Browser] → [Edge Functions / Supabase] → [PostgreSQL + RLS]
                     ↑
               [Supabase Auth JWT]
```

### ✅ Checklist HLD
- [ ] Problema de negócio está claro?
- [ ] Todos os módulos principais mapeados?
- [ ] Fluxo de dados entre camadas definido?
- [ ] Tecnologias justificadas?

---

## BRD — Business Requirements Document (Regras de Negócio)

Responde: *Como o sistema deve se comportar? Quais são as restrições?*

**Cada regra deve ser testável.** Se não dá para escrever um teste, a regra está vaga.

```markdown
# BRD — Módulo Financeiro

## Regras de Lançamento
RN-01: Todo lançamento requer conta_id, valor ≠ 0 e data_transacao
RN-02: Lançamentos não podem ser deletados — apenas estornados
RN-03: Saldo de uma conta = soma de todos os lançamentos não estornados
RN-04: Valor positivo = crédito; valor negativo = débito
RN-05: Não é possível lançar em conta de outra organização

## Regras de Acesso
RA-01: Admin pode criar, editar configurações e gerenciar membros
RA-02: Membro pode criar lançamentos e visualizar dados
RA-03: Visualizador pode apenas visualizar — sem criar/editar
RA-04: Usuário só vê dados de organizações às quais pertence
RA-05: Usuário não pode se remover de uma organização (apenas admin)
```

### ✅ Checklist BRD
- [ ] Cada regra tem um ID único (RN-XX, RA-XX)?
- [ ] Cada regra é verificável automaticamente?
- [ ] Casos de borda documentados (o que NÃO é permitido)?
- [ ] Regras de acesso explícitas para cada role?

---

## CRD — Contract Requirements Document (Contratos de API)

Responde: *Como frontend e backend se comunicam? Que dados entram e saem?*

```markdown
# CRD — Edge Function: processar-lancamento

## POST /functions/v1/processar-lancamento

### Autenticação
Authorization: Bearer <jwt_token>  ← OBRIGATÓRIO

### Body (JSON)
{
  "conta_id":       string (UUID)    ← OBRIGATÓRIO
  "descricao":      string (≤ 255)   ← OPCIONAL
  "valor":          number (≠ 0)     ← OBRIGATÓRIO
  "data_transacao": string YYYY-MM-DD ← OBRIGATÓRIO
}

### Respostas
201 → { id, conta_id, valor, saldo_atual }
400 → { error: "VALIDATION_ERROR", details: { campo: "mensagem" } }
401 → { error: "UNAUTHORIZED" }
403 → { error: "FORBIDDEN", message: "Conta não pertence à sua organização" }
409 → { error: "CONFLICT", message: "Saldo insuficiente" }
500 → { error: "INTERNAL_ERROR", message: "Tente novamente" }
```

### ✅ Checklist CRD
- [ ] Todos os campos com tipo e obrigatoriedade?
- [ ] Todos os códigos de erro mapeados?
- [ ] Autenticação especificada?
- [ ] Exemplos de request e response?

---

## IDL — Implementation Definition (Padrão de Código)

Responde: *Como o código deve ser escrito? Quais convenções seguir?*

### Convenção de Nomes

```
Arquivos:
  {modulo}.page.tsx        → Páginas
  {Componente}.tsx         → Componentes (PascalCase)
  {modulo}.service.ts      → Services
  {modulo}.hooks.ts        → Hooks do módulo
  {modulo}.types.ts        → Tipos TypeScript
  use{Nome}.ts             → Hook individual

Variáveis e funções:
  const clienteAtivo       → camelCase
  function buscarClientes  → camelCase, verbo primeiro
  const MAX_RETRIES = 3    → SCREAMING_SNAKE_CASE (constantes)

Tipos:
  interface Cliente        → PascalCase (sem prefixo "I")
  type TipoLancamento      → PascalCase
  type Role = 'admin' | …  → union type com type, não interface
```

### Estrutura Padrão de Service

```typescript
// {modulo}.service.ts — sempre objeto, nunca classe com estado
export const clienteService = {
  async getAll(params: GetClientesParams): Promise<PaginatedResponse<Cliente>> {
    const { data, error, count } = await supabase
      .from('clientes')
      .select('*', { count: 'exact' })
      .eq('organization_id', params.organizationId)
      .range(params.from, params.to); // ← paginação sempre

    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },
};
```

### ✅ Checklist IDL
- [ ] Convenção de nomes documentada e seguida?
- [ ] Estrutura de pastas definida?
- [ ] Exemplos de service, hook e componente existem?
- [ ] Path aliases configurados (`@/` em vez de `../../`)?

---

## Diretivas Como Cultura

A documentação não é um entregável — é um hábito. Cada vez que um padrão novo
é descoberto (erro em produção, melhoria identificada, edge case novo), a diretiva
deve ser atualizada.

**O loop:**
```
Situação nova encontrada
        ↓
Solução encontrada e validada
        ↓
Documentada na diretiva relevante
        ↓
Time notificado da mudança
        ↓
Próxima ocorrência: zero retrabalho
```

Isso é o que faz um sistema evoluir com qualidade ao longo do tempo, independente
de quem está implementando — humano ou agente de IA.

---

## Perguntas de Revisão

1. Você está começando uma nova feature. Qual documento cria primeiro?
   → HLD para mapear o escopo, BRD para as regras, CRD para os contratos.

2. Um dev novo pergunta "o que esta Edge Function retorna em caso de erro?".
   Onde ele deve encontrar a resposta sem perguntar a ninguém?
   → No CRD do endpoint. Se não está lá, documente agora.

3. Uma regra de negócio mudou. Em que ordem você age?
   → Atualiza o BRD → Atualiza o CRD se necessário → Implementa → Testa → PR.

4. Um agente de IA está gerando código para o sistema. O que ele precisa ler?
   → SKILL.md + HLD (contexto) + BRD (regras) + CRD (contratos) + IDL (padrões).
