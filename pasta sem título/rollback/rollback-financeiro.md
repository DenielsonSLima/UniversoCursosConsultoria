# Rollback Financeiro — Protocolo Crítico

Erros que envolvem dinheiro real: valores de venda, lucro, comissões, contas a pagar/receber, participação de sócios.

---

## 🔴 REGRA ABSOLUTA

> **NUNCA corrija um dado financeiro sem confirmar com o usuário qual é o valor correto.**

O agente não sabe o valor certo. Só o usuário sabe.
Uma correção errada em dado financeiro é pior do que deixar o erro original.

---

## PASSO 1 — AO IDENTIFICAR ERRO FINANCEIRO, PARE TUDO

1. **PARE** — nenhuma operação no banco enquanto não entender o problema
2. **ISOLE** — identifique o registro específico com problema (ID, data, valor)
3. **DOCUMENTE** — anote o valor atual (errado) e o valor esperado
4. **AVISE** — informe o usuário com o template abaixo
5. **AGUARDE** confirmação antes de qualquer correção

**Template de aviso obrigatório:**
```
🔴 ERRO FINANCEIRO IDENTIFICADO

Tabela: [nome]
Registro: ID [id] — [descrição do registro]
Valor atual (errado): [valor]
Valor esperado (correto): [valor — aguardando confirmação do usuário]

NÃO alterei nada ainda.
Confirma o valor correto para eu prosseguir com a correção?
```

---

## PASSO 2 — ISOLAR O REGISTRO AFETADO

Antes de corrigir, confirme que só aquele registro está errado:

```sql
-- Verificar o registro específico
SELECT id, valor, created_at, updated_at, [campos relevantes]
FROM nome_tabela
WHERE id = 'id_do_registro';

-- Verificar se outros registros do mesmo período também estão errados
SELECT id, valor, created_at
FROM nome_tabela
WHERE created_at BETWEEN 'data_inicio' AND 'data_fim'
ORDER BY created_at DESC;

-- Verificar consistência entre tabelas relacionadas
-- Ex: pedido de compra vs título financeiro
SELECT p.id, p.valor_total, t.valor as titulo_valor
FROM pedidos_compra p
LEFT JOIN titulos_financeiros t ON t.pedido_id = p.id
WHERE p.id = 'id_do_pedido';
```

---

## PASSO 3 — CORREÇÃO CIRÚRGICA (só após confirmação do usuário)

**Use UPDATE cirúrgico — nunca recalcule em massa:**

```sql
-- Sempre com WHERE exato — nunca UPDATE sem WHERE
BEGIN;

UPDATE nome_tabela
SET valor = [valor_correto_confirmado],
    updated_at = NOW(),
    observacao = 'Correção manual: [motivo] — autorizado por [usuário] em [data]'
WHERE id = 'id_exato_do_registro';

-- Verificar antes de confirmar
SELECT id, valor, observacao FROM nome_tabela WHERE id = 'id_exato_do_registro';

-- SE estiver correto:
COMMIT;

-- SE estiver errado:
ROLLBACK;
```

**NUNCA use UPDATE sem WHERE.**
**NUNCA use DELETE em dado financeiro — use um campo `cancelado = true` ou `status = 'cancelado'`.**

---

## CHECKLIST DE CONSISTÊNCIA FINANCEIRA — HIDROCAR

Rode após qualquer correção em dado financeiro:

```sql
-- 1. Pedido de compra tem título financeiro correspondente?
SELECT p.id, p.valor_total,
       COALESCE(SUM(t.valor), 0) as total_titulos,
       p.valor_total - COALESCE(SUM(t.valor), 0) as diferenca
FROM pedidos_compra p
LEFT JOIN titulos_financeiros t ON t.pedido_id = p.id
GROUP BY p.id, p.valor_total
HAVING ABS(p.valor_total - COALESCE(SUM(t.valor), 0)) > 0.01;

-- 2. Participação de sócios soma 100%?
SELECT SUM(percentual) as total_percentual
FROM socios;
-- Deve retornar: 100.00

-- 3. Saldo de conta bate com movimentações?
SELECT conta_id,
       SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END) as saldo_calculado
FROM movimentacoes
GROUP BY conta_id;
```

**SE qualquer checagem mostrar inconsistência → documente e avise o usuário antes de tentar corrigir.**

---

## REGRAS RÁPIDAS

| Situação | Ação |
|----------|------|
| Encontrou erro financeiro | Para, documenta, avisa o usuário |
| Usuário confirmou o valor correto | Corrige com UPDATE cirúrgico dentro de BEGIN/COMMIT |
| Precisa "apagar" um lançamento | Nunca DELETE — usa status = 'cancelado' |
| Não sabe qual valor é o correto | Não toca. Só o usuário decide. |
| Correção afeta mais de 1 registro | Avisa o usuário antes — nunca UPDATE em massa sem confirmação |
