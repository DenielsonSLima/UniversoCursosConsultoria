# Contrato: QR e assinaturas posicionáveis

## Objetivo e aceite

Candidata 4.8.183 sobre main 4.8.181. O editor permite mover individualmente
QR, contratante, contratada e duas testemunhas, ajustar coordenadas em mm,
tamanho do QR e largura das linhas, e restaurar cada posição padrão.
As posições salvas devem aparecer na prévia, no PDF e na reimpressão congelada.
Os marcadores vazios `1:` e `2:` não são nomes de testemunhas.

## Implementação

- Geometria A4 compartilhada em `layoutEncerramento`, com fallback compatível
  para modelos anteriores e leitura sem clamp das posições salvas.
- Arraste com pointer capture, toque e teclado respeita o zoom; editor também
  aceita ajuste numérico. A confirmação de salvar usa o último valor do input.
- Limites da área final e colisões com campos/local/texto impedem salvar ou
  compor um layout inválido. Cláusulas e paginação não são reposicionadas.
- Rótulos de testemunhas ficam abaixo das linhas; nomes reais permanecem acima.
- Compositor existente separado em responsabilidades para respeitar 500 linhas;
  corpo, cabeçalho, marca d'água e API pública preservados.
- Supabase consultado somente para confirmar o contrato instalado: a RPC segura
  preserva `p_content`, a emissão congela `templateSnapshot` e devolve o modelo
  em `render_payload.template`. Não houve migration, gravação ou emissão real.
- Normalizador do editor agora conserva as posições. Reimpressão usa o snapshot
  original; prévia/download/impressão continuam com o mesmo Blob nativo.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-07-contrato-posicoes-qr-assinaturas.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/components/ContratoAlunoCanvas.tsx`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/components/ContratoAlunoClosingControls.tsx`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/components/ContratoAlunoTemplateEditor.tsx`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/contract-closing-editor.interaction.test.mjs`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/contract-closing-editor.test.tsx`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/hooks/useContractClosingDrag.ts`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/services/contrato-aluno-template.positions.test.mjs`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/services/contrato-aluno-template.service.ts`
- `modules/gestor/cadastros/modelos-documentos/contrato-aluno/types/contrato-aluno.types.ts`
- `modules/gestor/secretaria/contratos-aluno/components/ContratoAlunoDocumentRenderer.tsx`
- `modules/gestor/secretaria/contratos-aluno/contratos-aluno-workspace.contract.test.ts`
- `modules/gestor/secretaria/contratos-aluno/contratos-aluno.pdf.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/assets.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/body.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/closing.contract.test.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/closing.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/model.ts`
- `modules/gestor/secretaria/contratos-aluno/pdf/page.ts`
- `modules/gestor/secretaria/shared/canonical-document-vector-pdf.contract.test.ts`
- `modules/gestor/secretaria/shared/canonical-document-vector-pdf.source.contract.test.ts`
- `modules/shared/contrato-aluno/ContractClosingPreview.tsx`
- `modules/shared/contrato-aluno/closing-layout.test.ts`
- `modules/shared/contrato-aluno/closing-layout.ts`
- `modules/shared/contrato-aluno/closing-positions.test.ts`
- `modules/shared/contrato-aluno/closing-positions.ts`

Total: 31 arquivos.

## Validação e entrega

- 77 testes aprovados, incluindo o fluxo React DOM; TypeScript global, lint
  dos arquivos do manifesto, build e teto de 500 linhas aprovados.
- Testes de parser, geometria, carregar/editar/salvar/reabrir e editor React DOM
  com JSDOM e rede simulada; arraste, zoom, teclado, cancelamento, colisões,
  restauração, modo prévia e salvar após digitar exercitados.
- Contratos do compositor, histórico congelado e emissão canônica aprovados.
- PDFs nativos sintéticos padrão/personalizado renderizados e inspecionados:
  primeira página, interna e assinaturas. Texto extraído; imagens apenas QR
  isolado na página final; nenhuma captura de página ou chamada bancária.
- Revisão independente não encontrou perda de configuração ou conteúdo.
- Smoke visual autenticado não executado por proibição expressa de navegador.
  A inspeção visual acima foi feita em PNGs renderizados dos PDFs nativos.
- Produção não autorizada. A versão 4.8.182 do aviso C2 continua no PR #275,
  separada deste lote; a restauração T46 está registrada no PR #274.
- Alterações paralelas locais no registro de manifestos/changelog são mantidas;
  o payload remoto inclui somente este lote sobre a base declarada.
