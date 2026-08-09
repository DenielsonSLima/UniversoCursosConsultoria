# Inventário de PDFs raster legados

Atualizado em: 2026-08-09

Estes fluxos capturam uma página/contêiner inteiro como imagem. Eles não atendem ao contrato vetorial, mesmo quando adicionam texto selecionável por cima. O inventário é dívida conhecida, não autorização.

## Ponte DOM para imagem

- [ ] `modules/aluno/cursos/CursosPage.tsx`
- [ ] `modules/aluno/financeiro/FinanceiroPage.tsx`
- [ ] `modules/gestor/financeiro/components/FinancialReportPreview.tsx`
- [ ] `modules/gestor/financeiro/receber/components/modalidade-receber/InstitutionalReceiptModal.tsx`
- [ ] `modules/gestor/parceiros/components/export/ParceirosExportModal.tsx`
- [ ] `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx`
- [ ] `modules/gestor/secretaria/historico-emissoes/preview-utils.ts`
- [ ] `modules/professor/financeiro/FinanceiroPage.tsx`

Ponte temporária: `modules/shared/pdf/dom-to-selectable-pdf.ts`.

## Rasterização direta

- [ ] `modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas.pdf.ts`

## Regra de migração

Migrar um fluxo por lote focado. Texto, linhas, tabelas, campos, bordas e fundos geométricos devem virar objetos nativos do PDF. Logo, marca-d'água, QR, foto e assinatura podem permanecer como recursos isolados. Cada migração precisa comparar o PDF real, extração de texto, `pdfimages` e nitidez com zoom.

O contrato `scripts/test-selectable-pdf-exports.mjs` impede novos consumidores e mantém as proteções temporárias dos legados até a remoção completa.
