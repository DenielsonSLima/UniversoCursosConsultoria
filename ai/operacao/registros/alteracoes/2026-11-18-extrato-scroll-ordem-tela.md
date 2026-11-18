# Extrato: rolagem e ordem na tela

## Escopo
Correção após fotos do usuário: painel cortava botãoPDF; tela continuavaDESC; abrangência local não exibia saldo físico compartilhado. Conta completa torna-se padrão somente para gestor global; seleção local continua disponível. Backend ordena EXTRATO ASC antes do limite1000; demais relatórios preservados. Sem mutação financeira.

## Manifesto explícito
- `modules/gestor/relatorios/components/RelatorioMovimentacaoFinanceira.tsx`
- `modules/gestor/relatorios/extrato-conta-scope.test.ts`
- `supabase/migrations/20261118000300_extrato_screen_chronological.sql`
- `scripts/test-extrato-viewport.mjs`
- `.github/workflows/extrato-viewport.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-11-versao-4-8-294.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-18-extrato-scroll-ordem-tela.md`
Total: 11 arquivos.

## Validação
Teste browser com componente real e RPC fictícia em1366x768,1093x614 e390x844, incluindo botãoPDF e gestor local. PGlite para ordem/ties/limite; TypeScript,lint,PDF,build e revisão independente. Chromium local bloqueado por socketEPERM; smoke browser executado emCI antes publicação.

## Publicação
Autorização contextual do proprietário para correção do mesmo extrato. Migration guardada antes frontend; sem transações reais.
