# Número S/N automático

Orientação posterior expressa do usuário substitui exigência anterior: quando ausente, usar S/N automaticamente. S/N é marcador autorizado, não dado recuperado ou endereço verificado.

Migration20261112154033 aplicada via MCP. Somente439 valores00 provisórios auditados e ainda na mesma versão foram substituídos; números reais e registros posteriormente editados preservados. Novo batch de auditoria e rollback CAS. Nenhuma tabela fiscal/nota emitida foi alterada.

Cadastro administrativo e público web/app normalizam vazio, removem obrigatoriedade visual de número e mantêm limite60. Bloco endereço extraído do componente público legado para respeitar500 linhas, sem mudança de visual/consentimento/Turnstile.

Refresh já publicado aceita00 ou ausência→S/N apenas PREVIEWED não assinada, mesma operação/request/DPS e histórico append-only. Regressão explícita7/7, teste SN/auditoria/CAS/rollback,DOM cadastro e contratos signup aprovados; revisão independente sem bloqueantes. CI/build/deploy registrados na PR. Sem transmissão fiscal; smoke Safari autenticado pendente.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-12-numero-sn-automatico.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-27-versao-4-8-241.md`
- `internal/versioning/system-version.json`
- `modules/aluno/login-app/AlunoAppSignupPage.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepContact.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/parceiro-aluno-form.navigation.test.mjs`
- `modules/public/login/AlunoLoginAuthCard.tsx`
- `modules/public/login/AlunoSignupAddressForm.tsx`
- `modules/public/login/aluno-public-signup.service.ts`
- `modules/public/login/useAlunoSignupForm.ts`
- `supabase/migrations/20261112154033_student_address_number_default_sn.sql`
- `supabase/operations/student_address_number_replace_sn.sql`
- `supabase/operations/student_address_number_sn_rollback.sql`
- `supabase/tests/nfse_unsigned_address_refresh.isolated.test.mjs`
- `supabase/tests/student_address_number_sn.pglite.mjs`

Total: 21 arquivos
