# Prévia local de cupons EAD

Esta prévia usa os componentes, serviços e RPCs SQL do módulo com um banco PostgreSQL/WASM descartável em memória. Todos os dados são fictícios. Não lê `.env`, não usa credenciais, não consulta Supabase remoto e não chama bancos.

Na raiz do repositório, com as dependências já disponíveis:

```sh
PGLITE_MODULE_PATH=/private/tmp/universo-banking-pglite-20261115/node_modules/@electric-sql/pglite/dist/index.js node scripts/ead-coupons-local/start.mjs
```

Se `@electric-sql/pglite` estiver resolvível no ambiente, a variável é opcional. A variável aponta para o módulo instalado; não informa uma conexão de banco. A prévia não instala pacotes.

Abra `http://127.0.0.1:4387`. Para escolher outra porta local, acrescente `--port 4457` ao comando.

1. Em **Secretaria**, confira os cupons `LOCALGRATIS` e `LOCAL50`, cadastre um novo, edite limites e abra o histórico.
2. Escolha um dos quatro **alunos fictícios**, abra um curso e aplique `LOCALGRATIS`. A confirmação deve liberar a matrícula sem criar cobrança.
3. Para testar 50%, use outro aluno ou curso, aplique `LOCAL50` e confirme. A matrícula deve ficar pendente com a cobrança fictícia pela metade.
4. O botão **Simular pagamento fictício** cria a prova sintética do harness e exercita a confirmação SQL. Não representa pagamento real e não gera título pagável.
5. Retorne à Secretaria para conferir reservas, confirmações e histórico financeiro. As telas invalidam os dados automaticamente.

O servidor escuta exclusivamente em `127.0.0.1`; APIs aceitam apenas a origem local, com token por execução e lista fechada de RPCs. O bundle substitui `lib/supabase` apenas dentro desta prévia. As identidades são simuladas no harness: isso valida contratos e regras fictícias, sem comprovar autenticação ou transporte Realtime de produção.

Encerre com `Ctrl+C`. Cada nova execução começa com dados novos. Nenhum arquivo de banco é gravado e nenhuma migration é aplicada fora da memória.

Para validar o servidor por HTTP, em outra sessão, execute o teste abaixo com a prévia recém-iniciada. Ele utiliza apenas o aluno fictício 4, preservando os outros três para revisão manual. Esse teste é ignorado quando `COUPONS_PREVIEW_URL` não está definida.

```sh
COUPONS_PREVIEW_URL=http://127.0.0.1:4387 node --test scripts/ead-coupons-local/preview-http.test.mjs
```
