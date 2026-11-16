# Cupons EAD — desenvolvimento local isolado

## Objetivo e autorização

Implementar o cadastro e resgate de cupons EAD de 50% ou 100%, com três agentes,
modularização, serviços, hooks, formulários, TanStack Query e Realtime.
Autorização de 16/11/2026 restrita ao workspace local e testes com dados fictícios.
Produção, publicação, migrations remotas e operações bancárias estão fora do lote.

## Etapas e critérios de aceite

1. Conferir checkout, autorização e financeiro existentes; preservar alterações paralelas.
2. Criar backend transacional com limites, idempotência, escopo por polo e histórico.
3. Integrar gestão na Secretaria e cupom antes da cobrança do aluno.
4. Testar gratuidades, desconto, limites, permissões, repetição, concorrência e isolamento.
5. Conferir integração, TypeScript, lint, teto de linhas e build local proporcional.

Benefícios: gratuito ou 50%; total limitado ou ilimitado; período; cursos por aluno;
ativo/inativo; todos os cursos ou selecionados. Cadastro exige Secretaria e Financeiro.
Gratuidade sem dívida ou receita; desconto cobra principal canônico e libera após baixa.

## Isolamento

- A configuração `.env.development.local` existente aponta para produção e será preservada.
- Frontend de cupons exige DEV, opt-in explícito e endpoint Supabase loopback.
- Backend será versionado localmente, sem aplicação remota.
- Dados de teste sintéticos em PostgreSQL WASM/PGlite; nenhuma cobrança bancária.
- Fluxo sem cupom e trabalho paralelo já existente nos arquivos compartilhados preservados.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-16-cupons-ead-local.md`
- `modules/aluno/cursos/components/CourseCatalogView.tsx`
- `modules/aluno/cursos/components/EadCheckoutReviewModal.tsx`
- `modules/aluno/cursos/components/cupons/EadCouponField.tsx`
- `modules/aluno/cursos/hooks/useCourseCheckout.ts`
- `modules/asaas/asaas.service.ts`
- `modules/ead/cupons/README.md`
- `modules/ead/cupons/coupons-access.test.ts`
- `modules/ead/cupons/coupons-access.ts`
- `modules/ead/cupons/coupons-environment.test.ts`
- `modules/ead/cupons/coupons-environment.ts`
- `modules/ead/cupons/coupons-management.service.ts`
- `modules/ead/cupons/coupons-management.types.ts`
- `modules/ead/cupons/coupons-student.interaction.test.mjs`
- `modules/ead/cupons/coupons-student.keys.ts`
- `modules/ead/cupons/coupons-student.service.ts`
- `modules/ead/cupons/coupons-student.types.ts`
- `modules/ead/cupons/hooks/useEadCouponCheckout.ts`
- `modules/ead/cupons/hooks/useEadCouponStudentRealtime.ts`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/secretaria/cupons-ead/CuponsEadPage.tsx`
- `modules/gestor/secretaria/cupons-ead/components/CupomHistoryDialog.tsx`
- `modules/gestor/secretaria/cupons-ead/components/CuponsEadList.tsx`
- `modules/gestor/secretaria/cupons-ead/components/CuponsPagination.tsx`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.css`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.formatters.ts`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.interaction.test.mjs`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.keys.ts`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.ui.fixture.mjs`
- `modules/gestor/secretaria/cupons-ead/formularios/CupomCoursesField.tsx`
- `modules/gestor/secretaria/cupons-ead/formularios/CupomEadForm.tsx`
- `modules/gestor/secretaria/cupons-ead/formularios/cupom-form.model.test.ts`
- `modules/gestor/secretaria/cupons-ead/formularios/cupom-form.model.ts`
- `modules/gestor/secretaria/cupons-ead/hooks/useCupomDialog.ts`
- `modules/gestor/secretaria/cupons-ead/hooks/useCuponsEadMutations.ts`
- `modules/gestor/secretaria/cupons-ead/hooks/useCuponsEadQueries.ts`
- `modules/gestor/secretaria/cupons-ead/hooks/useCuponsEadRealtime.ts`
- `modules/gestor/secretaria/cupons-navigation.interaction.test.mjs`
- `package.json`
- `scripts/ead-coupons-local/Preview.tsx`
- `scripts/ead-coupons-local/README.md`
- `scripts/ead-coupons-local/preview-database.mjs`
- `scripts/ead-coupons-local/preview-http.test.mjs`
- `scripts/ead-coupons-local/preview.css`
- `scripts/ead-coupons-local/start.mjs`
- `scripts/ead-coupons-local/transport.ts`
- `scripts/test-ead-coupons-local.mjs`
- `supabase/functions/gateways/checkout/ead-checkout-attempt.ts`
- `supabase/functions/gateways/checkout/ead-context.test.ts`
- `supabase/functions/gateways/checkout/ead-context.ts`
- `supabase/functions/gateways/checkout/ead-coupon-checkout.test.ts`
- `supabase/functions/gateways/checkout/ead-coupon-checkout.ts`
- `supabase/migrations/20261116095340_ead_coupons_schema.sql`
- `supabase/migrations/20261116095344_ead_coupons_management.sql`
- `supabase/migrations/20261116095348_ead_coupons_quote.sql`
- `supabase/migrations/20261116095351_ead_coupons_free_redemption.sql`
- `supabase/migrations/20261116095355_ead_coupons_paid_checkout.sql`
- `supabase/tests/ead_coupons.integrated.interaction.test.mjs`
- `supabase/tests/ead_coupons.isolated.test.mjs`
- `supabase/tests/fixtures/ead-coupons.harness.mjs`

Total: 63 arquivos.

## Validação e resultado

- 70 testes automatizados aprovados: 37 Node (incluindo 12 SQL/PGlite) e 33 Deno.
- Integração real UI → serviços → SQL: cadastro, gratuidade sem dívida, principal com
  desconto, rejeição de situação paga sem prova e liberação após evidência sintética.
- Prévia HTTP local validada com token/origem, whitelist, permissão, replay e histórico.
- TypeScript, lint focado e build Vite completo aprovados, sem publicação.
- Build executado com Node 24.22.1 (o Node 24.19 padrão foi recusado pela guarda
  vigente; foi usado runtime já disponível em tmp, sem alterar instalação/configuração).
- Artefato do build em `/private/tmp/universo-cupons-ead-local-build-20261116`.
- A trava de cupons no bundle de produção foi conferida e retorna sempre falso.
- Smoke real Safari desktop e Responsive Design Mode 375×744 aprovado: cadastro
  com gratuidade/ilimitado/curso selecionado, resgate gratuito, curso não participante,
  desconto 50%, matrícula pendente, pagamento fictício, histórico e formulário móvel.
- Manifesto local: 63 arquivos, todos com até 500 linhas; maior arquivo com 490.
- `npm run check:file-lines` global falhou por 14 referências antigas a arquivos
  ausentes em outros lotes (Caixa, atividade do dashboard e changelogs 4.8.268–280).
  Nenhum desses caminhos pertence ao manifesto de cupons. Não foram alterados.

## Prévia e limites da evidência

Prévia descartável em `http://127.0.0.1:4387`, usando SQL/PGlite em memória,
componentes e serviços reais, identidades fictícias e transporte local simulado.
Cupons iniciais LOCALGRATIS e LOCAL50; alunos 1/2/4 usados no smoke, aluno3 livre.
Documentação: `scripts/ead-coupons-local/README.md` e `modules/ead/cupons/README.md`.

PGlite possui uma conexão: concorrência foi simulada com pedidos intercalados.
A prova não substitui testes multissessão em PostgreSQL/Supabase real, autenticação
real do Supabase, transporte WebSocket Realtime ou integração bancária real.
Nenhuma dessas operações remotas foi executada nesta etapa autorizada localmente.

A nova aplicação de cupom recusa cursos com matrícula/tentativa/cobrança histórica;
a reserva própria pendente pode ser retomada com snapshot e request originais.
Não há substituição automática de boleto existente.

## Predecessor e trabalho paralelo

Lote anterior concluído: `2026-11-15-financeiro-servicos-integracao-bancaria.md`
(4.8.348, PR #438, commit 37d574e3aa902890ec9363f6691da2fe1d017346).
Layout PF paralelo: `2026-11-15-parceiro-pf-layout-polos.md`, não publicado.
O checkout local e a Secretaria já continham ajustes paralelos de interface e financeiros;
este lote adiciona somente cupons e preserva esses trechos.
