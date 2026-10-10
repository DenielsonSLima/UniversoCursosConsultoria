# Piloto V2 copy-only: pacote preparado, execução ainda não autorizada

Destino único: projeto `kfekgwyqozhicpfuunpo`, bucket privado `proesc-history`,
prefixo `proesc-v2-copy/<unit_id>/`. O primeiro piloto proposto contém uma única
observação financeira de um RECENT COMPLETE e seus metadados de proveniência.
O formato suporta até 100 IDs explícitos, mas isso não amplia o primeiro piloto.

## Inventário fechado de dependências

- PostgreSQL: fase de payload instalada/ON, FK/XOR validadas, leitor canônico e
  inventário de leitores sem drift. Não modificar as duas migrations aplicadas.
- Draft 05: duas tabelas privadas append-only, três helpers internos, dois RPCs
  SECURITY DEFINER e atualização atômica do inventário por hash exato. Somente
  os dois RPCs públicos recebem EXECUTE para service_role; tabelas sem grants.
- Fonte: plano privado aprovado por postgres, mesmo run/unidade terminal,
  tasks invoices COMPLETE, 1–100 observações não STAGED e texto total <=1 MiB.
  Fonte inclui conteúdo financeiro/pessoal importado e referências, sem exportar
  integralmente links, snapshots, pagamentos ou tabelas relacionadas.
- Runtime: Edge Function nova `proesc-v2-copy-archive`, SDK
  `npm:@supabase/supabase-js@2.95.3`, módulos Node crypto/zlib/util/buffer sob Deno.
  O CI usa Deno 2.1.4/2.9.1 e SDK real com transporte HTTP em memória.
  Descompressão usa contador streaming próprio, sem depender de maxOutputLength.
- Identidade: somente os envs backend existentes SUPABASE_URL e
  SUPABASE_SERVICE_ROLE_KEY. Nenhum valor é lido pela operação preparatória.
- Autorização de chamada: X-Proesc-Sync-Secret, validado pelo RPC existente
  `proesc_v2_worker_service('authorize', ...)`, com connection_v2 e operador
  financeiro válido. Nunca chamar enqueue/claim, workers V1 ou ações de limpeza.
- Gateway: implantar SOMENTE esta função com verify_jwt=false, pois o segredo
  dedicado é verificado no handler. Não alterar Auth global ou políticas Storage.
- Storage: bucket privado existente, MIME application/gzip, 4.194.304 bytes por
  objeto, POST sem overwrite e GET autenticado/readback. Manifesto publicado por
  último; hashes dos bytes comprimidos e do JSON lógico são distintos.
- Invocação única: pg_net 0.20.3 e Vault 0.3.1 já existem; nome de segredo
  `proesc_sync_worker_secret` confirmado por metadados. O valor fica no servidor.
  Não criar cron, segredo, token, sessão de usuário ou credencial persistente.

Metadados do authorizer V2 conferidos em 10/10/2026: owner postgres,
SECURITY DEFINER, search_path vazio, EXECUTE postgres/service_role,
MD5(prosrc) `27e224bb4306865752b2b611fad456a3`. Revalidar antes da instalação.

## Fronteira da próxima aprovação

A aprovação precisa abranger, em conjunto: instalar o SQL exato do draft 05 como
migration registrada; conceder EXECUTE dos dois RPCs novos ao service_role;
implantar a nova função backend com a autenticação descrita; criar UM plano de
UMA observação e copiar esse conteúdo financeiro/pessoal para o bucket privado
indicado; baixar/verificar/restaurar os bytes em memória no próprio backend.
Esse escopo não inclui merge do PR, limpeza, retenção, nova credencial ou cron.

Selecionar o ID por metadados, informar run/unidade e registrar a seleção exata
no recibo operacional antes de preparar o plano. Não imprimir o conteúdo bruto,
nomes, CPF, dados de cobrança ou segredo na conversa, nos logs ou no repositório.
Um objeto de dados e um manifesto são esperados. Há consumo de Storage/egress;
os metadados de objetos não comprovam saldo de quota da organização.

## Sequência operacional, somente depois da aprovação

1. Atualizar main/head, catálogo/migrations, hashes/ACL, configuração privada do
   bucket e existência da identidade. Drift, bucket público ou erro de permissão
   interrompem a execução; não ampliar acesso para contornar a falha.
2. Aplicar o draft 05 exato como uma migration atômica (lock_timeout 3 s,
   statement_timeout 15 s). Ele mantém a flag de payload e origens intactas,
   instala planos/recibos vazios e envia reload schema ao PostgREST. Conciliar
   nome/versão e bytes aplicados no repositório sem reparar histórico antigo.
3. Implantar o bundle do commit revisado usando MCP Supabase, entrypoint
   `supabase/functions/proesc-v2-copy-archive/index.ts`, verify_jwt=false.
   Incluir somente os arquivos runtime enumerados em EDGE-BUNDLE.json.
   Não injetar valores de credenciais no bundle; o runtime fornece os envs.
4. Conferir o deploy retornado e os arquivos/metadados da função. O serviço está
   callable após deploy, mas só aceita batch IDs de planos aprovados, inicialmente
   inexistentes. A factory é OFF por padrão; o entrypoint revisado a habilita.
5. Preparar o plano exato com `v2_prepare_copy_archive(batch,run,unit,ids)` como
   postgres e statement_timeout 5 s antes do comando. Retornar apenas metadados.
6. Preencher `invoke-copy-pilot.template.sql` com o batch aprovado e executar uma
   única vez. O retorno é um requestId; timeout ou resposta perdida exige leitura
   desse requestId e do recibo antes de cogitar qualquer repetição.
7. Ler somente id/status_code/timed_out e o campo status JSON conhecido da resposta
   pg_net; nunca imprimir headers, segredo, error_msg ou corpo arbitrário. Verificar
   o recibo pelo batch exato e os tamanhos/hashes dos dois objetos por metadados.
8. Aceite: status COPY_RECEIPT_RECORDED e restoreVerified=true do handler, recibo
   vinculado ao plano, bytes/hashes iguais, uma linha de plano/recibo, nenhuma
   alteração financeira/de origem. A restauração reconstrói os bytes em memória;
   não aplica linhas no banco nem substitui teste futuro de desastre/backup.

## Limites e recuperação

O handler aceita apenas POST JSON com batchId, no máximo 256 bytes. Autoriza antes
da exportação, fixa origem/destino e propaga abortSignal. Prazo global 80 s,
invocação pg_net 90 s. O prazo cliente não prova cancelamento imediato do servidor
PostgREST; não repetir automaticamente uma operação de resultado desconhecido.

Fonte alterada após o plano falha por hash. Objeto divergente não é sobrescrito.
Falha de upload/readback/restauração não confirma catálogo. Se o catálogo for
gravado e a resposta se perder, leitura do recibo é necessária; se a fonte também
mudar, o replay por exportação pode falhar. Não criar plano substituto para isso.

Falha antes de instalar reverte a transação. Depois do deploy, parar invocações e
não aprovar novos planos limita a exposição; desativar o endpoint/RPC exige a
ação de segurança especificamente autorizada. Não apagar objetos/planos/recibos
para desfazer o piloto. O reaproveitamento de payload é uma função independente.

O bucket pode ter sua privacidade alterada por um administrador entre requisições;
o check do adapter não elimina esse risco. RLS/ACL do ambiente real, identidade,
bundle Edge e comportamento HTTP só ficam homologados pelo piloto autorizado.
Backup/PITR do banco não preserva os bytes Storage. Copiar não libera disco SQL.

## Fim desta preparação

Código runtime e bundle enumerados, caminho de invocação existente identificado,
SQL/SDK/Deno/HTTP sintético aprovados no mesmo commit, revisão independente e CI
completo. Depois disso resta a aprovação conjunta acima e sua execução limitada;
não há integração adicional prevista para o primeiro piloto copy-only.
