# Site público: navegação, HTML inicial e sitemap

Data: 15/11/2026. Classificação: mudança crítica de publicação e roteamento público.
Status: implementação validada para entrega 4.8.346; conferência remota no PR do lote.

## Escopo e aceite

- Favorecer a descoberta das páginas públicas para os sitelinks automáticos do Google, sem prometer exibição ou prazo.
- Links reais para as cinco modalidades no menu e nos cards, preservando aparência, navegação SPA, teclado e abrir em outra aba.
- Rodapé inclui Cursos Livres, Especializações e Nossos polos; seções Quem somos/Consultoria apontam para a home mesmo a partir de outras páginas.
- HTML inicial com conteúdo essencial visível, título, descrição e navegação para todas as páginas públicas estáveis, igual para todos os visitantes.
- Catálogos, disponibilidade e preços continuam vindo da aplicação; não gerar cursos, vagas ou ofertas fictícias no HTML estático.
- Sitemap gerado a cada build, somente com páginas públicas canônicas; retirar login e alias duplicado, sem inventar datas de atualização.
- Manter portais privados e templates de detalhe dinâmico sem conteúdo da Home; preservar entrada React, acesso, CSP e comportamento dos portais.

## Diagnóstico real

- Consulta HTTP da Home, EAD, Técnicos e Contato confirmou HTML inicial sem headings ou anchors; metadados próprios já existiam nas páginas internas.
- Sitemap publicado tinha sete URLs com data fixa de junho, incluía login noindex e omitia modalidades/polos.
- Menu destacava seções da Home; cards principais dependiam de onClick sem href.
- A decisão de mostrar sitelinks permanece automática do Google; a ausência não foi atribuída definitivamente a uma falha técnica sem inspeção no Search Console.

## Implementação

- Manifesto público compartilhado alinha metadados React, geração de HTML e sitemap.
- Resumo público sem JavaScript fica dentro de root e é substituído por createRoot ao iniciar a aplicação; sem UA especial, conteúdo oculto ou duplicação após carregar React.
- Home é gravada também em dist/index.html para cobrir entrega direta pelo filesystem da hospedagem.
- Shell neutro noindex separado para rotas não públicas, sem canonical/og:url; templates privados e de detalhes não recebem o resumo público.
- Rewrites explícitos para FAQ, Termos, Privacidade e Cookies; localização aponta canonical para Contato.
- Sitemap com 13 URLs canônicas, sem login, aliases noindex ou datas desconhecidas.
- Dados estruturados de navegação priorizam páginas públicas, sem promover login noindex.

## Validação

- 8/8 testes interativos de navegação com Router real aprovados; links, cliques modificados, teclado, hash, menu móvel e rodapé.
- 7/7 contratos do gerador aprovados: 30 rotas e shell neutro; HTML sem JS, metadados, escape, sitemap, isolamento de privados/detalhes, rewrites e repetição idempotente.
- Lint focado aprovado; build completo com Node 24.22.1 aprovado, com 30 páginas e shell neutro gerados. Teto de 500 linhas aprovado na entrega isolada (25 arquivos do manifesto).
- Smoke Safari da prévia e validação do domínio publicado em andamento.
- Search Console não foi operado nesta etapa; nenhum envio ou solicitação de reindexação declarado.

## Referências

- [Sitelinks automáticos e boas práticas](https://developers.google.com/search/docs/appearance/sitelinks).
- [Links rastreáveis](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
- [JavaScript, renderização e indexação](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

## Manifesto explícito

- `modules/public/components/Header.tsx`
- `modules/public/components/CategoriesSection.tsx`
- `modules/public/components/Footer.tsx`
- `modules/public/categories/cursos-tecnicos/CursosTecnicosCard.tsx`
- `modules/public/categories/cursos-livres/CursosLivresCard.tsx`
- `modules/public/categories/cursos-ead/CursosEadCard.tsx`
- `modules/public/categories/especializacao-tecnica/EspecializacaoTecnicaCard.tsx`
- `modules/public/categories/ensino-superior/EnsinoSuperiorCard.tsx`
- `modules/public/components/public-navigation.interaction.test.mjs`
- `modules/public/seo/public-pages.ts`
- `scripts/seo/public-page-html.mjs`
- `scripts/generate-social-share-pages.mjs`
- `index.html`
- `modules/public/components/SeoManager.tsx`
- `vercel.json`
- `public/sitemap.xml`
- `modules/public/contact/ContactPage.tsx`
- `.github/workflows/public-seo.yml`
- `scripts/public-seo.contract.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-09-versao-4-8-279.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-site-publico-sitelinks.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 25 arquivos.
