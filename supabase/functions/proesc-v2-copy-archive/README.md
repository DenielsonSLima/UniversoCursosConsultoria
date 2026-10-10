# Endpoint V2 copy-only: shim backend em preparação

Código para revisão/publicação; não implantado por esta etapa. Nenhuma consulta,
exportação, credencial, arquivo Storage ou plano real foi usado nos testes.

## Fluxo implantável

`index.ts` importa `npm:@supabase/supabase-js@2.95.3`, usa somente
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existentes no servidor e liga
`createV2CopySdkBridge` a `createV2CopyHandler`. Não existe novo segredo, cron,
fila, frontend, TUS ou invocação de workers V1.

A factory do handler vem OFF. O index habilita a rota, mas não aprova lotes:
a tabela privada de planos começa vazia e somente o operador pode preencher um
plano autorizado. O serviço aceita apenas POST JSON `{batchId}`. Não aceita
unidade, run, IDs, destino, conteúdo financeiro ou recibo fornecidos pelo cliente.
Corpo limitado a 256 bytes efetivamente lidos; campos adicionais/duplicados,
tipos alternativos, encoding e UTF-8 inválidos são recusados.

O header `X-Proesc-Sync-Secret` deve conter o segredo existente no formato
esperado. Ele é verificado por `proesc_v2_worker_service` com `p_action=authorize`
e `p_payload={key}`, alinhado ao `proesc-api` V2 e `connection_v2`. Somente actorId
UUID de resposta sem erro é aceito. Não chama claim/enqueue ou sincronização.
Falha de autenticação ocorre antes da exportação. Nenhum valor de segredo entra
em logs, respostas, fixtures ou documentação. As strings de testes são fictícias.

O plano em [PILOT-RUNBOOK.md](../../review-drafts/proesc-v2-growth/PILOT-RUNBOOK.md)
define `verify_jwt=false` somente para este novo endpoint, com autorização
específica de implantação ainda necessária. A autenticação é o header custom
validado pelo authorizer V2; não habilita CORS para frontend. O
[EDGE-BUNDLE.json](../../review-drafts/proesc-v2-growth/EDGE-BUNDLE.json) enumera
os oito arquivos runtime, sem fixtures, e a dependência SDK pinada.

Após autenticação, a RPC `proesc_v2_export_copy_service(p_batch)` devolve o plano
aprovado e payload exato. O handler valida batch/projeto/bucket/namespace/unidade
antes de instanciar o adapter. O codec completo volta a conferir metadados,
seleção e conteúdo antes de qualquer upload. Destino fixo:

- projeto `kfekgwyqozhicpfuunpo`;
- bucket privado `proesc-history`, MIME `application/gzip`, máximo 4 MiB;
- prefixo `proesc-v2-copy/<unit_id>`, unidade obtida exclusivamente da export RPC.

O fluxo reusa o codec/worker V2 existente: upload e readback integral dos dados,
manifesto gzip por último e seu readback. Antes de registrar o recibo, executa
uma nova leitura dos objetos e restaura `payloadText` byte a byte em destino
isolado de memória, limitado a 1 MiB. Confere hash/tamanho/contagem/batch e só então
chama `proesc_v2_record_copy_receipt_service`. Erro de restauração bloqueia catálogo.
A resposta positiva contém somente `status`, recibo estrito e
`restoreVerified: true`. Nunca contém o payload nem importa dados para o banco.

## Deadline, transporte e ambiguidades

Há deadline global de até 80 segundos cobrindo autenticação, corpo, exportação,
upload, readback, restauração e catálogo. Abort do cliente também cancela o fluxo.
O AbortSignal chega ao SDK por `.rpc(...).abortSignal(signal)` e ao Storage por
`AbortSignal.any`, combinado com os limites por requisição do adapter. Ao
encerrar a resposta, o controlador é abortado e nenhuma continuação pode iniciar
outra requisição. Clientes/transporte devem respeitar cancelamento; operação já
recebida pelo servidor pode concluir apesar do timeout.

O SDK usa fetch injetado. Origem é fixa, sem URL arbitrária, query ou credencial
na URL. RPCs são limitadas a três nomes exatos e método POST. Storage só aceita
GET do bucket esperado e GET/POST dos nomes content-addressed no prefixo da
unidade aprovada. `redirect: error` e validação da resposta impedem encaminhar
credenciais para outro host. Resposta RPC é limitada a 4 MiB reais antes de o SDK
fazer parsing; respostas Storage continuam limitadas pelo adapter.

Nenhum retry automático é acrescentado. A versão SDK 2.95.3 está pinada; versões
mais novas têm diferenças de retry que exigem nova revisão. HTTP/SDK ou catálogo
ambíguos retornam falha saneada, não sucesso inferido. Uma repetição explícita do
mesmo batch deve reutilizar bytes iguais e aceitar apenas recibo idêntico.
Objetos parciais não são excluídos. Não existe transação distribuída.

## Testes e limites da evidência

Local Node, somente mock:

`node --test supabase/functions/proesc-v2-copy-archive/handler.test.mjs supabase/review-drafts/proesc-v2-growth/archive/*.test.mjs`

Deno/SDK real pinado com HTTP completamente mock, sem permissão runtime de rede:

`deno test --no-config --no-lock --node-modules-dir=none supabase/functions/proesc-v2-copy-archive/sdk-real.test.ts`

O carregamento inicial da dependência npm usa o mecanismo de módulos do Deno;
o teste não acessa conta, endpoint ou segredo real. Não lê envs da aplicação.
O teste real cobre fluxo/replay do SDK, erros sem retry, abortSignal, deadline,
AbortSignal.any no Storage, limites de gzip no runtime Deno e restauração que
falha depois do upload sem registrar catálogo. Imports `node:buffer` explícitos
estão nos módulos alcançados pelo runtime que usam Buffer.

Deno/SDK não estavam instalados no executor de desenvolvimento. Portanto o
resultado Node não substitui o gate Deno 2.9.1 no CI do commit publicado. A versão
implantada do Edge Runtime, bundling e o fluxo autenticado real ainda exigem
verificação antes de um lote real. Mocks não comprovam disponibilidade, RLS,
quota, desempenho, backup ou autorização efetiva da identidade real.

## Gates de operação

Revisão e CI não autorizam implantação. Depois de autorização específica:
instalar o SQL privado, implantar o endpoint e sua configuração de gateway,
verificar authorizer/identidade, preparar exatamente o lote aprovado e fazer uma
invocação única conforme o plano revisado. Sem novos schedules ou credenciais.
A restauração em memória demonstra equivalência imediata dos objetos naquele
fluxo; não substitui política de custódia, backup ou ensaio posterior de desastre.
Copiar e registrar recibo não remove ou desreferencia fontes e não reduz sozinho
o disco ocupado/provisionado. Exclusão continua fora deste módulo.

## Fontes oficiais verificadas

- https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal
- https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js
- https://docs.deno.com/runtime/fundamentals/node/
- https://supabase.com/docs/guides/storage/uploads/file-limits
