# Proesc V2: primeiro lote copy-only, ainda não instalado

Data: 10/10/2026. Candidato 4.8.197-rc.1, conciliado com main 4.8.196. O cancelamento anterior
do RC.5 foi seguido de nova autorização de publicação/CI; o novo head exige checks.

## Destino existente verificado somente por leitura

O projeto `kfekgwyqozhicpfuunpo` tem o bucket privado `proesc-history`, com limite
de 4.194.304 bytes por objeto e MIME permitido `application/gzip`. O adapter foi
adaptado a esses limites, incluindo manifesto gzip, sem ampliar configuração.
O prefixo proposto para a nova cópia é `proesc-v2-copy/<unit_id>/`.

A organização foi identificada como Pro. Os metadados de 1.944 objetos deste
projeto informavam 98.612.543 bytes, incluindo 77.017.166 em 1.773 objetos do
bucket de histórico. Essa leitura limitada não é medição de faturamento, saldo
livre da organização, objetos órfãos, versões ou consumo de outros projetos.

Os workers de arquivo já implantados usam a identidade backend existente. Os
contratos atuais arquivam V1; seus commits incluem DELETE de registros SQL.
Eles não são reutilizados nem invocados por este preparo V2 copy-only. O estado
ACTIVE de uma função não prova que o agendamento esteja habilitado.

## Exportação limitada e identidade

`05_copy_only_catalog.draft.sql` é um draft local, fora de migrations automáticas.
Se aprovado futuramente, cria duas tabelas privadas com RLS, sem grants diretos
a anon, authenticated ou service_role:

- `v2_copy_archive_plans`: seleção aprovada, IDs, hash e tamanho; não guarda payload;
- `v2_copy_archive_receipts`: recibo verificado pelo worker, chave única do lote.

As duas tabelas são append-only, com gatilhos que recusam UPDATE e DELETE.
Não há expiração, remoção, desreferenciamento, troca de leitor ou limpeza.

Somente o operador postgres pode preparar um plano: batch UUID, um run COMPLETE,
uma unidade e de 1 a 100 IDs explícitos, únicos e existentes. Tasks devem ser
invoices COMPLETE; observações STAGED, fontes ausentes e escopos mistos são
recusados. O limite de texto por lote é 1 MiB; excedê-lo exige selecionar um lote
menor, sem truncar registros. O serviço não escolhe nem amplia a seleção.

Dois RPCs novos recebem apenas o batch previamente aprovado:

- `proesc_v2_export_copy_service(uuid)`: leitura do conteúdo e descritor;
- `proesc_v2_record_copy_receipt_service(uuid,jsonb)`: registro idempotente do recibo.

São SECURITY DEFINER com search_path vazio, EXECUTE apenas para service_role e
guarda interna existente por role. O hash/owner/configuração dessa guarda é
checado antes de instalar o draft. Nenhuma credencial é criada ou exposta.
O novo EXECUTE é uma mudança futura de acesso que exige aprovação de instalação.
Service_role é uma identidade backend ampla que ignora RLS; o isolamento do lote
vem do plano aprovado e do destino fixo, e não de uma suposta RLS multi-tenant.

## Consistência e números financeiros

O helper de fonte é STABLE e usa UTC, lendo os IDs pela mesma fotografia do
comando. Ordena IDs canonicamente e inclui campos explícitos de run/observação;
colunas futuras não entram silenciosamente no formato. Resolve inline ou payload
canônico pelo helper existente. `normalizedJson` permanece texto JSON produzido
no PostgreSQL, preservando números que JavaScript Number não representa.

O envelope `proesc-v2-copy-v1` é preservado byte a byte: SHA-256 e tamanho são
calculados no banco e conferidos antes de comprimir. O worker não reserializa o
conteúdo financeiro. Uma mudança na fonte depois do plano impede a exportação
por divergência de hash; o operador precisa aprovar outro lote, sem sobrescrever.

O arquivo inclui referências de snapshot/link/task/run, não uma cópia integral
de todas essas tabelas. Portanto não é backup completo do financeiro nem prova
de que as linhas originais possam sair do banco.

O novo leitor entra no inventário estrito por assinatura e hash exatos, na mesma
transação do draft. O detector anterior permanece intacto; drift bloqueia essa
instalação e alterações posteriores do helper bloqueiam ON. As duas migrations
já aplicadas da fase de payload não foram modificadas.

## Recibo e falhas

O recibo liga batch, hash/tamanho/quantidade aprovados, destino completo e nomes
content-addressed dos dois objetos. Contém os hashes/tamanhos comprimidos e do
manifesto lógico separadamente. É copyOnly=true; não existe estado elegível para
remoção. Replay igual aceita; divergência recusa sem trocar o registro.

O worker só apresenta recibo após upload e readback dos objetos. SQL não consegue
provar por si só que esses bytes estão no Storage: a identidade backend e o
protocolo de verificação são parte da confiança. Falha parcial/ambígua permanece
não confirmada. Objetos não são apagados nem substituídos para recuperar falhas.
Se o recibo tiver sido gravado e a resposta se perder, replay idêntico é seguro.
Se a fonte mudar nesse intervalo, a nova exportação será recusada por drift;
o operador deve consultar o recibo pelo batch exato. Não criar outro plano nem
sobrescrever objetos para contornar um commit possivelmente concluído.

## Validação e próximos gates

Os testes locais usam SQL real isolado em PGlite e HTTP em memória, sem acesso à
conta. Cobrem fontes mistas, números exatos, escopo, limites, autorização, replay,
drift, imutabilidade e preservação das tabelas de origem. O harness PostgreSQL 17
inclui corridas de plano/recibo e mudança de fonte em sessões separadas, mas sua
nova versão depende da publicação autorizada e do CI no commit exato.

O atributo statement_timeout de uma função não é prova de limite efetivo em
chamada direta. Aplicar timeout antes do comando SQL e deadline no cliente/HTTP;
testar a propagação pela versão real do PostgREST antes de uso. Não executar
varreduras globais, compactação, VACUUM FULL ou jobs históricos nesta etapa.

Antes de um lote real: revisão e CI, refresh do catálogo/contratos, autorização
da instalação privada e dos dois RPCs, integração backend segura e autorização
do lote com IDs/unidade/dados/destino. Registrar o recibo após copy/readback verificados. A restauração é um gate
adicional antes de concluir o piloto; o recibo não afirma que ela ocorreu.
A restauração escreve arquivo separado, não aplica financeiro.

Copiar não libera espaço no banco. Storage/PITR têm ciclos de proteção distintos;
backup do banco não inclui bytes dos objetos. Prazo financeiro, backup dos
objetos, eventual elegibilidade e remoção exigem decisão separada.
