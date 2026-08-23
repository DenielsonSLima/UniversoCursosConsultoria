# PDFs gerados pelo produto

A regra vetorial desta política vale para todo PDF exportado pelo produto. As regras de Blob canônico, cabeçalho institucional e payload de backend aplicam-se aos documentos oficiais, como contratos, carteirinhas, calendários, boletins e declarações.

## Fonte canônica

- Prévia, download e impressão reutilizam exatamente o mesmo Blob PDF.
- Elegibilidade, dados, ordenação, validade, QR e paginação vêm do backend/RPC.
- O frontend apenas solicita o payload e compõe a apresentação vetorial; conteúdo incompatível deve falhar explicitamente.

## Fidelidade aos modelos configurados

- Antes de alterar qualquer gerador, inventarie o modelo aplicável em `Modelos Documentos` e a marca d'água do polo em `Configurações`, incluindo URL, opacidade, escala e rotação.
- Capa, contracapa, campos, coordenadas, estilos, imagens isoladas, slots de assinatura, QR, textos e paginação configurados integram o contrato do documento e devem atravessar todos os adapters até o compositor.
- É proibido substituir configuração existente por capa, contracapa, marca d'água, posição de assinatura ou layout genérico hardcoded.
- Um fallback só é permitido quando não existir configuração aplicável, deve coincidir com o fallback exibido pelo editor e precisa de teste de contrato.
- Prévia, download, impressão e artefato assinado usam o mesmo snapshot do modelo e o mesmo compositor.
- A publicação fica bloqueada sem teste-fonte do encadeamento da configuração e inspeção renderizada da capa, página interna, contracapa e páginas de assinatura aplicáveis.

## Cabeçalho e marca

- A referência visual é modules/gestor/components/DocumentHeader.tsx.
- A única implementação de exportação é modules/gestor/secretaria/shared/canonical-institutional-header-pdf.ts, nas variantes retrato e paisagem.
- Não crie desenhador privado de cabeçalho nem reconstrua logo, nome, selo Matriz, CNPJ, contato, endereço, e-mail, divisor ou área útil dentro de exportador específico.
- A marca-d'água é camada de fundo separada, aplicada antes do conteúdo.

## Vetor e recursos

- Nunca rasterize a página, folha, carteirinha ou documento inteiro com html2canvas, canvas, captura de DOM ou addImage.
- Pipeline híbrido que coloca screenshot/PNG da página inteira e adiciona texto vetorial ou invisível por cima também é proibido: seleção aparente não corrige a perda de qualidade da arte rasterizada.
- Texto visível, tabelas, linhas, campos, bordas, fundos geométricos e marcações permanecem objetos nativos do PDF, selecionáveis, pesquisáveis e copiáveis.
- Zoom não pode degradar texto, linhas ou tabelas.
- Logo, marca-d'água, QR, fotografia e assinatura podem ser imagens isoladas e posicionadas independentemente. Prefira SVG/vetor quando existir.
- Canvas é permitido apenas como buffer temporário para preparar um recurso isolado, como recorte de foto, transparência de assinatura ou QR; nunca para capturar o contêiner/página.
- Uma imagem de fundo ou marca-d'água não pode conter o texto, as linhas, as tabelas ou outros conteúdos do documento.
- Nunca use uma imagem A4 que substitua o documento.

## Validação proporcional

- Para ajuste localizado, execute o contrato do exportador afetado, extração de texto, inspeção de recursos e revisão visual da página relevante.
- A extração deve conter o texto visível e pdfimages deve listar somente recursos isolados compatíveis com logo, marca, foto, assinatura ou QR.
- Inspecione o PDF ampliado para comprovar que texto, bordas e tabelas permanecem nítidos.
- Preserve o teste que rejeita cabeçalho institucional privado.
- Build completo não é requisito automático; use-o apenas por risco de integração ou publicação.
- Um ajuste simples de posição/estilo no compositor compartilhado deve continuar sendo tratado por um agente e pelo menor conjunto de arquivos possível.
- A skill genérica de PDF pode auxiliar renderização, extração e inspeção; não deve gerar PDF do produto com ReportLab ou pipeline paralelo.
