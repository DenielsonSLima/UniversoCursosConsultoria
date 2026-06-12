# Capítulo 06 — Multitenancy e Row Level Security (RLS)

> *"Em um sistema multi-empresa, o maior erro é um usuário ver dados de outra empresa. Com RLS, isso é impossível — não improvável, impossível."*

---

## O Que É Multitenancy?

Multitenancy é a capacidade de um único sistema servir **múltiplas empresas (tenants) simultaneamente**, com **isolamento total** entre elas. É o modelo padrão de sistemas SaaS modernos.

### Cenário Real

```
Empresa A (Mercado São João):
  - Usuários: João, Maria, Pedro
  - Dados: clientes, vendas, financeiro da Empresa A

Empresa B (Loja da Ana):
  - Usuários: Ana, Carlos
  - Dados: clientes, vendas, financeiro da Empresa B

REGRA ABSOLUTA: João NUNCA pode ver os clientes da Empresa B.
                Ana NUNCA pode ver o financeiro da Empresa A.
                Mesmo se souberem o ID dos registros.
```

---

## A Estrutura Base de Multitenancy

### Tabelas Obrigatórias

```sql
-- File: sql/migrations/001_multitenancy_base.sql

-- Tabela de organizações (empresas/tenants)
CREATE TABLE public.organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        TEXT NOT NULL,
    cnpj        TEXT UNIQUE,
    plano       TEXT NOT NULL DEFAULT 'free', -- free, pro, enterprise
    ativo       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de membros (users <-> organizations)
CREATE TABLE public.organization_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member', -- member, manager, admin, owner
    ativo           BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(organization_id, user_id) -- Um usuário tem um role por organização
);

-- Índices
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.organization_members(organization_id);
```

### R03 — organization_id em TODA tabela de negócio

```sql
-- ✅ CORRETO: Toda tabela de negócio tem organization_id
CREATE TABLE public.clientes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    nome            TEXT NOT NULL,
    email           TEXT,
    documento       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.contas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    nome            TEXT NOT NULL,
    saldo           NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TODOS os índices de organization_id
CREATE INDEX idx_clientes_org_id ON public.clientes(organization_id);
CREATE INDEX idx_contas_org_id ON public.contas(organization_id);
```

---

## Row Level Security (RLS): A Última Linha de Defesa

### O Que é RLS?

RLS é um recurso do PostgreSQL que permite definir **políticas de acesso por linha**. Mesmo que um usuário tente fazer uma query SQL direta, o banco automaticamente filtra/bloqueia o acesso a linhas não autorizadas.

**É como se cada tabela tivesse um segurança que verifica o crachá antes de mostrar qualquer dado.**

### Função Auxiliar Obrigatória

```sql
-- File: sql/rpcs/helpers.sql

-- Função que verifica se o usuário logado é membro de uma organização
CREATE OR REPLACE FUNCTION public.is_member_of(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE -- Otimização: resultado cacheável dentro da transação
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id 
          AND user_id = auth.uid()
          AND ativo = true
    );
END;
$$;

-- Função que retorna o role do usuário em uma organização
CREATE OR REPLACE FUNCTION public.get_my_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND ativo = true;
    
    RETURN v_role; -- NULL se não for membro
END;
$$;

-- Função que retorna todas as organizations do usuário logado
CREATE OR REPLACE FUNCTION public.my_organization_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND ativo = true;
END;
$$;
```

### Habilitando RLS e Criando Políticas

```sql
-- File: sql/migrations/002_rls_policies.sql

-- ─── ORGANIZATIONS ───────────────────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas suas organizações
CREATE POLICY "users_see_own_organizations" ON public.organizations
    FOR SELECT
    USING (
        id IN (SELECT public.my_organization_ids())
    );

-- Apenas admins podem criar organizações (via Edge Function com service_role)
-- Política de INSERT não criada = bloqueia INSERT direto

-- ─── ORGANIZATION_MEMBERS ────────────────────────────────────────────────────
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Membros veem outros membros da mesma organização
CREATE POLICY "members_see_same_org" ON public.organization_members
    FOR SELECT
    USING (public.is_member_of(organization_id));

-- ─── CLIENTES ─────────────────────────────────────────────────────────────────
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Qualquer membro da organização pode ver os clientes
CREATE POLICY "members_can_read_clientes" ON public.clientes
    FOR SELECT
    USING (public.is_member_of(organization_id));

-- Qualquer membro pode criar clientes
CREATE POLICY "members_can_insert_clientes" ON public.clientes
    FOR INSERT
    WITH CHECK (public.is_member_of(organization_id));

-- Apenas managers e admins podem atualizar
CREATE POLICY "managers_can_update_clientes" ON public.clientes
    FOR UPDATE
    USING (
        public.get_my_role(organization_id) IN ('manager', 'admin', 'owner')
    );

-- Apenas admins podem excluir
CREATE POLICY "admins_can_delete_clientes" ON public.clientes
    FOR DELETE
    USING (
        public.get_my_role(organization_id) IN ('admin', 'owner')
    );

-- ─── CONTAS E LANÇAMENTOS ─────────────────────────────────────────────────────
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_can_manage_contas" ON public.contas
    FOR ALL
    USING (public.is_member_of(organization_id));

-- Lançamentos: só leitura (criação via RPC)
CREATE POLICY "org_members_can_read_lancamentos" ON public.lancamentos
    FOR SELECT
    USING (public.is_member_of(organization_id));

-- NUNCA permitir UPDATE/DELETE em lancamentos (imutabilidade)
-- Sem política = bloqueia automaticamente
```

---

## Testando RLS: Verificação de Isolamento

```sql
-- Como testar que o isolamento está funcionando:

-- 1. Logar como usuário da Empresa A
SET LOCAL request.jwt.claims = '{"sub": "user-id-empresa-a"}';

-- 2. Tentar selecionar dados — deve retornar apenas dados da Empresa A
SELECT * FROM clientes; -- ← Deve mostrar APENAS clientes da Empresa A

-- 3. Tentar acessar diretamente um ID da Empresa B
SELECT * FROM clientes WHERE id = 'id-de-cliente-da-empresa-b';
-- ← Deve retornar 0 linhas (não erro, apenas vazio — segurança por obscuridade)
```

```typescript
// Teste automatizado de isolamento (TypeScript/Vitest)
describe('Isolamento Multi-Tenant', () => {
  it('usuário da empresa A não vê clientes da empresa B', async () => {
    const supabaseA = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${tokenEmpresaA}` } }
    })
    
    const { data } = await supabaseA.from('clientes').select('*')
    
    // Todos os registros devem ser da organização A
    data?.forEach(cliente => {
      expect(cliente.organization_id).toBe(organizationIdA)
    })
    
    // Tentar buscar cliente específico da empresa B deve retornar vazio
    const { data: clienteB } = await supabaseA
      .from('clientes')
      .select('*')
      .eq('id', clienteIdEmpresaB)
    
    expect(clienteB).toHaveLength(0)
  })
})
```

---

## Diagrama de Acesso Multi-Tenant

```
USUÁRIO (autenticado com JWT)
    ↓
EDGE FUNCTION (valida JWT → extrai user_id)
    ↓
SUPABASE CLIENT (passa JWT)
    ↓
POSTGRESQL
    ↓ (RLS intercepta TODA query)
    ├── is_member_of(organization_id)?
    │     SIM → retorna os dados da linha
    │     NÃO → linha simplesmente não existe para este usuário
    ↓
DADOS FILTRADOS (somente da organização do usuário)
```

---

## Checklist de Revisão — Multitenancy e RLS

- [ ] Todas as tabelas de negócio têm a coluna `organization_id NOT NULL`?
- [ ] Todas as tabelas têm `ENABLE ROW LEVEL SECURITY`?
- [ ] Todas as políticas usam `is_member_of()` ou verificação equivalente?
- [ ] As políticas cobrem SELECT, INSERT, UPDATE e DELETE separadamente?
- [ ] Operações de INSERT verificam que o `organization_id` pertence ao usuário?
- [ ] Tabelas imutáveis (lancamentos) não têm políticas de UPDATE/DELETE?
- [ ] A função `is_member_of()` é `SECURITY DEFINER` e `STABLE`?
- [ ] Os índices em `organization_id` estão criados em todas as tabelas?
- [ ] Existe um teste automatizado que verifica o isolamento entre organizações?

---

*Próximo capítulo: [09-realtime.md](./09-realtime.md)*
