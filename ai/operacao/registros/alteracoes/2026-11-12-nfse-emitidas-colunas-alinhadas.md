# Notas emitidas: colunas e ações alinhadas

## Pedido e aceite

Padronizar as linhas de notas emitidas do Emissor NFS-e, incluindo a última linha mostrada na captura do usuário, com nome extenso e sem menu de operação. Destinatário, contexto, situação, valor e ações devem seguir as mesmas colunas.

## Estado da entrega

- Candidato 4.8.329, revisão 338, sobre Caixa 4.8.328, commit `ad2240ac6628433cfc4743014196861d891badf1` (PR #417).
- Os dois patches de interface já existiam localmente e foram revisados sem acrescentar alterações de implementação.
- Metadados preparados somente após confirmar a base e seu manifesto; PR em rascunho e CI/Preview serão acompanhados antes de qualquer publicação.

## Causa e correção

Antes, cada linha calculava sua própria grade com uma coluna de ações automática. Quando o menu de operação não era exibido, essa coluna ficava mais estreita e deslocava o contexto das notas em relação às demais linhas.

A lista agora define as três colunas compartilhadas. Cada nota usa `subgrid`, preservando a mesma posição de destinatário, contexto e ações. Um espaço de 38 px, ou 44 px no móvel, mantém a largura destinada ao menu mesmo quando ele não se aplica à nota.

Os títulos e nomes usam peso 500 e os valores peso 600, conforme o padrão compacto. Em larguras menores, a grade passa a duas colunas e depois a uma, com quebra dos nomes extensos e das ações. O nome completo continua no conteúdo e no atributo de título.

Visualizar, PDF, XML, seleção por página, ZIP, filtros, paginação, situações e identidade dos registros conservam seus handlers e contratos.

## Validação realizada

- `NfseIssuedList.interaction.test.mjs`: 1 teste aprovado, exercitando ações, seleção/ZIP, filtros, paginação e preservação da lista após falha de atualização.
- Smoke DOM/CSS temporário: três notas sintéticas, destinatário extenso na última linha e presença/ausência do menu; todas conservam três blocos e o espaço da operação.
- O mesmo smoke confirmou os handlers de Visualizar, PDF, XML e seleção da última nota, preservando o ID correspondente.
- Contratos CSS conferidos nas larguras de 1440, 768 e 390 px: três, duas e uma coluna, respectivamente, além da largura do espaço do menu e da quebra no móvel.
- Os arquivos de implementação têm 37 e 85 linhas físicas. O harness e os relatórios regeneráveis permanecem em `tmp`.

## Limite da validação

Nenhuma interface ou navegador foi aberto nesta revisão, conforme a orientação do usuário e a coordenação da tarefa. JSDOM e análise de CSS não medem a geometria renderizada. O smoke visual autenticado e a comparação efetiva de posições na tela permanecem pendentes; os testes DOM não foram apresentados como substitutos dessa conferência.

## Manifesto explícito

- `modules/gestor/emissor-nfse/emitidas/NfseIssuedRows.tsx`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-downloads.css`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-emitidas-colunas-alinhadas.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-258.md`

Total: 8 arquivos.

## Publicação confirmada

PR #420 integrada em `a43ee0f4d538bda5b0e459bd54c6f763f05a13ca`, versão 4.8.329, após 5/5 workflows aprovados e Preview READY na SHA `6e77226c15c9958b19ebd9d3aff21b0010d3c81c`. Produção Vercel `dpl_5mVF9VWvQT98sz6weLNxssC7jXyr` READY; domínio e asset principal responderam HTTP 200 e contêm a versão 4.8.329. A conferência geométrica autenticada permanece com o usuário.
