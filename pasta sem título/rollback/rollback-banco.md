# Rollback de Banco de Dados — Supabase / PostgreSQL

---

## 🚨 REGRA ANTES DE QUALQUER ALTERAÇÃO NO BANCO

**NUNCA execute ALTER TABLE, DROP ou migration destrutiva sem:**
1. Verificar se há dados na tabela afetada
2. Anotar o estado atual (SELECT dos registros importantes)
3. Ter o SQL de rollback já escrito antes de executar
4. Testar em dev antes de rodar em produção

---

## ROLLBACK DE MIGRATION APLICADA ERRADA

**SE uma migration já foi aplicada e está errada:**

1. Congele — não aplique mais nenhuma migration
2. Identifique exatamente o que foi feito
3. Escreva o SQL inverso antes de executar:

```sql
-- Desfazer ADD COLUMN
ALTER TABLE nome_tabela DROP COLUMN IF EXISTS nome_coluna;

-- Desfazer CREATE TABLE
DROP TABLE IF EXISTS nome_tabela;

-- Desfazer mudança de tipo
ALTER TABLE nome_tabela
ALTER COLUMN nome_coluna TYPE tipo_original
USING nome_coluna::tipo_original;

-- Desfazer RENAME COLUMN
ALTER TABLE nome_tabela RENAME COLUMN nome_novo TO nome_original;

-- Desfazer ADD CONSTRAINT
ALTER TABLE nome_tabela DROP CONSTRAINT IF EXISTS nome_constraint;
```

4. Execute o rollback
5. Verifique que o estado voltou ao esperado:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'nome_tabela';
```

---

## DIAGNÓSTICO DE RLS BLOQUEANDO

**SE usuário não consegue acessar dados:**

```sql
-- Ver policies ativas na tabela
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'nome_tabela';

-- Ver se RLS está habilitado
SELECT relname, relrowsecurity
FROM pg_class WHERE relname = 'nome_tabela';
```

**Teste rápido:** Use a chave `service_role` do Supabase (bypassa RLS).
- Se o dado aparece com service_role mas não com authenticated → problema de policy, não de dado.

**Correção — NUNCA desative o RLS. Corrija a policy:**
```sql
CREATE POLICY "nome_policy"
ON nome_tabela FOR SELECT TO authenticated
USING (empresa_id = (
  SELECT empresa_id FROM usuarios WHERE id = auth.uid()
));
```

---

## DIAGNÓSTICO DE TRIGGER COM PROBLEMA

```sql
-- Ver triggers da tabela
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'nome_tabela';

-- Ver código da função do trigger
SELECT proname, prosrc FROM pg_proc WHERE proname = 'nome_funcao';
```

**Para isolar se o trigger é o problema:**
```sql
-- Desabilitar temporariamente
ALTER TABLE nome_tabela DISABLE TRIGGER nome_trigger;

-- Testar a operação sem o trigger
-- Se funcionou → o bug está no trigger

-- Reabilitar após corrigir
ALTER TABLE nome_tabela ENABLE TRIGGER nome_trigger;
```

---

## CHECKLIST ANTES DE APLICAR MIGRATION EM PRODUÇÃO

```
[ ] Testei em desenvolvimento?
[ ] Tenho o SQL de rollback escrito e pronto?
[ ] A migration não apaga dados existentes?
[ ] Verifiquei impacto nas policies de RLS?
[ ] Verifiquei impacto nos triggers?
[ ] Avisei o usuário se for alteração em produção?
```
