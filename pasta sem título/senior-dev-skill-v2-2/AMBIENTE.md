# AMBIENTE — Como Configurar e Rodar o Projeto

> Qualquer desenvolvedor ou agente de IA deve conseguir rodar o projeto
> do zero seguindo este documento, sem precisar perguntar nada a ninguém.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Verificar |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| npm | 10.x | `npm --version` |
| Supabase CLI | 1.x | `supabase --version` |
| Git | qualquer | `git --version` |
| Docker Desktop | qualquer | `docker --version` |

> Docker é necessário para rodar o Supabase localmente.

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
# Supabase — valores do projeto local (não de produção!)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJ...  # gerado pelo supabase start

# Nunca aqui:
# VITE_SUPABASE_SERVICE_ROLE_KEY ← PROIBIDO no frontend
```

> Os valores de produção ficam no Vercel/servidor. Nunca em `.env.local` commitado.

---

## Passo 3: Iniciar Supabase Local

```bash
# Inicia o banco local e as Edge Functions (precisa de Docker)
supabase start

# Saída esperada:
# API URL: http://127.0.0.1:54321
# Anon key: eyJ...
# Service role key: eyJ...  ← use APENAS em Edge Functions
# Studio URL: http://127.0.0.1:54323
```

---

## Passo 4: Rodar as Migrações

```bash
# Aplica todos os arquivos de supabase/migrations/ em ordem
supabase db reset

# Saída esperada:
# Resetting database...
# Applying migration 20240101000000_create_organizations.sql
# Applying migration 20240101000001_create_contas.sql
# ...
# Seeding data supabase/seed.sql
# Done.
```

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
supabase start           # Inicia backend local
supabase db reset        # Reset + migrações + seed

# Testes
npm run test             # Testes unitários (Vitest)
npm run test:coverage    # Com relatório de cobertura
npm run test:e2e         # Playwright E2E

# Banco de dados
supabase migration new nome_da_migracao   # Cria nova migração
supabase db diff                          # Mostra diff do schema
supabase gen types typescript             # Gera tipos a partir do banco

# Edge Functions
supabase functions serve                  # Serve Edge Functions localmente
supabase functions deploy nome-funcao     # Deploy de uma função específica

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
| `supabase start` falha | Docker não está rodando | Inicie o Docker Desktop |
| Tipos desatualizados | Schema mudou sem regenerar | `supabase gen types typescript` |
| RLS bloqueando query | Usuário não autenticado localmente | Faça login no app antes |
| Edge Function com erro 401 | JWT inválido ou expirado | Refaça login |
| Migração falhando | SQL com erro de sintaxe | Verifique o arquivo em `supabase/migrations/` |

---

## Para Agentes de IA

Se você é um agente gerando código para este projeto:

1. Assuma que o ambiente está configurado conforme descrito aqui
2. Variáveis de ambiente disponíveis no frontend: apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
3. Variáveis disponíveis em Edge Functions: todas do Supabase + as definidas em `supabase/functions/.env`
4. **Nunca gere código que usa `SERVICE_ROLE_KEY` no frontend**
5. Ao gerar migrações, use o formato: `YYYYMMDDHHMMSS_descricao_da_mudanca.sql`
