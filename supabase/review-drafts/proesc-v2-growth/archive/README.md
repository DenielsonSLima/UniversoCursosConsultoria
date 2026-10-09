# Arquivo offline de histórico Proesc: ensaio sintético

Este módulo é um rascunho local de `archive -> verify -> restore`, implementado
com Node 24 e bibliotecas nativas. Não é um cliente Supabase, uma migration ou
uma rotina pronta para produção. Não busca dados, acessa rede, recebe credenciais,
cria buckets, altera banco ou exclui arquivos/registros. A marca
`syntheticOnly: true` é uma declaração obrigatória do chamador, não um detector
automático de dados pessoais: somente fixtures inventadas podem ser usadas aqui.

## Executar os testes

A partir da raiz deste pacote local:

```sh
node --test supabase/review-drafts/proesc-v2-growth/archive/archive.test.mjs
```

Os testes criam diretórios temporários com prefixo `proesc-synthetic-archive-`.
Corrupção intencional e arquivos interrompidos existem somente nessas fixtures.
Não há limpeza automática desses diretórios, nem dependências novas.

## Contrato implementado

- `createLocalStore(directory)`: adapter filesystem exclusivo para o ensaio.
- `archiveSyntheticRecords(store, context, records, limits?)`: ordena uma cópia
  dos registros por ID, serializa JSONL determinístico e comprime com gzip.
- `verifySyntheticArchive(store, descriptor, limits?)`: verifica integralmente
  manifesto, hashes, tamanho, contagem, ordem, IDs únicos, escopo e descompressão.
- `restoreSyntheticArchive(source, descriptor, destination, filename, limits?)`:
  verifica antes de gravar JSONL em outro diretório; nunca importa para banco.

O contexto contém somente `syntheticOnly`, `tenantId`, `archiveId`, `sourceKind`,
`normalizationVersion`, `cutoff` e `createdAt`. Datas devem usar ISO UTC com
milissegundos. Cada registro contém `syntheticOnly`, `id`, `tenantId`, `runId`,
`kind` e `payload`. Valores monetários das fixtures permanecem strings decimais;
este módulo não calcula, converte ou reconcilia valores financeiros.

O manifesto registra versão do formato/normalização, tenant, origem, período de
corte, primeira/última identidade, hash do conjunto ordenado de IDs, contagem,
tamanhos antes/depois da compressão e SHA-256 de ambos os conteúdos.
`cutoff` documenta um corte informado; não seleciona nem prova elegibilidade.

O objeto de dados é escrito com criação exclusiva e sincronizado. Em seguida,
ele é lido e descomprimido para comparação. Somente então o manifesto é gravado.
O descritor devolvido contém o hash esperado do manifesto e precisa ser guardado
por um catálogo confiável. SHA-256 verifica integridade; não substitui
autorização, assinatura autenticada ou custódia confiável desse descritor.

Retries idênticos reutilizam bytes idênticos; divergências não sobrescrevem
objetos. Falha parcial deixa um objeto órfão ou interrompido, sem manifesto
válido. Uma futura rotina separada precisaria tratar órfãos; este módulo não os
apaga. Concorrência pode exigir retry depois que o escritor anterior concluir.
Não se promete atomicidade distribuída, durabilidade a falha da máquina ou
transação conjunta entre banco e Storage.

Limites padrão por lote: 5.000 registros, 16 MiB descomprimidos e 8 MiB
comprimidos. São limites do ensaio, não limites Supabase nem valores homologados
para produção. A API carrega um lote em memória; uma implementação real precisa
paginação/streaming, orçamento de CPU/memória, backpressure e testes de carga.

## Alternativa futura: aproveitar Storage privado

Se os “100 GB” mencionados forem Supabase Storage no Pro/Team, a franquia de
arquivos é por organização e separada dos 8 GB de disco do banco por projeto.
Isso não confirma o plano real nem o espaço livre atual. O uso e a franquia
compartilhada precisam ser verificados antes de dimensionar o arquivo.

Uma integração futura pode guardar lotes JSONL/gzip imutáveis em bucket privado,
por tenant, período e identidade do conteúdo, mantendo apenas catálogo e estado
operacional no banco. Agrupar registros evita um objeto/metadado por invoice.
Não reexportar todo o histórico em cada cron, não comprimir dentro de transação
SQL e não manter duas cópias pesadas no banco como suposta economia.

O adapter remoto ainda não existe. Ele exigirá autorização do destino/dados,
acesso mínimo por tenant, teste de RLS, sem acesso público nem credenciais no
cliente, chaves imutáveis e publicação consistente do catálogo após verificação.
Arquivos acima de 6 MB devem considerar upload resumível, conforme recomendação
oficial; o limite efetivo por arquivo depende da configuração global e do bucket.
Não aumentar limites ou criar credenciais como efeito colateral da implantação.

Backups/PITR do banco incluem metadados de Storage, não os arquivos. O arquivo
precisa de preservação própria, verificação periódica e restauração comprovada.
Se uma segunda cópia independente for necessária, destino e autorização são
decisões separadas. Este ensaio não implementa backup de produção.

Preço consultado em 2026-10-09: Pro/Team incluem 100 GB de Storage; excedente de
US$ 0,0213/GB-mês, medido por GB-hora. Exportação e restauração podem consumir
egress da organização; portanto, não há promessa de custo zero. A estimativa
de economia exige medir compressão real e frequência de leitura, sem extrapolar
resultados pequenos das fixtures para todo o banco.

## Portão obrigatório antes de qualquer retenção

1. Impedir novas cópias semanticamente redundantes e preservar o histórico de
   observações/proveniência exigido pelo produto.
2. Mapear todos os leitores e referências a payloads, snapshots e runs. A fase
   atual de payload compartilhado permanece inteiramente no Postgres; este
   ensaio não torna seguro remover suas referências ou normalizados.
3. Gerar dry-run com IDs exatos, motivos e âncoras protegidas. Excluir da lista
   observação vigente, FULL íntegro necessário, runs ativos/incompletos, provas
   financeiras, comprovantes e qualquer referência incerta. RECENT não prova
   ausência definitiva de uma entidade. Prazo de guarda não é decidido aqui.
4. Verificar exportação completa, restauração em ambiente isolado, equivalência
   financeira e política de preservação dos objetos.
5. Obter autorização específica antes de qualquer limpeza. Revalidar referências
   no momento de cada lote; execução curta e retomável, limitada por tempo/bytes,
   sem scans integrais repetidos nem OFFSET crescente.

O resultado sempre informa `cleanupEnabled: false`; não existe função de
exclusão ou ativação de limpeza. DELETE futuro gera WAL e versões mortas;
VACUUM comum permite principalmente reutilização. Nem ele nem a exportação
diminuem automaticamente os 8 GB provisionados. VACUUM FULL não faz parte deste
plano: requer bloqueio forte e espaço temporário.

## Medição futura sem amplificar consumo

- Separar disco provisionado, ocupação Database/WAL/System e IOPS da plataforma.
- `pg_database_size` e tamanhos de relações não equivalem à ocupação total do
  volume. `pg_table_size` já inclui TOAST/auxiliares; evitar soma duplicada.
- Por run: entidades vistas/alteradas, payloads inseridos/reusados, snapshots
  criados/reusados, duração e bytes serializados, sem chamar estes bytes físicos.
- Delta global de relações/WAL em janela concorrente não pertence exclusivamente
  ao run; medir atribuição em ensaio isolado e guardar instante/reset de counters.
- Não fazer COUNT/SUM(payload) do histórico a cada cron. A própria telemetria deve
  ter volume limitado e retenção planejada.
- Aceitar a solução quando replay idêntico não duplica payload pesado, mudança
  real continua rastreável, estado financeiro permanece igual e escrita por run
  diminui sem piorar latência, locks ou autovacuum. Alertas/rotinas não foram criados.

## Fontes oficiais

- [Franquias e cobrança por organização](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Cobrança atual de Storage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
- [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Limites de arquivo](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Upload padrão e resumível](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Escopo dos backups](https://supabase.com/docs/guides/platform/backups)
- [Banco e disco](https://supabase.com/docs/guides/platform/database-size)
- [VACUUM no PostgreSQL 17](https://www.postgresql.org/docs/17/routine-vacuuming.html)
- [Estatísticas cumulativas no PostgreSQL 17](https://www.postgresql.org/docs/17/monitoring-stats.html)
- [Funções de tamanho no PostgreSQL 17](https://www.postgresql.org/docs/17/functions-admin.html)
