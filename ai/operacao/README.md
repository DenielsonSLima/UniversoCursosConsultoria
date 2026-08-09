# Operação de agentes

Esta pasta contém contexto operacional versionado com carregamento progressivo.

## Leitura

- Ajuste rápido: somente AGENTS.md e os arquivos diretamente afetados.
- Ajuste PDF focado: somente AGENTS.md, a política de PDFs e o exportador afetado.
- Mudança padrão: acrescentar MEMORIA_CANONICA.md e o lote atual.
- Mudança crítica: acrescentar apenas a política do domínio.
- RAG: usar somente quando uma decisão anterior for necessária.

## Fontes

- Regras e roteamento: AGENTS.md
- Índice durável: MEMORIA_CANONICA.md
- Trabalho corrente: LOTE_ATIVO.md
- Políticas condicionais: politicas/
- Processo de entrega: PROTOCOLO_DE_LOTES.md
- Histórico: registros/
- Decisões de arquitetura: docs/decisions/

Históricos não são carregados nem indexados por padrão.

## Verificação operacional

Depois de alterar AGENTS, memória, protocolo, lote ou RAG, execute:

`npm run test:agent-operations`

O contrato falha se o lote ativo acumular blocos, o contexto crescer além do limite, históricos voltarem ao RAG, `tmp` entrar no TypeScript, regras de PDF conflitarem ou a busca RAG gravar/ultrapassar um segundo. Não execute este teste em hotfix de produto que não alterou a operação dos agentes.
