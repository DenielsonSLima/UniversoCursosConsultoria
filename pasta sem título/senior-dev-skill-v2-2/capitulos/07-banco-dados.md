# Capítulo 05 — Banco de Dados: A Fonte da Verdade

> *"O banco não é apenas onde os dados ficam. É onde as regras de negócio críticas vivem e a integridade é garantida."*

---

## Arquitetura de Ledger (Livro-Razão)

```sql
-- Contas: saldo calculado por trigger, nunca pelo frontend
CREATE TABLE contas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    nome            TEXT NOT NULL,
    saldo           NUMERIC(15, 2) NOT NULL DEFAULT 0.00,  -- ← trigger atualiza
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lançamentos: IMUTÁVEIS. Cada linha é um fato que ocorreu. Nunca se apaga.
CREATE TABLE lancamentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    conta_id        UUID NOT NULL REFERENCES contas(id),
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    valor           NUMERIC(15, 2) NOT NULL, -- positivo=crédito, negativo=débito
    data_transacao  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sem políticas de UPDATE/DELETE = imutabilidade garantida pelo banco
```

---

## RPCs — Lógica de Negócio Atômica

```sql
-- File: sql/rpcs/inserir_lancamento.sql

CREATE OR REPLACE FUNCTION public.inserir_lancamento(
    p_conta_id  UUID,
    p_descricao TEXT,
    p_valor     NUMERIC
)
RETURNS JSON AS $$
DECLARE
    v_lancamento_id UUID;
    v_org_id        UUID;
BEGIN
    -- 1. Verificar que a conta pertence à organização do usuário
    SELECT organization_id INTO v_org_id FROM public.contas WHERE id = p_conta_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONTA_NAO_ENCONTRADA'; END IF;
    
    -- 2. Verificar que o usuário é membro da organização
    IF NOT public.is_member_of(v_org_id) THEN
        RAISE EXCEPTION 'ACESSO_NEGADO';
    END IF;
    
    -- 3. Inserir lançamento (fato imutável)
    INSERT INTO public.lancamentos (organization_id, conta_id, user_id, descricao, valor, data_transacao)
    VALUES (v_org_id, p_conta_id, auth.uid(), p_descricao, p_valor, CURRENT_DATE)
    RETURNING id INTO v_lancamento_id;
    
    -- 4. Atualizar saldo de forma atômica
    UPDATE public.contas SET saldo = saldo + p_valor WHERE id = p_conta_id;
    
    RETURN json_build_object('lancamento_id', v_lancamento_id, 'success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Transferência com FOR UPDATE (evita race condition)

```sql
CREATE OR REPLACE FUNCTION public.transferir_entre_contas(
    p_conta_origem_id   UUID,
    p_conta_destino_id  UUID,
    p_valor             NUMERIC
)
RETURNS JSON AS $$
DECLARE
    v_saldo_origem NUMERIC;
BEGIN
    IF p_valor <= 0 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF;
    
    -- FOR UPDATE: bloqueia a linha até o fim da transação (evita race condition)
    SELECT saldo INTO v_saldo_origem FROM public.contas
    WHERE id = p_conta_origem_id FOR UPDATE;
    
    IF v_saldo_origem < p_valor THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: saldo=%, solicitado=%', v_saldo_origem, p_valor;
    END IF;
    
    PERFORM public.inserir_lancamento(p_conta_origem_id, 'Transferência (saída)', -p_valor);
    PERFORM public.inserir_lancamento(p_conta_destino_id, 'Transferência (entrada)', p_valor);
    
    RETURN json_build_object('success', true, 'valor_transferido', p_valor);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Índices Obrigatórios

```sql
-- organization_id é a base de TODO filtro em sistemas multi-tenant
CREATE INDEX idx_contas_organization_id ON public.contas(organization_id);
CREATE INDEX idx_lancamentos_organization_id ON public.lancamentos(organization_id);
CREATE INDEX idx_lancamentos_conta_id ON public.lancamentos(conta_id);
CREATE INDEX idx_lancamentos_org_data ON public.lancamentos(organization_id, data_transacao DESC);

-- Verificar se queries usam índices:
EXPLAIN ANALYZE SELECT * FROM lancamentos WHERE organization_id = 'org-id';
-- Se aparecer "Seq Scan" → CRIE O ÍNDICE
```

---

## Views — Leitura Otimizada

```sql
CREATE OR REPLACE VIEW public.vw_extrato_financeiro AS
SELECT l.id, l.data_transacao, l.descricao, l.valor,
       c.nome AS nome_conta, c.saldo AS saldo_atual_conta, l.organization_id
FROM public.lancamentos l
JOIN public.contas c ON l.conta_id = c.id
ORDER BY l.data_transacao DESC;
-- RLS se aplica automaticamente na view
```

---

## Checklist — Banco de Dados

- [ ] Existe tabela de lançamentos imutável para operações financeiras?
- [ ] O saldo é calculado por triggers/RPCs, não pelo frontend?
- [ ] RPCs usam `SECURITY DEFINER` com verificações de acesso internas?
- [ ] Operações multi-tabela são atômicas?
- [ ] Existe `FOR UPDATE` em operações com risco de race condition?
- [ ] Todas as tabelas têm índice em `organization_id`?
- [ ] As queries frequentes foram verificadas com `EXPLAIN ANALYZE`?

---

*Próximo capítulo: [08-multitenancy-rls.md](./08-multitenancy-rls.md)*
