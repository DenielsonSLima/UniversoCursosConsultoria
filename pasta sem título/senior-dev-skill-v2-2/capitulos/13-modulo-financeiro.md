# Capítulo 13 — Módulo Financeiro

**Duração:** 25 min | **Nível:** Avançado | **Pré-requisito:** Cap. 7, 8

> Dinheiro não aceita imprecisão. Uma inconsistência de R$ 0,01 é tão grave quanto
> uma de R$ 1.000.000. Cada centavo deve ser rastreável, atômico e imutável.

---

## O Princípio Mestre: Separação dos Poderes Financeiros

```
┌──────────────────────────────────────────────────────┐
│  COMPROMETIMENTO (financial_entries)                 │
│  "O que devo / O que tenho a receber"                │
│  Pedidos, faturas, contratos pendentes               │
│  → Lançado ANTES do pagamento acontecer              │
└──────────────────────────┬───────────────────────────┘
                           │ Quando realizado →
┌──────────────────────────▼───────────────────────────┐
│  MOVIMENTO (financial_transactions)                  │
│  "O que realmente aconteceu"                         │
│  Débitos e créditos efetivos                         │
│  → IMUTÁVEL — é um fato histórico                    │
└──────────────────────────┬───────────────────────────┘
                           │ Refletido em →
┌──────────────────────────▼───────────────────────────┐
│  POSIÇÃO (accounts)                                  │
│  "Quanto tenho agora"                                │
│  Saldo atual por conta                               │
│  → DERIVADO via RPC atômica — nunca editado direto   │
└──────────────────────────────────────────────────────┘
```

---

## As 3 Tabelas Base

### Tabela 1: Contas (`accounts`)

```sql
CREATE TABLE public.accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) NOT NULL,
  nome             TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('corrente','poupanca','caixa','cartao','investimento')),
  saldo            NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  saldo_inicial    NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  moeda            TEXT NOT NULL DEFAULT 'BRL',
  ativo            BOOLEAN DEFAULT true,
  criado_em        TIMESTAMPTZ DEFAULT now()
);
```

### Tabela 2: Comprometimentos (`financial_entries`)

```sql
CREATE TABLE public.financial_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('receita','despesa','transferencia')),
  descricao        TEXT NOT NULL,
  valor            NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_vencimento  DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente','pago','parcial','cancelado','vencido')),
  conta_id         UUID REFERENCES accounts(id),
  categoria        TEXT,
  user_id          UUID REFERENCES auth.users(id) NOT NULL,
  criado_em        TIMESTAMPTZ DEFAULT now(),
  atualizado_em    TIMESTAMPTZ DEFAULT now()
);
```

### Tabela 3: Movimentos (`financial_transactions`)

```sql
-- ⚠️ SAGRADA: nunca UPDATE ou DELETE diretamente
CREATE TABLE public.financial_transactions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID REFERENCES organizations(id) NOT NULL,
  account_id             UUID REFERENCES accounts(id) NOT NULL,
  entry_id               UUID REFERENCES financial_entries(id),
  descricao              TEXT NOT NULL,
  valor                  NUMERIC(15,2) NOT NULL CHECK (valor <> 0),
  tipo                   TEXT NOT NULL CHECK (tipo IN ('credito','debito','estorno')),
  data_transacao         DATE NOT NULL,
  estornado              BOOLEAN DEFAULT false,
  transacao_original_id  UUID REFERENCES financial_transactions(id),
  user_id                UUID REFERENCES auth.users(id) NOT NULL,
  criado_em              TIMESTAMPTZ DEFAULT now()
  -- SEM atualizado_em: transações são imutáveis
);

CREATE INDEX idx_transactions_org_data ON financial_transactions (organization_id, data_transacao DESC);
CREATE INDEX idx_transactions_account  ON financial_transactions (account_id, data_transacao DESC);
```

---

## A RPC de Pagamento (Operação Atômica)

```sql
CREATE OR REPLACE FUNCTION public.pagar_entrada(
  p_entry_id       UUID,
  p_account_id     UUID,
  p_valor_pago     NUMERIC,
  p_data_pagamento DATE,
  p_user_id        UUID
) RETURNS JSON AS $$
DECLARE
  v_entry          financial_entries%ROWTYPE;
  v_transaction_id UUID;
  v_saldo_novo     NUMERIC;
BEGIN
  -- 1. Trava para evitar race condition (dois usuários pagando ao mesmo tempo)
  SELECT * INTO v_entry FROM public.financial_entries
  WHERE id = p_entry_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrada_nao_encontrada: %', p_entry_id;
  END IF;
  IF v_entry.status = 'cancelado' THEN
    RAISE EXCEPTION 'entrada_cancelada: entrada já foi cancelada';
  END IF;
  IF v_entry.status = 'pago' THEN
    RAISE EXCEPTION 'entrada_ja_paga: entrada já está completamente paga';
  END IF;
  IF p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'valor_invalido: valor deve ser positivo';
  END IF;

  -- 2. Registra o movimento (imutável)
  INSERT INTO public.financial_transactions
    (organization_id, account_id, entry_id, descricao, valor, tipo, data_transacao, user_id)
  VALUES
    (v_entry.organization_id, p_account_id, p_entry_id,
     v_entry.descricao, -p_valor_pago, 'debito', p_data_pagamento, p_user_id)
  RETURNING id INTO v_transaction_id;

  -- 3. Atualiza saldo atomicamente
  UPDATE public.accounts SET saldo = saldo - p_valor_pago
  WHERE id = p_account_id RETURNING saldo INTO v_saldo_novo;

  -- 4. Atualiza status da entrada
  UPDATE public.financial_entries
  SET status = CASE WHEN p_valor_pago >= v_entry.valor THEN 'pago' ELSE 'parcial' END,
      atualizado_em = now()
  WHERE id = p_entry_id;

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'valor_pago', p_valor_pago,
    'saldo_conta', v_saldo_novo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
```

---

## Estorno — O Jeito Correto de "Desfazer"

**Nunca delete. Nunca edite. Sempre estorne.**

```sql
CREATE OR REPLACE FUNCTION public.estornar_transacao(
  p_transaction_id UUID,
  p_motivo         TEXT,
  p_user_id        UUID
) RETURNS JSON AS $$
DECLARE
  v_original financial_transactions%ROWTYPE;
  v_estorno_id UUID;
BEGIN
  SELECT * INTO v_original FROM public.financial_transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'transacao_nao_encontrada: %', p_transaction_id; END IF;
  IF v_original.estornado THEN RAISE EXCEPTION 'transacao_ja_estornada'; END IF;

  -- Marca original como estornada
  UPDATE public.financial_transactions SET estornado = true WHERE id = p_transaction_id;

  -- Cria estorno com valor OPOSTO
  INSERT INTO public.financial_transactions
    (organization_id, account_id, entry_id, descricao, valor, tipo, data_transacao,
     transacao_original_id, user_id)
  VALUES
    (v_original.organization_id, v_original.account_id, v_original.entry_id,
     'ESTORNO: ' || v_original.descricao || ' — ' || p_motivo,
     -v_original.valor,  -- ← valor OPOSTO
     'estorno', CURRENT_DATE, p_transaction_id, p_user_id)
  RETURNING id INTO v_estorno_id;

  -- Reverte o saldo
  UPDATE public.accounts SET saldo = saldo + (-v_original.valor) WHERE id = v_original.account_id;

  RETURN json_build_object('estorno_id', v_estorno_id, 'original_id', p_transaction_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
```

---

## View de Extrato

```sql
CREATE OR REPLACE VIEW public.vw_extrato AS
SELECT
  t.id, t.organization_id, t.account_id,
  a.nome AS nome_conta,
  t.descricao, t.valor, t.tipo, t.data_transacao, t.estornado, t.criado_em,
  SUM(CASE WHEN t.estornado THEN 0 ELSE t.valor END)
    OVER (PARTITION BY t.account_id ORDER BY t.data_transacao, t.criado_em) AS saldo_acumulado,
  u.email AS lancado_por,
  fe.categoria
FROM public.financial_transactions t
JOIN public.accounts a ON t.account_id = a.id
JOIN auth.users u ON t.user_id = u.id
LEFT JOIN public.financial_entries fe ON t.entry_id = fe.id
ORDER BY t.data_transacao DESC, t.criado_em DESC;
```

---

## Perguntas de Revisão

1. Um usuário quer "editar" um lançamento errado. Como implementar?
   → Estorno do original + novo lançamento correto. Nunca UPDATE.

2. Dois usuários pagam a mesma fatura ao mesmo tempo. O que garante consistência?
   → `SELECT ... FOR UPDATE` na RPC. Apenas um completa; o outro recebe erro.

3. O saldo de uma conta está R$ 50 diferente do esperado. Como investigar?
   → `SELECT SUM(valor) FROM financial_transactions WHERE account_id = ? AND estornado = false`
   Deve ser igual ao `saldo` na tabela `accounts`. Se diferente: bug na atomicidade.

4. É seguro calcular o saldo no frontend e salvar via UPDATE?
   → Absolutamente não. Em acesso simultâneo, um sobrescreve o outro. Use RPC.
