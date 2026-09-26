# Secretaria: fontes maiores na Pasta e Ficha

Estado: produção autorizada explicitamente pelo usuário; PR #190 validado e atualizado sobre a base corrente.
Versão: 4.8.101, revisão 110. Base remota: 8e3c9dc9ca0d4d39c05919c491e0e610ed82bf47.
Autorização: usuário aprovou os tamanhos, a preservação do layout e o uso em segundas vias; em seguida solicitou explicitamente a publicação em produção.

## Objetivo e aceite

Ampliar a legibilidade da Pasta de Identificação e da Ficha de Matrícula sem mudar o layout existente. Dados até 8,5 pt, rótulos até 6 pt e títulos das seções até 7 pt; células extensas reduzem gradualmente até os tamanhos anteriores. Conteúdo incompatível continua falhando explicitamente.

O perfil é ativado somente para os dois documentos. Prévia, download e impressão continuam usando o mesmo compositor nativo e Blob. Snapshots, coordenadas, foto, QR, assinaturas, cabeçalho institucional, marca e paginação são preservados.

## Validação e revisão

- Revisão com três agentes: espaço da Pasta, espaço da Ficha e contrato/validação; revisão final independente do patch.
- 32 testes focados aprovados, incluindo quatro novos testes de tipografia, textos extensos, compatibilidade e overflow.
- Quatro PDFs completos gerados pelo compositor oficial: Pasta/Ficha com e sem foto, todos em uma página.
- PDFJS confirmou texto integral, tamanhos 8,5/6/7 pt e operações idênticas de desenho, transformação de imagens e opacidade em relação ao baseline.
- Extração de texto, pdfimages e revisão das quatro páginas renderizadas aprovadas; somente recursos isolados, sem captura de página.
- Build completo aprovado para publicação; check:file-lines aprovado. Manifesto final auditado também isoladamente.
- Novo teste preparado com esbuild e ambiente sintético no CI, pois o modelo completo importa configuração Vite; typecheck Deno do teste aprovado após completar a fixture tipada.
- CI completo e Preview do PR #190 aprovados. Rebase preserva integralmente as fontes de implementação validadas e as entregas paralelas até 4.8.100.
- Smoke autenticado depende da sessão disponível; geração/renderização local usa o compositor real com dados sintéticos.

## Manifesto explícito

Total: 8 arquivos.

- `modules/gestor/secretaria/historico-emissoes/emission-document.pdf.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pdf-registration-grid.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-typography.pdf.test.ts`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-26-secretaria-fontes-legiveis.md`

## Publicação e preservação

Commit atômico em branch própria, PR #190 para main, Preview Vercel e produção autorizada. Conferir o commit e o resultado do build remoto após o envio. Artefatos temporários, PDFs e PNGs não integram o manifesto.

Versão, changelog, workflow e registro de manifestos preparados sobre a base remota. Os arquivos operacionais e de versão do checkout ligados a Outros Créditos/Proesc são preservados; o LOTE_ATIVO paralelo não é substituído.
