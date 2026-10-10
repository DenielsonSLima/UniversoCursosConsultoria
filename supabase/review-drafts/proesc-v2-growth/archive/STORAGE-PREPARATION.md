# Adapter privado Supabase Storage: preparo com HTTP simulado

Data: 2026-10-10. Base de integração: PR 289 RC.4.

## Entrega implementada

- `supabase-store.mjs`: protocolo HTTP Storage para bucket existente e privado.
- `storage-transfer.mjs`: upload de arquivo sintético já verificado, seguido de
  manifesto também gzip; download verificado e restauração em destino local separado.
- `storage-http-fixture.mjs`: implementação em memória do contrato Fetch.
- `supabase-store.test.mjs` e `storage-transfer.test.mjs`: testes de integração
  HTTP sem servidor, sockets, DNS ou acesso a uma conta.

O núcleo offline anterior não foi modificado. Não existem nova migration,
cron, exportador SQL, catálogo remoto, criação de bucket, atualização de política,
criação de credencial, URL pública/assinada, sobrescrita ou exclusão neste módulo.
Nada é importado automaticamente pelo aplicativo ou ativado na produção.

## Configuração e confiança

`createSupabasePrivateStore(config, dependencies)` requer:

- `projectRef`: referência exata do projeto, sem aceitar URL arbitrária;
- `bucket`: nome exato do bucket existente;
- `namespace` e `tenantId`: prefixo composto `namespace/tenantId`;
- `enabled`: falso por padrão; a criação do adapter nunca inicia HTTP;
- `maxObjectBytes`: padrão 4 MiB, teto genérico 6 MiB; sempre respeita limite menor
  do bucket. Para o destino identificado, manter 4 MiB; `timeoutMs` limita cada requisição;
- `transport`: implementação Fetch explicitamente injetada, sem fallback global;
- `credentials(scope)`: callback que fornece `apiKey` e `accessToken` efêmeros
  para o escopo aprovado. Não lê `.env`, não grava nem devolve credenciais.

Configuração, seleção de projeto/tenant e provedor de credenciais pertencem ao
backend confiável. Validação sintática não autoriza destino fornecido por um
cliente, nem credencial compartilhada indiscriminadamente entre projetos. A
resolução de identidade deve ligar usuário/job autorizado ao tenant e ao projeto
exatos antes de instanciar o adapter. Isso não está implementado por este ensaio.

O host é construído como `https://<projectRef>.supabase.co`; custom domains e
self-hosting não são aceitos nesta versão. O transporte recebe `redirect: error`
e o adapter rejeita respostas redirecionadas/fora do URL esperado. Cabeçalhos de
autenticação nunca são colocados na URL, no recibo ou nos erros emitidos.
Um transporte injetado é código confiável e deve respeitar AbortSignal e a
política de redirects; a injeção não é uma sandbox contra transporte malicioso.

As credenciais dos testes são strings explicitamente fictícias. Não copiar ou
solicitar chaves reais em código, documentação, chat ou fixtures. A escolha de
autenticação real e o provisionamento/armazenamento seguro, se necessários,
continuam sujeitos à autorização específica; não se concede acesso persistente
como parte deste preparo.

## Protocolo e integridade

1. Confere `GET /storage/v1/bucket/<bucket>`: identidade esperada, `public: false`
   e tipo STANDARD quando informado. Falta de permissão ou bucket ausente bloqueia
   o fluxo; nenhuma configuração é alterada para contornar esse bloqueio.
2. Verifica limites efetivos informados pelo bucket e o tipo de conteúdo.
3. Faz `POST /storage/v1/object/<bucket>/<namespace>/<tenant>/<nome>` com
   `x-upsert: false`, `Content-Type: application/gzip` para os dois arquivos e
   sem `Content-Encoding` ou cache público. Não aceita manifesto JSON cru remoto.
4. Exige identidade correta na resposta de sucesso e lê o mesmo objeto por GET
   autenticado. Só confirma upload/reuso se os bytes forem idênticos.
5. A ponte envia primeiro o objeto; somente após readback confirmado envia o
   manifesto gzip e confere seu readback. Só então devolve o recibo v2.

O limite de leitura considera bytes efetivamente recebidos, mesmo se
Content-Length faltar ou estiver subestimado. Declarações acima do limite são
recusadas antecipadamente. Verificação offline também limita descompressão.
Descritor, escopo e limites são copiados antes dos primeiros awaits, impedindo
que mutação concorrente pelo chamador troque o manifesto durante a operação.
O adapter exige também que o SHA-256 dos bytes copiados corresponda ao nome do
objeto antes de chamar o provedor de credenciais ou fazer HTTP, mesmo fora da ponte.

Um upload sem resposta confiável permanece não confirmado; não há retry
automático. Repetir explicitamente o mesmo lote usa a mesma chave. Conflito de
objeto existente só resulta em reuso depois de readback idêntico. Bytes diferentes
bloqueiam o fluxo, sem sobrescrever. Falhas podem deixar objetos órfãos; nada os
remove automaticamente. Não existe transação distribuída entre os dois objetos
ou entre Storage e banco. O recibo deve ser persistido futuramente em catálogo
confiável para permitir retomada e restaurar o manifesto esperado.

A restauração valida o escopo e limites do recibo antes de HTTP, confere os
hashes gzip/JSON e reconstrói em staging o manifesto offline original byte a byte.
Executa o verificador completo do formato antes de gravar o arquivo final. Não importa dados de volta ao Postgres. O hash detecta alteração,
mas não prova autenticidade se o próprio recibo confiável for substituído.

## Manifesto gzip e recibo v2

A leitura somente de metadados reportada nesta revisão identificou o bucket
privado `proesc-history` com limite de 4 MiB e MIME `application/gzip`. A policy
server-only bloqueia anon/authenticated. A compatibilidade foi preparada usando
um bucket fictício em memória com essas mesmas restrições; nenhum bucket real,
MIME, policy ou credencial foi alterado. O nome real não é ativado como default.

O objeto de dados conserva `<archiveId>.<hash-gzip-dados>.jsonl.gz`. O manifesto
remoto passa a `<archiveId>.<hash-gzip-manifesto>.manifest.json.gz`. Esse digest
sempre descreve os bytes comprimidos efetivamente enviados, não o JSON interno.
O recibo `proesc-storage-transfer-v2` guarda somente:

- `archiveId`, `tenantId`, `storageScope`;
- `manifestObjectName`, `manifestCompressedSha256`, `manifestCompressedBytes`;
- `manifestJsonSha256`, `manifestJsonBytes`, correspondentes ao JSON offline original;
- `transferFormat`, `syntheticOnly: true`, `cleanupEnabled: false`.

Nome e hash comprimido são vinculados antes de HTTP. O gzip é lido com teto igual
ao tamanho comprimido confirmado no recibo, limitado também a 64 KiB e ao teto do
adapter. Após checar tamanho e SHA-256, `gunzip` limita a saída ao tamanho JSON
declarado, que nunca pode exceder 64 KiB. Confere comprimento e hash do JSON antes
de fazer parsing ou buscar os dados. `archiveId` do conteúdo deve coincidir com
o recibo e ambos os nomes. A reconstrução local usa
`<archiveId>.<manifestJsonSha256>.manifest.json`, sem alterar o núcleo offline.

Os limites de 64 KiB comprimidos/descomprimidos são independentes; não confundir
com os 4 MiB por objeto de dados nem com o limite offline padrão de 16 MiB para
JSONL descomprimido. O verificador offline continua aplicando limites de dados,
contagens e IDs antes da restauração final. O módulo carrega um lote em memória.

Recibos v1 de manifesto JSON cru são recusados. Nenhum lote real foi enviado por
esta implementação, portanto não há migração de objetos ou catálogo. Retomada
usa os mesmos bytes e chaves; mudança de implementação da compressão pode produzir
outro hash gzip para o mesmo JSON. O recibo confirmado, e não a recompressão futura,
é a referência de restauração. Nenhuma falha autoriza exclusão ou sobrescrita.

## Primeiro lote real: requisitos ainda pendentes

O ensaio HTTP não prova a autorização efetiva da identidade backend, quota livre,
disponibilidade operacional do bucket,
autenticação de produção, desempenho ou privacidade permanente. O check do bucket
é uma fotografia; RLS e governança do projeto devem impedir mudanças indevidas.

Antes de um primeiro lote real, confirmar e autorizar de forma específica:

1. Projeto/organização, bucket privado, namespace e tenant; quais dados e IDs
   serão copiados, finalidade do histórico e limite de bytes do lote. Não inferir
   esses valores de uma requisição do navegador nem de um nome de exibição.
2. Identidade backend já autorizada para SELECT do bucket e INSERT/SELECT dos
   objetos. O bucket server-only exige backend; não habilitar anon/authenticated
   nem ampliar MIME/policies para este formato. Uma identidade privilegiada pode
   ignorar RLS: o backend deve autorizar o tenant e restringir o prefixo antes de
   operar, e testar tentativas cruzadas. Não precisa de UPDATE, DELETE, criação
   de bucket ou URLs assinadas. Permissão de admin não demonstra isolamento RLS.
3. Tipo/limites do bucket, consumo atual de Storage/egress e margem da organização.
   A referência aos 100 GB não confirma plano, saldo livre ou ausência de cobrança.
4. Exportador real com schema/normalização versionados, corte consistente,
   inventário de referências, paginação/limites e representações monetárias
   exatas. A ponte atual aceita apenas arquivos marcados como sintéticos; não
   remover essa proteção ou marcar dados reais como sintéticos para contorná-la.
5. Local seguro e autorizado de restauração, catálogo confiável do recibo,
   conferência integral e prazo de guarda/backup dos objetos. Backups do banco
   não incluem os arquivos Storage; não dependê-los para recuperar objetos.

O primeiro lote real deve ser copy-only: nenhum registro/payload original é
removido, substituído ou tornado inacessível. Sua autorização não autoriza
limpeza posterior. Mudanças necessárias de bucket/RLS/credenciais e ativação
precisam de revisão separada, sem usar este módulo para expandir acesso.

## Seleção conservadora e referências

- Distinguir “pode ser copiado” de “pode sair do banco”. Exportação não comprova
  que um registro está dispensável para os leitores ou para o histórico.
- Usar manifestos de IDs explícitos, estados terminais e corte fixo. Um campo de
  idade não prova elegibilidade; ausência em RECENT não prova exclusão na origem.
- Preservar FULL íntegro de referência, observação vigente por entidade e tenant,
  runs ativos/incompletos/retry, evidências de pagamentos, comprovantes e dados
  com retenção pendente. Não decidir prazo financeiro neste módulo.
- Inventariar FKs de entrada e saída, inclusive observação→payload,
  observação→snapshot/run, vínculos financeiros, aprovações e referências guardadas
  em JSON ou usadas por funções. FKs não cobrem todos os vínculos lógicos.
- Payload compartilhado com qualquer observação referenciando-o não é candidato
  à remoção só por idade. Snapshot referenciado ou prova financeira permanece.
  Dúvida, dependência nova ou drifts do inventário excluem o item da seleção.
- Uma eventual remoção exigirá autorização própria, dry-run atualizado e
  rechecagem transacional imediatamente antes do lote, sem cascata ampla.

## Custos, consumo e limites declarados

O adapter usa upload padrão com lotes pequenos; não implementa TUS, multipart,
streaming de exportação, renovação de sessão, backoff, fila ou limpeza de órfãos.
Falhar com segurança é preferível a ampliar limites ou repetir uploads ambíguos.
Readback e restauração têm custo de tráfego; cada acesso também consulta o bucket.
O desenho prioriza verificação do pequeno primeiro lote, não menor número de RTTs.
É necessário medir CPU, memória, escrita, compressão e egress no ambiente aprovado.

Compressão/transferência não ocorrem em transação SQL. Não exportar o histórico
inteiro em cada cron nem criar um objeto por invoice. Os metadados dos objetos e
do catálogo também consomem banco. Copiar arquivos não reduz automaticamente
disco ocupado/provisionado; DELETE futuro gera WAL e espaço reutilizável.

## Referências verificadas

- [Buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Limites globais e por bucket](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Limite de saída do zlib](https://nodejs.org/api/zlib.html#class-options)
- [Upload padrão e recomendação resumível](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Erros atuais e legados](https://supabase.com/docs/guides/storage/debugging/error-codes)
- [API getBucket e permissões](https://supabase.com/docs/reference/javascript/storage-getbucket)
- [API download](https://supabase.com/docs/reference/javascript/storage-from-download)
- [Limitação dos backups](https://supabase.com/docs/guides/platform/backups)
- [Franquias por organização](https://supabase.com/docs/guides/platform/billing-on-supabase)

Rotas GET bucket/objeto e POST objeto verificadas também no código oficial
`supabase/supabase-js`, `packages/core/storage-js/src/packages/StorageBucketApi.ts`
e `StorageFileApi.ts`, em 2026-10-10. O transporte mock valida esse contrato,
mas não equivale a homologação contra a versão implantada no projeto real.
