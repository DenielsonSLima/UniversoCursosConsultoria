# NFS-e de serviço: navegação depois da autorização

Data: 14/11/2026. Classificação: mudança padrão de interface, com confirmação fiscal e visualizador preservados.
Status: implementado e revisado; publicação no GitHub e produção autorizada pelo usuário. Versão preparada: 4.8.341, revisão 350.

## Pedido e aceite

Após confirmar a autorização de NFS-e de serviço, fechar o fluxo de emissão, selecionar Emitidas e abrir a prévia da nota autorizada. Notas de alunos mantêm o fluxo anterior. Em lote de serviços, aguardar todos os resultados e abrir a última nota autorizada.

## Implementação

- Callback entre modal de lote, contexto e workspace. Exige lote composto somente por serviços, todos autorizados com número/chave completos, sem operação incerta, rejeitada ou referência de cancelamento na linha/retorno.
- A aba Emitidas reaproveita o visualizador canônico e consome a seleção inicial uma vez. Identidade e contexto impedem reabertura/resultado de outro polo, ambiente ou mês.
- Autorização recém-confirmada tolera ausência em cache filtrado/antigo: competência do serviço pode ser anterior à emissão efetiva. Erro de acesso e documento cancelado canônico continuam prevalecendo; após a primeira observação canônica, remoção volta a suprimir a seleção como antes.
- Não insere linhas nem inventa contagens em listas paginadas. XML continua no getter autenticado e mantém identidade fiscal, escopo, chave e digest.

## Manifesto explícito

- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseTabContext.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/visualizador/hooks/useNfseIssuedSelection.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-presentation.ts`
- `modules/gestor/emissor-nfse/emissao/NfseServicePostIssue.interaction.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-14-nfse-servico-pos-emissao.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

- `.github/workflows/nfse-regressions.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versao-4-8-273.md`

Total: 14 arquivos.

## Validação e limites

- 15 testes focados aprovados: Serviços → emissão individual/lote → Emitidas → visualizador; aguarda todas as notas do lote e abre a última; alunos/misto/falha/ambiguidade sem navegação.
- Cache antigo/filtrado, emissão sob competência anterior, AccessError, cancelamento no retorno ou na linha, cancelamento canônico, observação em lista e remoção posterior cobertos.
- Revisão independente aprovada após corrigir o caso de cache/período e a guarda de cancelamento no retorno reconciliado.
- Todos os arquivos abaixo de 500 linhas. TypeScript na base isolada publicada, ESLint focado e auditoria de linhas aprovados. Build completo 4.8.341 aprovado com Node 24.22.1; 5/5 testes DOM reexecutados na base de publicação, além dos 10 contratos XML aprovados pela revisão.
- Teste DOM usa serviços sintéticos e a fronteira do visualizador simulada; contrato real de XML passou. Não houve emissão real, operação Supabase, alteração fiscal ou reprocessamento.
- Smoke autenticado pós-emissão permanece pendente porque exigiria uma emissão fiscal real. A alteração não foi publicada na versão 4.8.340 do Caixa.
- Snapshots de origem, patch e manifesto em `/tmp/universo-nfse-pos-emissao-20261114`; artefatos temporários fora do lote.

Autorização explícita recebida: “Publicar NFS-e no GitHub e produção”. Publicação isolada sobre main `81ecc80448f2a6a824d238f6852770dade0e1458`, preservando o Caixa 4.8.340 e alterações paralelas. Nova regressão registrada no workflow NFS-e existente; entrada 4.8.273 movida integralmente ao arquivo histórico para respeitar 500 linhas.
