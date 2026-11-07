# Histórico de Emissões — filtros e busca automática

Entrega 4.8.259. Pedido: adicionar modalidade e curso, corrigir a busca
por nome e atualizar o GitHub. Produção autorizada explicitamente pelo usuário em 07/11/2026.
Base atualizada: Parceiros 4.8.258, commit 2ff0ac6, preservando Secretaria 4.8.257/PR #352. Suas mudanças de
seletores e interface foram preservadas; o manifesto abaixo continua restrito aos filtros.

## Diagnóstico e aceite

No Safari autenticado, o nome digitado permanecia acompanhado da lista completa.
O componente aplicava a busca somente por botão/Enter. A RPC vigente pesquisava apenas
os nomes/CPFs do snapshot. A consulta somente leitura encontrou dois registros para o
nome informado quando a busca era explicitamente aplicada, confirmando o problema da
interação. O cadastro atual precisa ser pesquisável também quando falta o snapshot.

Aceite: digitação aplica busca após 300 ms, Enter/botão aplicam imediatamente;
modalidade, curso, turma, texto e tipo de documento se combinam antes de contagem e
paginação. Modalidade limpa curso/turma; curso limpa turma; respostas antigas não
substituem a consulta mais recente. Seletores próprios pesquisáveis, com IDs canônicos.

## Implementação e limites

Estado de listagem isolado do fluxo de segunda via; serviço de listagem separado para
manter os arquivos abaixo de 500 linhas. Cursos e modalidades vêm das turmas já
autorizadas no polo pela consulta existente, sem ampliar acesso.

A migration cria `search_secretaria_emissions_filtered_secure` e mantém a assinatura
anterior como adapter. Conserva o payload e a projeção canônica dos contratos; aplica
filtros no servidor e pesquisa snapshots/cadastro, acentos e CPF com/sem máscara.
Guardas de Secretaria/polo e grants são preservados, com negação explícita para retorno
nulo da guarda. Nenhum gerador, modelo, validade ou operação de segunda via foi alterado.

Migration aplicada via MCP no projeto kfekgwyqozhicpfuunpo, registro remoto
`20261107203405_history_emission_filters`. Fonte versionada imutável correspondente:
`supabase/migrations/20261107190000_history_emission_filters.sql`.
Contrato real aprovado para todos os grupos polo/curso/modalidade/turma existentes,
contagem, paginação, busca por nome, adapter legado e negação sem identidade. A consulta
sem filtros manteve exatamente o payload anterior (263 registros).

## Validação

- Seis testes SQL passaram: busca, CPF, código literal, interseção, paginação, payload,
  compatibilidade da RPC anterior e autorização.
- Seis testes de UI/adapter passaram: digitação sem botão, seletores dependentes,
  teclado, IDs/RPC, paginação, limpeza, respostas atrasadas e falhas sem lista antiga.
- TypeScript focado sem erros no recorte nem em suas dependências; lint focado aprovado.
  Fonte da Page comparada com a base remota; apenas listagem e
  barra de filtros mudaram. Fluxo de segunda via permaneceu fora da alteração.
- Smoke Safari local com dados fictícios: nome reduziu a lista de 24 para 12 registros
  sem clicar em Filtrar; busca digitável de modalidade e curso mostrou opções corretas,
  e o teclado selecionou modalidade, curso e turma. A combinação com o nome reduziu a
  lista para quatro registros. A revisão visual desktop aprovou campos e painel próprios.
  Falhas e respostas atrasadas foram exercitadas no teste de UI; não houve gravações reais.
- CI focada e Preview Vercel do manifesto são os gates finais de revisão no GitHub.
- O check global local de linhas continua encontrando fontes ausentes do workspace
  compartilhado, fora deste manifesto. Os 16 arquivos da entrega foram conferidos
  diretamente; a CI verifica a cobertura incremental no checkout remoto completo.

## Manifesto explícito

Total: 16 arquivos

- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionsToolbar.tsx`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.types.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes-list.service.ts`
- `modules/gestor/secretaria/historico-emissoes/useEmissionsListing.ts`
- `modules/gestor/secretaria/historico-emissoes/emissions-filters.ui.test.tsx`
- `modules/gestor/secretaria/historico-emissoes/emissions-list.service.test.mjs`
- `supabase/migrations/20261107190000_history_emission_filters.sql`
- `supabase/tests/history_emission_filters.isolated.test.mjs`
- `scripts/test-history-emission-filters.mjs`
- `.github/workflows/history-emission-filters.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-07-historico-emissoes-filtros.md`
