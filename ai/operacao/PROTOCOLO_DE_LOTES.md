# Protocolo de lotes

## 1. Abrir

Crie ou atualize `LOTE_ATIVO.md` com objetivo, escopo, critérios de aceite, risco, validações e destino de publicação. Agrupe somente alterações que façam sentido serem testadas e publicadas juntas.

## 2. Recuperar contexto

Leia `MEMORIA_CANONICA.md` e consulte o RAG com termos da demanda. Leia arquivos de código apenas do módulo retornado pela busca ou necessário ao caminho de execução.

## 3. Executar

Implemente localmente. Durante o lote, use testes e inspeções focadas. Não publique mudanças intermediárias nem provoque Previews Vercel para cada correção.

Se a publicação anterior foi feita por MCP, a referência Git local pode estar atrasada. Não faça uma varredura total nem use o status global como prova de trabalho pendente: compare no MCP apenas os arquivos do lote e prepare o commit com essa lista explícita.

## 4. Fechar tecnicamente

Antes de publicar:

1. revisar arquivos e escopo do lote;
2. executar os testes focados;
3. executar as validações globais exigidas pelo risco uma única vez;
4. reindexar o RAG uma única vez;
5. atualizar `ai/operacao/registros/ALTERACOES.md` e preparar o registro de publicação.

## 5. Publicar

Use MCP GitHub para criar um único commit atômico contendo todos os arquivos do lote. Abra ou atualize uma única PR. Aguarde uma única Preview Vercel do commit final. Só promova à produção quando o usuário pedir e os critérios de aceite estiverem confirmados.

## Exceções

Um hotfix crítico pode ser isolado em lote próprio quando o usuário pedir urgência. Mesmo nesse caso, ele precisa de escopo, teste focado, commit atômico e registro.
