> Atualização 22h45 UTC: instalação OFF e validação autorizadas foram concluídas.
> Este documento conserva o diagnóstico e o plano anteriores; resultado em [INSTALLATION.md](./INSTALLATION.md).

# Preflight somente leitura e candidato de instalação OFF

Catálogo consultado em 09/10/2026, entre 22h17 e 22h21 UTC, exclusivamente por MCP.
Nenhuma execução das funções financeiras, leitura de payload, dados pessoais,
alteração de schema, consulta de runs/tasks ou repetição do agregado cancelado.

## Estado encontrado

- PostgreSQL 17.6; pgcrypto 1.3 em extensions; operador do MCP: postgres.
- 1.288 migrations registradas; última observada 20261009200452,
  turma_student_statement_gateway_projection. Revalidar antes de implantar.
- Não existem payload table, control table ou função de ativação: sem instalação parcial.
- Dez assinaturas de leitores/escritor revisadas mantêm os hashes esperados.
- Observações têm normalized JSONB NOT NULL, 13 colunas e cinco índices válidos.
- FK de confirmação de pagamento aponta para observation_id. FKs de run, task,
  link e snapshot existem e estão validadas.
- Observações, snapshots e confirmações são postgres-owned, com RLS ativa e ACL
  apenas postgres. Não há policy, view/rule ou trigger customizado em observações.

## Bloqueio detectado e correção

O catálogo contém mais um leitor: public.get_caixa_review_pending_page_secure
(uuid,date,text,integer,integer), MD5 do corpo 2e99bb1426b9f2d3a2a2683c1156de74.
Consulta apenas source_status, snapshot_id, invoice_id e horários/ID para classificar
pendências. Não lê normalized ou o hash completo da observação.

RC.1 recusaria a instalação ou ativação por esse leitor desconhecido. RC.2 cadastra
somente a assinatura exata e o hash nos dois inventários, sem reescrever o leitor.
Não amplia a allowlist por nome, schema ou padrão; drift posterior continua negado.

Teste do corpo real e authorizer real cobre JSON completo nas representações
legada, legada após instalação, mista e canônica; motivos, totais, ordenação,
paginação, source ausente, filtros inválidos, perfis e escopo de polo/global.
Conserva SECURITY DEFINER, owner, search_path e ACL; anon é recusado.
Os helpers de decisão de permissão e position rows são stubs sintéticos declarados.
Isso não equivale à reprodução integral de todos os perfis de produção.

## Estrutura e efeitos laterais reproduzidos

A fixture aplica RLS/ACL observadas das três tabelas privadas e os cinco índices
de observações. Os três corpos reais de triggers dos snapshots foram incluídos:

- invalidate_settled_polling: mantém a invalidação após INSERT.
- guard_compacted_snapshot_keeper: protege evidência já compartilhada.
- guard_packed_item_keeper: protege evidência referenciada por itens compactados.

Hashes dos triggers são conferidos. Tabelas dependentes recebem somente linhas
sintéticas mínimas. O teste verifica invalidação e recusa de UPDATE do keeper.
A cadeia extensa de triggers de contas_receber não foi clonada integralmente;
permanece necessária uma revisão proporcional desse limite antes da implantação.
Não alterar ou desabilitar esses triggers para fazer um teste passar.

O ensaio PG17 acrescenta corrida real entre commit de página e OFF: consulta
pg_blocking_pids, comprova que o modo não muda antes do commit e preserva a linha
canônica gravada. Também verifica rejeição de ON com run em andamento e ON→OFF
após término. A chave continua global, sem canário por unidade.

## Plano anterior à instalação (OFF e validação concluídos depois)

1. Conferir CI do SHA RC.3 e preflight atual; PASS de revisão anterior não basta.
2. Migration preparada: 20261009224423_prepare_proesc_v2_payload_storage_off.sql,
   com 462 linhas e transação única. Nenhuma aplicação foi executada.
   Os testes verificam igualdade com as quatro fases, rollback inclusive após
   adaptação de leitores e hashes legados preservados, sem janela intermediária.
3. PG17 executa o arquivo real e afirma OFF antes da validação/ativação sintética.
   Revalidar catálogo/migrations imediatamente antes da instalação autorizada.
4. Obter autorização específica para instalação OFF. DDL tem lock_timeout de 3s;
   se não adquirir o lock, abortar e reagendar, sem encerrar sessões de usuários.
5. Validar FK/XOR em janela autorizada: lê histórico, embora não faça backfill.
6. Pedir ON separadamente, em run ocioso; observar execução natural e FULL/RECENT,
   completude/evidência/erros/latência. OFF reverte novas escritas, não remove dados.
7. Medir carga representativa e delta WAL OFF/ON antes de alegar economia de IO.
   A janela inicial de 2.552 bytes prova somente o cenário isolado executado.

Integração com Storage, retenção financeira e exclusão não estão autorizadas nem
implementadas. O protótipo de arquivo continua local, sintético e sem cleanup.

## Segurança da publicação do arquivo

Workflows do repositório, package scripts e vercel.json foram lidos antes da
promoção. Não contêm aplicação de migrations ou deploy de banco; pipelines
executam testes/build e o job novo só usa banco descartável sem segredos.
A listagem de branches Supabase estava vazia. Não foi chamada apply_migration,
merge_branch ou qualquer operação de escrita no banco de produção.

## Proposta original de instalação OFF

Aplicar uma única migration pelo MCP, usando exatamente o arquivo aprovado.
Confirmar atomicidade/registro remoto, hashes/ACL, singleton false, novas tabelas
vazias e constraints NOT VALID. Não executar ON como parte da instalação.
Validar as duas constraints em etapa própria autorizada; há leitura do histórico
com custo de IO, embora sem backfill ou remoção. Não prometer execução sem custo.
Se houver drift ou timeout de lock, interromper e investigar; não forçar acesso,
encerrar sessões, desabilitar triggers ou afrouxar guards para concluir.
