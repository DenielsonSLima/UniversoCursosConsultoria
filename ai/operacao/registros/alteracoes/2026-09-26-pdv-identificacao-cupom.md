# Identificação no cupom do PDV

- Lote: `2026-09-26-pdv-identificacao-cupom`.
- Classificação: mudança crítica localizada no contrato de identidade do comprovante, PDF e publicação.
- Versão preparada: 4.8.110 / revisão 119, sobre 4.8.109 e fechamento do PR #200.
- Pedido: pontuar o documento mascarado e incluir matrícula do aluno no cupom. Publicação em produção já autorizada no fluxo.

## Reprodução e contrato

A captura do usuário confirmou o cupom compacto real da 4.8.109 e mostrou a máscara sem pontuação e ausência da matrícula. O documento continua ocultando todos os dígitos intermediários; apenas os dois primeiros e os três últimos ficam visíveis.

A matrícula vem de `parceiros.matricula_acesso`, identificador público estável do aluno. Não escolhe matrícula de turma nem vincula crédito avulso a curso. Parceiro sem matrícula válida omite a linha.

O snapshot financeiro continua imutável. Um registro privado de identidade preserva a matrícula por recibo, com origem e captura auditáveis. Recibos antigos exigem prova do vínculo na substituição Banese; sem prova, a matrícula permanece ausente. A máscara é pontuada a partir do documento congelado, sem substituí-lo pelo cadastro atual nem devolver CPF bruto.

Antes de imprimir, o cliente compara os campos canônicos apresentados com o snapshot do trabalho. Divergência exige preparar o comprovante novamente e impede claim/envio do Blob antigo. Ordem de propriedades JSON e flags transitórias não alteram a comparação.

## Validação e rollout

- 30 testes UI/PDF/cache/identidade aprovados; incluem extração de CPF, CNPJ e matrícula em 58/80 mm, ausência de campos não fornecidos e bloqueio antes de impressão quando conteúdo diverge.
- PDFs 58/80 mm renderizados e inspecionados; sem marca d’água, matrícula legível e sem corte.
- 11 checks SQL isolados aprovados, incluindo autorização antes de replay, privacidade, legado sem prova, imutabilidade e preservação dos trabalhos existentes. A simulação concorrente usa PGlite serializado, não múltiplas conexões Postgres.
- Migration aplicada via MCP Supabase no ledger `20260927025500`, nome `enrich_pdv_receipt_payer_identity`. Arquivo local `20260927024600` imutável após aplicação; SHA-256 `9d3a95595dd70744a378b2a3133cdb465bdf7d9f5b5b8b96fd50acb11295623f`.
- Smoke autenticado do recibo existente retornou CPF pontuado, matrícula cadastral e total de R$ 0,50. Origem `BANESE_REPLACEMENT`, uma identidade por recibo; hashes do snapshot financeiro e da conta a receber permaneceram iguais e o único trabalho de impressão existente foi preservado.
- TypeScript, ESLint focado e build aprovados. Publicação usa a base `3089add1a3b957856d69176dcf6b212a3d095825`, preservando a compactação paralela da tela de novo recebimento. CI, merge e implantação serão rastreados no PR desta versão.
- Nenhuma nova cobrança, pagamento ou impressão de teste. Homologação física da impressora continua pendente.
- Versão e changelog atualizados; histórico antigo movido integralmente para arquivo próprio para respeitar o teto de 500 linhas.

## Manifesto explícito

Total: 17 arquivos.

- `modules/gestor/financeiro/outros-creditos/pdv-receipt.types.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.pdf.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt-preview.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.test.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.service.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt-identity.test.ts`
- `scripts/test-pdv-receipts.mjs`
- `supabase/migrations/20260927024600_enrich_pdv_receipt_payer_identity.sql`
- `supabase/tests/pdv-receipt-identity.fixture.mjs`
- `supabase/tests/pdv-receipt-identity.isolated.test.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-08-a-2026-09-12-versoes-4-8-37-a-4-8-52.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-pdv-identificacao-cupom.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
