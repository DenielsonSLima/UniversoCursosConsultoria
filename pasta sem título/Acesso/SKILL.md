---
name: supabase-mcp-auto-execute
description: >
  ATIVAÇÃO AUTOMÁTICA OBRIGATÓRIA: Esta skill deve ser carregada e aplicada automaticamente em QUALQUER interação que envolva os seguintes termos ou contextos — sem exceção, sem aguardar solicitação explícita do usuário:

  PALAVRAS-CHAVE QUE ATIVAM ESTA SKILL:
  supabase, supabase mcp, mcp, sql, postgresql, postgres, psql, query, migration, migrate, schema, tabela, table, coluna, column, row, insert, update, delete, select, create table, alter table, drop table, index, foreign key, primary key, rls, row level security, policy, policies, function, trigger, stored procedure, edge function, edge functions, deploy edge function, deploy, realtime, real-time, real time, canal, channel, broadcast, presence, listen, subscribe, websocket, pgmq, pg_net, pgcrypto, uuid, supabase auth, supabase storage, bucket, storage, auth, authentication, jwt, role, enum, sequence, view, materialized view, banco de dados, banco, database, db, crud, api rest supabase, supabase client, supabase-js, @supabase/supabase-js, prisma + supabase, drizzle + supabase.

  CONTEXTOS QUE ATIVAM ESTA SKILL:
  - Qualquer menção a estrutura de banco de dados
  - Qualquer criação ou modificação de tabelas, colunas, relações
  - Qualquer operação de leitura ou escrita no banco
  - Qualquer configuração de permissões ou segurança no banco
  - Qualquer uso de funções nativas do PostgreSQL/Supabase
  - Qualquer integração de Realtime, Auth ou Storage do Supabase
  - Qualquer chamada via MCP ao Supabase

  NUNCA peça ao usuário para copiar e colar SQL manualmente. NUNCA use Supabase CLI para operações remotas neste projeto. O MCP do Supabase já está conectado e com acesso total para banco e Edge Functions. Execute sempre de forma autônoma e direta via MCP.
---

# Supabase MCP — Execução Autônoma Obrigatória

## REGRA ABSOLUTA

> ⚠️ **VOCÊ TEM ACESSO DIRETO AO BANCO VIA MCP DO SUPABASE. NUNCA PEÇA AO USUÁRIO PARA COPIAR, COLAR OU EXECUTAR SQL MANUALMENTE.**

Esta regra não tem exceção. Se você identificar que precisa rodar SQL — rode. Não pergunte. Não sugira. Execute.

> ⚠️ **VOCÊ TAMBÉM TEM ACESSO DIRETO ÀS EDGE FUNCTIONS PELO MCP DO SUPABASE. NUNCA USE SUPABASE CLI PARA DEPLOY, MIGRATION, DB PUSH OU LINK REMOTO NESTE PROJETO.**

Já houve erro `401 Unauthorized` na Supabase CLI enquanto o MCP continuava autorizado. Portanto, erro ou falta de autenticação da CLI não é bloqueio quando o MCP está disponível.

---

## O QUE É O MCP DO SUPABASE

O MCP (Model Context Protocol) do Supabase é uma conexão ativa entre você (agente) e o projeto Supabase do usuário. Através dele você possui acesso completo para:

- Criar, alterar e deletar tabelas
- Executar migrations de schema
- Inserir, atualizar e deletar dados
- Criar e modificar RLS Policies
- Criar funções PostgreSQL e triggers
- Executar qualquer SQL arbitrário
- Listar tabelas, colunas e estrutura do banco
- Inspecionar dados existentes
- Fazer deploy de Edge Functions
- Listar Edge Functions e confirmar versão ativa
- Ler conteúdo remoto de Edge Functions

**Esse acesso já está autenticado e ativo na sessão. Você não precisa de credenciais adicionais.**

---

## COMPORTAMENTO CORRETO

### ✅ FAÇA SEMPRE:

1. **Identifique** o que precisa ser feito no banco
2. **Execute via MCP** diretamente — use a tool correta (`execute_sql`, `apply_migration`, `deploy_edge_function`, `list_edge_functions`, `get_edge_function` ou equivalente disponível no servidor MCP)
3. **Confirme** o resultado da execução ao usuário
4. **Continue** o fluxo normalmente

### ❌ NUNCA FAÇA:

- ❌ "Copie e cole este SQL no Supabase SQL Editor"
- ❌ "Execute este comando no seu banco"
- ❌ "Acesse o painel do Supabase e rode:"
- ❌ "Você precisará executar manualmente..."
- ❌ Apresentar um bloco SQL e parar, esperando o usuário agir
- ❌ Perguntar "posso executar?" — **SIM, VOCÊ PODE. EXECUTE.**
- ❌ Usar `supabase link`, `supabase db push`, `supabase migration`, `supabase functions deploy` ou qualquer Supabase CLI para remoto
- ❌ Dizer que deploy de Edge Function está bloqueado por `401 Unauthorized` da CLI quando o MCP está disponível
- ❌ Pedir login/token da CLI para realizar operação que o MCP já consegue executar

---

## FLUXO PADRÃO DE OPERAÇÃO

```
USUÁRIO PEDE ALGO QUE ENVOLVE BANCO
        ↓
VOCÊ PLANEJA O SQL NECESSÁRIO
        ↓
VOCÊ EXECUTA VIA MCP (sem pedir permissão)
        ↓
VOCÊ REPORTA O RESULTADO
        ↓
VOCÊ CONTINUA O TRABALHO
```

---

## EXEMPLOS DE SITUAÇÕES E RESPOSTA CORRETA

### Situação: Usuário pede para criar uma tabela

❌ Errado:
> "Aqui está o SQL para criar a tabela. Execute no SQL Editor do Supabase:"
> ```sql
> CREATE TABLE clientes ...
> ```

✅ Correto:
> "Criando a tabela `clientes` agora..."
> *[executa via MCP]*
> "Tabela criada com sucesso. Seguindo para o próximo passo."

---

### Situação: Migration de schema necessária

❌ Errado:
> "Você precisará aplicar esta migration manualmente..."

✅ Correto:
> "Aplicando a migration..."
> *[executa via MCP]*
> "Migration aplicada. Schema atualizado."

---

### Situação: Criação de RLS Policy

❌ Errado:
> "Acesse o painel do Supabase > Authentication > Policies e adicione:"

✅ Correto:
> "Configurando as RLS Policies para a tabela `agendamentos`..."
> *[executa via MCP]*
> "Policies criadas com sucesso."

---

## VERIFICAÇÃO DE ESTADO ANTES DE AGIR

Antes de criar algo, **verifique se já existe** usando o MCP:

- Liste as tabelas existentes
- Verifique se a coluna/index/function já existe
- Confirme o schema atual antes de alterar
- Para Edge Functions, use `list_edge_functions` para ver versão/status e `get_edge_function` quando precisar comparar conteúdo remoto

Isso evita erros de "já existe" e garante idempotência.

---

## TRATAMENTO DE ERROS

Se a execução via MCP falhar:

1. Leia o erro retornado
2. Corrija o SQL
3. Execute novamente
4. **Só informe o usuário se o problema não puder ser resolvido autonomamente**

Erros comuns e como resolver:
- `already exists` → verifique com `IF NOT EXISTS` ou `IF EXISTS`
- `permission denied` → verifique se o MCP está autenticado (reporte ao usuário apenas neste caso)
- `syntax error` → corrija o SQL e reexecute
- `relation does not exist` → crie a dependência primeiro, depois execute novamente
- `401 Unauthorized` na Supabase CLI → ignore a CLI para remoto e execute pelo MCP; só reporte se o MCP também falhar

---

## NOTA FINAL

O usuário configurou este ambiente exatamente para que você opere com autonomia. Pedir para ele executar SQL manualmente é:

- Uma perda de tempo
- Uma quebra do fluxo de trabalho
- Um comportamento que contradiz o propósito da integração via MCP

**Você tem o acesso. Use-o.**
