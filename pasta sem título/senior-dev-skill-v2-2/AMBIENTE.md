# AMBIENTE — Como Configurar e Rodar o Projeto

> Qualquer desenvolvedor ou agente de IA deve conseguir rodar o projeto
> do zero seguindo este documento, sem precisar perguntar nada a ninguém.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Verificar |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| npm | 10.x | `npm --version` |
| Git | qualquer | `git --version` |
| Docker Desktop | qualquer | `docker --version` |

> Docker pode ser útil para outros serviços locais, mas agentes de IA não devem tentar iniciar Supabase local neste projeto.

> Supabase neste projeto é somente via MCP Supabase. Não execute nenhum comando `supabase ...`, nem local, nem remoto, nem apenas para listar/consultar. A CLI já apresentou `401 Unauthorized` enquanto o MCP estava autorizado.

---

## Passo 1: Clonar e Instalar

```bash
git clone https://github.com/empresa/nome-do-projeto.git
cd nome-do-projeto
npm install
```

---

## Passo 2: Configurar Variáveis de Ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com os valores corretos:

```env
# Supabase — valores do projeto autorizado
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=eyJ...

# Nunca aqui:
# VITE_SUPABASE_SERVICE_ROLE_KEY ← PROIBIDO no frontend
```

> Os valores de produção ficam no Vercel/servidor. Nunca em `.env.local` commitado.

---

## Passo 3: Usar Supabase Pelo MCP

Para banco, migrations, logs, Auth, Storage, RLS e Edge Functions, use as ferramentas MCP Supabase disponíveis na sessão (`execute_sql`, `apply_migration`, logs e equivalentes). Não execute comandos `supabase ...`.

---

## Passo 4: Rodar as Migrações

Crie o arquivo SQL versionado em `supabase/migrations/` e aplique no projeto autorizado usando MCP Supabase `apply_migration`. Valide com `execute_sql`/logs MCP quando necessário.

---

## Passo 5: Iniciar o Frontend

```bash
npm run dev
# Acesse: http://localhost:5173
```

---

## Comandos do Dia a Dia

```bash
# Desenvolvimento
npm run dev              # Inicia frontend

# Testes
npm run test             # Testes unitários (Vitest)
npm run test:coverage    # Com relatório de cobertura
npm run test:e2e         # Playwright E2E

# Banco de dados
# Criar migrations manualmente em supabase/migrations/
# Aplicar e validar sempre pelo MCP Supabase

# Edge Functions
# Deploy/listagem/leitura de Edge Functions: usar MCP Supabase

# Qualidade
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit (zero erros = ok)
npm run build            # Build de produção
```

---

## Estrutura de Arquivos de Configuração

```
├── .env.example         ← Modelo de variáveis (commitado, sem valores reais)
├── .env.local           ← Valores locais (NÃO commitado - no .gitignore)
├── tsconfig.json        ← TypeScript strict: true
├── vite.config.ts       ← Aliases @/ configurados
├── vitest.config.ts     ← Configuração de testes
├── .eslintrc.js         ← Regras de lint
└── supabase/
    ├── config.toml      ← Config do projeto Supabase local
    ├── migrations/      ← SQL versionado (commitado)
    └── seed.sql         ← Dados de dev (commitado)
```

---

## Dados de Teste (seed)

O `supabase/seed.sql` cria automaticamente:

```
Organização: "Empresa Teste A" (org-a-uuid)
Organização: "Empresa Teste B" (org-b-uuid)

Usuário Admin A: admin@empresa-a.com / senha123
Usuário Membro A: membro@empresa-a.com / senha123
Usuário Admin B: admin@empresa-b.com / senha123

Contas de teste para Empresa A: Caixa Principal, Conta Corrente
Lançamentos de exemplo para testar extrato
```

> Use estes dados para testar isolamento: logado como Admin A, você não deve ver nada da Empresa B.

---

## Problemas Comuns

| Problema | Causa | Solução |
|---|---|---|
| RLS bloqueando query | Usuário não autenticado localmente | Faça login no app antes |
| Edge Function com erro 401 | JWT inválido ou expirado | Refaça login |
| Tentação de usar Supabase CLI | Hábito antigo/atalho incorreto | Não execute; use MCP Supabase |
| Migração falhando | SQL com erro de sintaxe | Verifique o arquivo em `supabase/migrations/` |

---

## Para Agentes de IA

Se você é um agente gerando código para este projeto:

1. Assuma que o ambiente está configurado conforme descrito aqui
2. Variáveis de ambiente disponíveis no frontend: apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
3. Variáveis disponíveis em Edge Functions: todas do Supabase + as definidas em `supabase/functions/.env`
4. **Nunca gere código que usa `SERVICE_ROLE_KEY` no frontend**
5. Ao gerar migrações, use o formato: `YYYYMMDDHHMMSS_descricao_da_mudanca.sql`
6. Para qualquer ação de Supabase, use MCP Supabase. Não tente nenhum comando `supabase ...` neste projeto.
