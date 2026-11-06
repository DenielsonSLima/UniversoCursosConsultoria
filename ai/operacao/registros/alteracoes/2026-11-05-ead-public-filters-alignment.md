# Alinhamento dos filtros públicos EAD

Data: 2026-11-05. Versão candidata: 4.8.246, revisão 255. PR #342.

## Objetivo e aceite

Corrigir a linha de Categoria, Agrupamento e Ordenação mostrada na captura. Rótulos e campos devem ter a mesma altura, com opções e valores preservados. Campos próprios pesquisáveis suportam clique, teclado e fechamento acessível. Publicação em produção solicitada explicitamente pelo responsável após a entrega local e a abertura da PR.

## Diagnóstico e correção

Categoria usava rótulo flex com ícone; os demais eram inline. Os selects nativos do Safari exibiam dimensões diferentes das esperadas. Um único componente local padroniza os três campos em h-12, rótulos h-4 e espaço uniforme; mantém três colunas no desktop e uma em telas menores. Texto de busca não altera o valor canônico até a escolha.

## Manifesto explícito

- `modules/public/ead/EadPublicPage.tsx`
- `modules/public/ead/EadCatalogFilter.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-05-ead-public-filters-alignment.md`

Total: 7 arquivos

## Validação e limites

- TypeScript e ESLint focados aprovados nos dois arquivos de implementação.
- Safari nativo na rota local /ead: alinhamento visível; lista de agrupamento completa; mudança para Sem agrupamento por teclado; busca Maior restringiu ordenação; busca sem resultados exibiu mensagem; Escape e clique externo fecharam o painel.
- Catálogo carregou 63 cursos; nenhuma consulta, regra acadêmica ou operação financeira foi alterada.
- Preview do primeiro head compilou. CI inicial exigiu versão e histórico para alteração publicada; registro acrescentado antes do merge, sem mudar as guardas.
- Todos os sete arquivos manuais respeitam 500 linhas; checks operacionais e build do candidato serão conferidos no fechamento. CI, SHA e implantação final permanecem evidências da PR.
- Viewport desktop da captura conferida no Safari. Não houve teste em dispositivo móvel real.
- Nenhuma migration, Edge ou dado foi modificado. Memória canônica e skills preservadas.
