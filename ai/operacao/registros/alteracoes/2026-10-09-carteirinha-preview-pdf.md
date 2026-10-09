# Carteirinha fiel ao modelo no aluno e na Secretaria

Entrega 4.8.189. Correção autorizada da prévia, download e carregamento de fundos.

## Causas e correção

O download do aluno reconstruía linhas e fontes a partir de caixas de texto,
sem preservar quebra, zoom e espaçamento da prévia. A Secretaria rasterizava
folhas inteiras e usava outro caminho para imprimir. A espera de imagens
tratava erro como sucesso ou ficava pendente quando a imagem já havia falhado.
Cada verso podia consultar a mesma assinatura institucional simultaneamente.

O compositor CR80 agora mede o layout do modelo já renderizado e desenha texto,
linhas e caixas nativamente no PDF. Incorpora somente recursos isolados:
fundo original cadastrado, foto, QR, assinatura e símbolos. Preserva posições,
recortes, opacidade, mistura de assinatura, quebras e dimensões do cartão.
Não captura a página inteira nem substitui a arte cadastrada por modelo genérico.

O aluno visualiza o próprio PDF que baixa. A impressão A4 prepara outro formato
uma única vez e reutiliza esse Blob na prévia, download e impressão. A Secretaria
reutiliza um Blob A4 em todas as ações e mantém os layouts dobra e espelhado.
A validade do aluno usa expiresAt da emissão no backend; não há cálculo de prazo,
elegibilidade ou dados acadêmicos no frontend.

Fundos são antecipados e compartilhados. Assinaturas em lote compartilham a
consulta em andamento. A emissão aguarda imagens decodificadas, assinatura,
fontes e QR, com cancelamento, limite de espera, erro visível e nova tentativa.
Falhas saem do cache; respostas antigas não substituem o documento atual.
Refetch do workspace não altera a seleção durante a preparação ou prévia aberta.

O modelo real foi inventariado em leitura e usado com identidade, fotografia e
assinatura sintéticas. Sua data textual de emissão é configuração do modelo e
foi preservada. Não foram alterados banco, cadastros, códigos de validação,
certificados EAD, crachás ou outras modalidades.

## Manifesto explícito

- `.github/workflows/student-card-pdf.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-carteirinha-preview-pdf.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/aluno/secretaria/components/AlunoIdentityDocuments.tsx`
- `modules/aluno/secretaria/components/StudentCardDocument.tsx`
- `modules/aluno/secretaria/components/StudentCardPrintDialog.tsx`
- `modules/aluno/secretaria/student-card-pdf.ts`
- `modules/aluno/secretaria/useStudentCardPdf.ts`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha-assets.ts`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha-signatures.ts`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview.tsx`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPrintLayout.tsx`
- `modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas-workspace.test.mjs`
- `modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas.pdf.ts`
- `modules/gestor/secretaria/carteirinhas/student-card.browser.fixture.mjs`
- `modules/gestor/secretaria/carteirinhas/student-card.browser.test.mjs`
- `modules/gestor/secretaria/carteirinhas/useCarteirinhasPdf.ts`
- `modules/shared/pdf/PdfPagePreview.tsx`
- `modules/shared/pdf/student-card/assets.ts`
- `modules/shared/pdf/student-card/index.ts`
- `modules/shared/pdf/student-card/render.ts`
- `modules/shared/pdf/student-card/text.ts`
- `scripts/test-selectable-pdf-exports.mjs`

Total: 28 arquivos.

## Validação

- Revisão separada dos três agentes: aluno/PDF, Secretaria/recursos e regressões.
- Modelo salvo e recursos originais comparados ao PDF.js renderizado.
- Conferência visual da frente, verso, CR80, A4, lote em dobra e modelo padrão.
- Ensaio da prévia real em canvas do PDF, incluindo legibilidade das fontes.
- 9/9 testes de navegador aprovados com o modelo cadastrado: PDF, zoom, download,
  entrada da impressão, recursos lentos/falhos, retry e invalidação da saída antiga.
- 1/1 regressão de refetch aprovada durante preparação e prévia aberta da Secretaria.
- ESLint aprovado em todos os arquivos de implementação/teste do manifesto.
- Versionamento validado e índice RAG atualizado: 15 fontes, 80 trechos.
- Conferência de manifesto e teto de 500 linhas; CI completo exigido para merge.

Não há sessão autenticada real disponível. Os ensaios usam componentes reais,
modelo cadastrado e serviços controlados no navegador local; smoke autenticado
em Safari e impressão física permanecem pendentes. O teste confirma o Blob
entregue à impressão, sem simular aprovação do diálogo do sistema operacional.
Artefatos, dependências e inventário temporários
não pertencem ao commit.
