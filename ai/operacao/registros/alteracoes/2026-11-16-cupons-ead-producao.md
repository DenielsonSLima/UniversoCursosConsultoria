# Cupons EAD — revisão e publicação

## Autorização e aceite

Em 16/11/2026 o gestor autorizou revisar o módulo, conferir o padrão visual,
aplicar migrations pendentes de cupons e atualizar produção, reiterando a publicação.
Escopo: cupons EAD de 50%/100%, Secretaria+Financeiro+polo, validade, limites,
cursos participantes, histórico e compra. Sem campanha ou cobrança real de teste.
Base remota: 4.8.353, PR #442, commit 02a9f11f5a28a7220faa3f02f3f9f6b2bef039f4.
Projeto Supabase confirmado por MCP: `kfekgwyqozhicpfuunpo`.
Vercel: `prj_sShLL62ns27uuxnC5BDPZJn04t2y`; GitHub: DenielsonSLima/UniversoCursosConsultoria.

## Revisão

- Instalação mantém o runtime desligado; ativação é uma migration final separada.
- Disponibilidade da interface depende da RPC canônica, identidade e destino oficial.
- Desconto usa somente a rota Banese BOLETO vigente; Pix continua o mesmo BolePix.
- Repetição preserva request e snapshot originais; gatilhos exigem prova do próprio título.
- Pagamento tardio comprovado preserva PAID/PAID_REVIEW e abre revisão sem emitir outro título.
- Replay de gratuidade não reativa matrícula cancelada/trancada nem anuncia liberação falsa.
- Cabeçalho duplicado removido, códigos longos quebram linha, controles de 38/44px e histórico responsivo.
- Checkout sem cupom preservado. Fontes compartilhadas comparadas com main: diferenças são deste módulo.

## Operações e validação

- Primeiras oito migrations aplicadas por MCP com runtime desativado; grants/RLS/search_path conferidos.
- `payment-checkout` atualizado v31→v32 por MCP, somente dois arquivos alterados e helper novo;
  88 fontes anteriores preservadas e 91 arquivos relidos byte a byte. Autenticação vigente preservada.
- Configuração bancária não foi alterada. Fingerprints prévios: runtime `0be78eeab810d5be6979d21928da3866`,
  rotas `87c7af3720512a69543b48bd4954f9fa`, credenciais `9486d3f4acaec290cd3452e5b649fbc7`.
- 81 testes locais aprovados (48 Node e 33 Deno), TypeScript, lint e smoke Safari desktop/375×744 com código de 40 caracteres aprovados.
- Probe remoto é somente leitura; não foram criados alunos, cupons, matrículas, títulos ou pagamentos de teste.
- Nove migrations aplicadas e ativação final registrada; nenhum cupom ou resgate criado. Frontend 4.8.354/Preview e smoke de produção em andamento.
- Publicação paralela Despesas/4.8.353 preservada integralmente como base;
  cupons têm versão própria 4.8.354. Arquivos locais de versão do paralelo preservados.

## Manifesto explícito

- `.github/workflows/ead-cupons.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-16-cupons-ead-local.md`
- `ai/operacao/registros/alteracoes/2026-11-16-cupons-ead-producao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/components/CourseCatalogView.tsx`
- `modules/aluno/cursos/components/EadCheckoutReviewModal.tsx`
- `modules/aluno/cursos/components/cupons/EadCouponField.tsx`
- `modules/aluno/cursos/components/cupons/ead-coupon-field.css`
- `modules/aluno/cursos/hooks/useCourseCheckout.ts`
- `modules/asaas/asaas.service.ts`
- `modules/ead/cupons/README.md`
- `modules/ead/cupons/coupons-access.test.ts`
- `modules/ead/cupons/coupons-access.ts`
- `modules/ead/cupons/coupons-availability.interaction.test.mjs`
- `modules/ead/cupons/coupons-availability.service.ts`
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
- `modules/ead/cupons/hooks/useEadCouponsAvailability.ts`
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
- `supabase/migrations/20261116095358_ead_coupons_production_capability.sql`
- `supabase/migrations/20261116095401_ead_coupons_authorized_checkout.sql`
- `supabase/migrations/20261116095405_ead_coupons_payment_recovery.sql`
- `supabase/migrations/20261116100118_ead_coupons_production_release.sql`
- `supabase/tests/ead_coupons.integrated.interaction.test.mjs`
- `supabase/tests/ead_coupons.isolated.test.mjs`
- `supabase/tests/ead_coupons.production.isolated.test.mjs`
- `supabase/tests/ead_coupons.release.readonly.sql`
- `supabase/tests/fixtures/ead-coupons.harness.mjs`

Total: 77 arquivos.

## Limites e reversão

Aplicação nova em curso com matrícula/cobrança/tentativa anterior continua bloqueada;
reserva própria pode ser retomada. Não há substituição de boleto emitido.
PGlite testa SQL e filas numa conexão; não comprova concorrência multissessão remota.
Não se emite cobrança real para smoke. Desativar runtime impede novos cupons sem apagar histórico.
Rollback de frontend não reverte fatos financeiros nem migrations aplicadas.
