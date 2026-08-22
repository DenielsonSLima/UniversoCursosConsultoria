# Protocolo proporcional de execução

## 1. Ajuste rápido

Para correção localizada e sem risco crítico:

1. usar um agente;
2. abrir somente o arquivo do fluxo afetado e sua dependência direta;
3. reproduzir ou confirmar a causa;
4. aplicar o menor patch;
5. executar teste focado ou smoke;
6. entregar sem criar lote, registro, versão, RAG ou build global.

Se o escopo ou risco crescer, reclassificar antes de continuar.

## 2. Ajuste PDF focado

- Alteração visual localizada em compositor nativo existente usa um agente.
- Carregar somente a política de PDFs; não abrir memória, lote ou RAG.
- Validar exportador, texto, imagens isoladas e render da página afetada.
- Payload, paginação, novo pipeline ou compositor compartilhado de impacto amplo saem desta faixa.

## 3. Mudança padrão

- Manter um domínio por lote.
- Registrar objetivo, arquivos, aceite, risco e validação de forma curta.
- Consultar RAG apenas quando histórico/decisão for necessário, com até dois resultados.
- Executar testes focados durante o trabalho e uma validação final proporcional.

## 4. Mudança crítica

Banco, Auth/RLS, financeiro, PDF estrutural, infraestrutura ou publicação:

- carregar somente a política do domínio;
- reproduzir o fluxo real antes do patch;
- validar contrato, autorização e smoke diretamente afetados;
- usar revisão adicional apenas se houver uma frente independente ou risco que a justifique.

## 5. Fechamento

1. conferir o manifesto de arquivos;
2. executar `npm run check:file-lines` e modularizar todo arquivo manual auditado acima de 500 linhas;
3. preservar migrations já aplicadas como exceções imutáveis identificadas pelo registro remoto;
4. executar a validação final uma vez;
5. registrar limitações reais, inclusive smoke pendente;
6. atualizar o registro do lote;
7. executar node scripts/agent-memory-rag.mjs index uma vez se fontes RAG mudaram.

## 6. Publicação

- GitHub somente por MCP.
- Um commit atômico e uma Preview Vercel para o lote pronto.
- Não consolidar domínios sem relação apenas por proximidade de data.
- Produção somente por solicitação explícita.
