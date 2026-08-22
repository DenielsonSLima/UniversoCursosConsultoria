# Integração Supabase

Status: CANÔNICO. Última revisão: 2026-08-12.

## Papel no sistema

Supabase fornece Auth, PostgreSQL, RLS, RPCs, Realtime, Storage e Edge
Functions. É a camada autoritativa de dados e regras de negócio.

## Estrutura do repositório

| Caminho | Responsabilidade |
| --- | --- |
| lib/supabase.ts | Cliente público usado pelo frontend. |
| supabase/migrations/ | Histórico ordenado de schema, RLS, RPCs e triggers. |
| supabase/functions/ | Edge Functions privadas ou autenticadas. |
| supabase/tests/ | Contratos de banco e migrations. |
| supabase/config.toml | Configuração de desenvolvimento local. |

## Regras obrigatórias

- RLS deve existir em dados expostos.
- Operações críticas usam RPC ou Edge Function com autorização interna.
- SECURITY DEFINER só é aceitável com autorização explícita e search_path
  seguro.
- Cliente web nunca recebe service role, segredo de banco ou token de gateway.
- Migrations aplicadas são imutáveis; correções entram em migrations novas.
- Mudanças remotas são feitas somente pelos conectores Supabase autorizados
  neste projeto.

## Configuração

No frontend, use apenas VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY, ou seus
aliases compatíveis listados em lib/supabase.ts.

No Supabase, configure:

- URL pública e redirecionamentos de Auth;
- provedores, sessão e requisitos de senha;
- buckets e políticas de Storage;
- secrets das Edge Functions;
- jobs, webhooks e credenciais externas privadas;
- versões e verify_jwt das funções.

## Operação

Antes de mudar banco, Auth, RLS ou Storage:

1. Ler a política de Supabase e segurança.
2. Identificar tabelas, funções e políticas afetadas.
3. Validar autorização e caminho de falha.
4. Aplicar uma migration nova pelo procedimento autorizado.
5. Conferir migrations e funções ativas após a aplicação.

