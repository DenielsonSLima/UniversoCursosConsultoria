# Pasta de identificação — apresentação

Data: 2026-09-19. Estado: publicação autorizada — 4.8.70/revisão 79.

## Pedido, escopo e aceite

- Usuário pediu remover quadro sem foto e ampliar os dados superiores; foto presente mantém geometria.
- Formatar título eleitoral, eliminar barra final do órgão expedidor e apresentar NÃO POSSUI na reservista para sexo F/FEMININO.
- Três agentes solicitados: foto/layout, campos e QA; coordenador integrou/reuniu propostas e revisão.
- Mudança de PDF com apresentação compartilhada; sem alterações de dados, migrations ou autorização. Publicação deste lote solicitada explicitamente após a entrega local.

## Implementação

- Adaptação imutável da cópia do modelo na prévia real, recursos da emissão e compositor após resolução de imagens; ausência, placeholder e URL indisponível removem somente student_photo.
- Bloco pasta_identificacao ocupa limites conjuntos originais quando foto está à esquerda na mesma linha/altura. Outros layouts personalizados mantêm a geometria do texto. Modelo editável continua com slot para futuras fotos.
- Título de 12 dígitos usa grupos 4/4/4; legado de 11 usa 3/4/4 sem inventar dígitos. Órgão/UF combinado filtra ausência e UF repetida. Reservista feminino usa NÃO POSSUI.
- Foto falha é novamente tentada ao alternar URL ou sair/reabrir prévia. Regras de campos iguais no parser, prévia real e resolver nativo; snapshot explicitamente vazio continua prevalecendo sobre cadastro vivo.
- Compositor original de 1518 linhas dividido em núcleo, resolver, boletim e grade, com API pública preservada. Revisão AST confirmou 61 definições preservadas; somente resolver e preparação mudaram funcionalmente.
- Cabeçalho canônico, Blob de prévia/download/impressão e marca d’água permanecem no pipeline nativo.

## Validação

- Baseline sintético do compositor reproduziu os quatro defeitos antes do patch.
- 19 contratos existentes do compositor aprovados, incluindo ficha, boletim, cabeçalho, snapshot e fluxo vetorial.
- 15 testes novos/focados aprovados: seis geometria, quatro formatação, três resolver e dois PDF real.
- PDFjs verificou expansão horizontal exata de 110,5px, posição vertical preservada, 1 página e ausência do placeholder; com foto posição original preservada.
- Texto extraído, recursos isolados e PNGs completos com/sem foto inspecionados. Marca congelada comprovada no PDF: URL, opacidade 0,17, escala 37% e rotação false.
- Smoke do Canvas real no Safari com harness sintético: sem foto, foto válida e URL inválida; campos recolhem/expandem e não sobrepõem. Harness desativa animações/transições somente para captura estável.
- Sessão do portal inicialmente retornou tela branca e voltou a exibir o editor autenticado na versão publicada 4.8.69 ao fim. A correção está somente local; smoke autenticado da emissão corrigida permanece pendente. O smoke do Canvas local não é declarado como validação de produção.
- Sem build global: contratos exercitam compositor integrado e Canvas foi servido/compilado por Vite. Artefatos/harness em tmp não fazem parte do manifesto.

## Manifesto explícito

- `modules/gestor/cadastros/ficha-matricula/pasta-template-geometry.ts`
- `modules/gestor/cadastros/ficha-matricula/pasta-student-photo.test.ts`
- `modules/gestor/cadastros/ficha-matricula/registration-document-formatters.ts`
- `modules/gestor/cadastros/ficha-matricula/registration-document-formatters.test.ts`
- `modules/gestor/cadastros/ficha-matricula/student-template-preview.service.ts`
- `modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditorCanvas.tsx`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `modules/gestor/secretaria/historico-emissoes/template-parser.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-document.pdf.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pdf-core.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pdf-bulletin.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pdf-registration-grid.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-snapshot.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-fields.test.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pasta-photo.pdf.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-19-pasta-identificacao-apresentacao.md`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`

Total: 21 arquivos.

## Publicação autorizada

- Usuário solicitou publicar para testar em 19/09/2026; critérios são os quatro comportamentos descritos no pedido, já conferidos localmente.
- Base remota main 7130eb85fefe1daf3872e55c1f2d5c2c3c13161f (4.8.69); arquivos de implementação comparados via MCP sem alterações paralelas incorporadas.
- Registro local da skill Proesc não integra a publicação; a cópia enviada do índice de manifestos contém somente o índice remoto anterior acrescido deste lote.
- Versão 4.8.70/revisão79 e CI dos 34 testes de apresentação. Build completo, TypeScript, lint focado e teto de linhas aprovados. CI, Preview e confirmação do domínio serão registrados na entrega.
