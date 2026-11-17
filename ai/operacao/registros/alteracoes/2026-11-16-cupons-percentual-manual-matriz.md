# Cupons EAD — percentual manual e gestão pela Matriz

## Pedido e aceite

Correção expressa do responsável em 16/11/2026: percentual manual em vez de
opções fixas de 50%/100%; somente a Matriz pode ativar o recurso; somente EAD.
A autorização de publicação do módulo permanece vigente nesta conversa.

- Cupom é opcional na compra. Ao cadastrar, o percentual começa vazio e deve
  ser informado manualmente, maior que zero e até 100%, com até duas casas.
- Vírgula e ponto são aceitos no formulário; o servidor valida o número e
  calcula valores monetários. 100% continua gratuito sem título financeiro.
- Gestão exige Matriz ativa pelo atributo canônico `polos.is_matriz`, além
  das permissões de Secretaria e Financeiro e da autorização vigente do polo.
- O responsável confirmou que os cupons valem para alunos de todos os polos;
  somente a Matriz pode criá-los, editá-los e ativá-los.
- O cupom pertence à Matriz e o resgate registra o polo real da turma. Cursos,
  turmas e histórico respeitam a instituição da Matriz e os polos ativos.
- Cotação preserva a turma explícita ou o destino canônico, sem novo seletor;
  limites e histórico são globais ao cupom, com atualização automática.
- Cursos de outras modalidades rejeitam cupom antes de qualquer cobrança.
- Cupons, resgates, títulos e pagamentos já existentes são preservados.

Base remota revisada: 4.8.356, commit
`2d3e5696671ac9bd73db84a79a8e0c2e8899e9a6`.
A retomada segura de gratuidade e as quatro migrations já publicadas nessa
versão devem permanecer intactas. Migrations aplicadas não serão editadas.

## Validação e publicação

133 testes locais aprovados (99 Node e 34 Deno), além do HTTP da prévia.
O teste PostgreSQL multissessão é ignorado localmente e será executado no CI.
TypeScript, lint de 33 fontes e build completo aprovados. Safari desktop e
375×744 conferiram campo vazio, digitação e gravação local de 37,5%.
Revisão independente aprovou autorização, instituição, RLS, retomadas e valores.
Pré-condição remota: quatro polos ativos da mesma instituição, sem company_id nulo.
Três migrations aplicadas por MCP em ordem; fontes renomeadas para o ledger real
sem mudar um byte do SQL aplicado. payment-checkout v33 ACTIVE, com uma guarda
EAD alterada e 90 arquivos anteriores preservados. Probe remoto aprovou todas
as guardas, tipos, assinaturas e grants. Fingerprints do cupom, resgate e
configurações bancárias permaneceram idênticos. Frontend 4.8.357 em publicação.
Nenhum dado fictício será escrito no banco de produção.

O teto foi conferido nos 45 arquivos do manifesto: máximo de 491 linhas.
O verificador global local encontrou 15 fontes históricas ausentes no checkout,
fora deste lote; a validação sobre a árvore remota completa permanece no CI.

## Manifesto explícito

- `.github/workflows/ead-cupons.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-16-cupons-percentual-manual-matriz.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/components/cupons/EadCouponField.tsx`
- `modules/aluno/cursos/hooks/useCourseCheckout.ts`
- `modules/ead/cupons/README.md`
- `modules/ead/cupons/coupons-access.test.ts`
- `modules/ead/cupons/coupons-access.ts`
- `modules/ead/cupons/coupons-management.types.ts`
- `modules/ead/cupons/coupons-student.interaction.test.mjs`
- `modules/ead/cupons/coupons-student.keys.ts`
- `modules/ead/cupons/coupons-student.service.ts`
- `modules/ead/cupons/coupons-student.types.ts`
- `modules/ead/cupons/hooks/useEadCouponCheckout.ts`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/cupons-access.interaction.test.mjs`
- `modules/gestor/secretaria/cupons-ead/components/CuponsEadList.tsx`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.formatters.ts`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.interaction.test.mjs`
- `modules/gestor/secretaria/cupons-ead/cupons-ead.ui.fixture.mjs`
- `modules/gestor/secretaria/cupons-ead/formularios/CupomEadForm.tsx`
- `modules/gestor/secretaria/cupons-ead/formularios/cupom-form.model.test.ts`
- `modules/gestor/secretaria/cupons-ead/formularios/cupom-form.model.ts`
- `modules/gestor/secretaria/cupons-ead/hooks/useCuponsEadRealtime.ts`
- `scripts/ead-coupons-local/Preview.tsx`
- `scripts/ead-coupons-local/README.md`
- `scripts/ead-coupons-local/preview-database.mjs`
- `scripts/ead-coupons-local/preview-http.test.mjs`
- `scripts/ead-coupons-local/start.mjs`
- `scripts/test-ead-coupons-local.mjs`
- `supabase/functions/gateways/checkout/ead-context.test.ts`
- `supabase/functions/gateways/checkout/ead-context.ts`
- `supabase/migrations/20261117001402_ead_coupons_matrix_decimal_schema.sql`
- `supabase/migrations/20261117001405_ead_coupons_matrix_decimal_management.sql`
- `supabase/migrations/20261117001407_ead_coupons_decimal_checkout.sql`
- `supabase/tests/ead_coupons.global_polos.isolated.test.mjs`
- `supabase/tests/ead_coupons.integrated.interaction.test.mjs`
- `supabase/tests/ead_coupons.isolated.test.mjs`
- `supabase/tests/ead_coupons.matrix_decimal.isolated.test.mjs`
- `supabase/tests/ead_coupons.release.readonly.sql`
- `supabase/tests/fixtures/ead-coupons.harness.mjs`

Total: 45 arquivos.
