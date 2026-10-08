# Financeiro do aluno: identidade Banese e desconto confirmado

## Objetivo e aceite

Entrega 4.8.184, autorizada para produção pelo usuário em 08/10/2026.
Aluno autenticado por matrícula deve abrir BolePix, boleto PDF e carnê próprios.
O financeiro deve exibir desconto bancário confirmado e valor pagável vigente,
com todos os cálculos no backend/RPC e valor nominal preservado.
Exemplo sintético: nominal R$ 279,90, desconto R$ 19,90 e pagamento R$ 260,00.

## Implementação

- Resolver compartilhado por auth_user_id validado por auth.getUser nos três
  endpoints. Mantém RLS no detalhe, status ativo, titularidade e fluxo gestor/polo.
- Helper SQL privado valida termos confirmados, identidade bancária, quarentena,
  nominal/vencimento, desconto fixo/percentual e prazo civil em America/Maceio.
- Migrações incrementais preservam o leitor anterior e o tratamento de
  dependências; saldo, destaque e total pendente usam o valor pagável canônico.
- Pagamento parcial é deduzido uma vez. Pagamento concluído mantém valor efetivo.
- Frontend continua exibindo os valores do backend; nenhuma aritmética financeira
  foi acrescentada ao navegador. Não há cancelamento, reemissão ou edição de títulos.

## Manifesto explícito

- `.github/workflows/student-banese-finance.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-08-aluno-banese-identidade-desconto.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/functions/_shared/banese-student-identity.test.ts`
- `supabase/functions/_shared/banese-student-identity.ts`
- `supabase/functions/banese-boleto-document/document-policy.test.ts`
- `supabase/functions/banese-boleto-document/document-policy.ts`
- `supabase/functions/banese-boleto-document/index.ts`
- `supabase/functions/banese-carnet-document/index.ts`
- `supabase/functions/banese-student-payment/README.md`
- `supabase/functions/banese-student-payment/index.ts`
- `supabase/migrations/20261008113200_student_banese_confirmed_discount.sql`
- `supabase/migrations/20261008113210_student_banese_financial_summary.sql`
- `supabase/migrations/20261008113220_student_banese_financial_list.sql`
- `supabase/tests/banese_student_identity_handlers.fixture.mjs`
- `supabase/tests/banese_student_identity_handlers.test.mjs`
- `supabase/tests/fixtures/student-banese-discount-schema.sql`
- `supabase/tests/fixtures/student-banese-original-reader.sql`
- `supabase/tests/student_banese_discount.isolated.test.mjs`

Total: 22 arquivos.

## Validação e revisão

- Causa confirmada em código, cadastro e termos do título em produção, sem guardar
  identificadores pessoais no registro ou nas fixtures.
- 9 testes de identidade e 31 cenários HTTP dos três handlers com serviços isolados.
- 6 grupos SQL comportamentais em PGlite 0.3.14/PostgreSQL 17.5: regressão original,
  limites e validade, valor parcial/pago, termos incompatíveis, legado e autorização.
- Deno check dos três bundles de produção com o patch aplicado aprovado.
- Revisão independente conferiu identidade, escopo, regras preservadas e cálculos.
- CI e Preview Vercel devem aprovar o commit exato antes da publicação. Incluem
  TypeScript, lint, build, controle de versão, teto de linhas e testes contratuais.
- Sessão autenticada de aluno indisponível: teste de navegador com sessão real
  permanece distinto dos testes de handlers e SQL isolados.

## Ordem de publicação e recuperação

1. Validar commit, CI e Preview do lote e conferir ausência de mudança concorrente.
2. Aplicar as três migrations na ordem 113200, 113210 e 113220; verificar o helper
   contra o título real e confirmar ACLs e guarda de identidade preservadas.
3. Publicar banese-student-payment, banese-boleto-document e banese-carnet-document
   preservando verify_jwt e dependências implantadas fora do manifesto.
4. Conferir bundles implantados, integrar a branch e acompanhar produção Vercel.
5. Em falha, restaurar somente o componente afetado a partir do snapshot prévio;
   não editar migrations históricas nem alterar títulos para contornar o problema.

Snapshots das funções e bundles anteriores ficam fora do repositório e sem
credenciais. A confirmação efetiva da implantação é registrada na entrega/PR.
