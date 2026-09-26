# Recuperação de espaço técnico — 26/09/2026

Estado: MANUTENÇÃO APLICADA NO SUPABASE; publicação GitHub pendente. Índice redundante removido e VACUUM FULL nativo concluído. A proposta alternativa de TRUNCATE não foi executada e está fora do manifesto.

## Objetivo e escopo

Criar margem física no banco removendo um índice redundante de observações Proesc e recuperando a alocação ociosa do histórico cron pelo VACUUM nativo. Nenhum registro foi excluído manualmente; estados financeiros, retenção, agendamento, funções, RLS e permissões foram preservados. A continuidade operacional exige acompanhar o crescimento: esta etapa não resolve a capacidade de longo prazo.

## Evidência e alteração

- O índice `internal_proesc.proesc_observations_feed_time_idx` ocupava 2.613.248 bytes. Suas chaves `observed_at DESC, id DESC` já estão cobertas por `proesc_monitor_observations_cover_idx`, que acrescenta `INCLUDE(link_id,verification)`.
- Catálogo conferido: mesmas opclasses, collations, direções e predicado ausente; ambos válidos/ready/live, sem PK, unique, constraint, replica identity, cluster ou dependência de entrada do índice removido.
- Migration com espera por lock limitada a 2 s e bloco limitado a 10 s. Verifica definições e dependências antes do DROP RESTRICT; compara os planos do feed e da contagem antes/depois, exigindo Index Only Scan pelo índice preservado, sem Seq Scan/Sort, mesmas linhas estimadas e custo até 125% do anterior.
- Qualquer divergência provoca rollback da operação. Metadados da tabela, colunas, políticas e índice preservado são conferidos antes do COMMIT.
- EXPLAIN não executa os SELECTs: comprova escolha de plano e custo estimado, não latência real.

## Validação e aplicação

- Revisão independente aprovada para a alternativa do índice; não equivale a autorização para TRUNCATE ou outro método de compactação.
- Coordenador executou ensaio transacional com ROLLBACK via MCP Supabase. O provedor registrou `validate_redundant_observation_index_rollback` no ledger `20260926112459`; nenhum DROP persistiu nesse ensaio. Uma fonte somente comentada preserva esse resultado sem efeito no encadeamento de migrations.
- Aplicação via MCP em 26/09/2026 às 11:25Z, ledger `20260926112510`, nome `drop_redundant_proesc_observation_index`.
- A fonte foi renomeada para o prefixo aplicado, sem alteração de conteúdo. SHA-256: `2421f7ceb563d0fdf2c7c5369c3030d6ff16f4122cf329f18c4ba4d30184c723`.
- Pós-checagem do índice: índice ausente e soma dos bancos em 497.496.241 bytes; `cron.job_run_details` ainda em 36.798.464 bytes naquele momento.

## Compactação nativa do histórico cron

- Após revisão do método e da folga física, o coordenador executou via MCP `execute_sql`, como comando isolado, `VACUUM (FULL, ANALYZE, SKIP_LOCKED) cron.job_run_details;`. Conclusão em 26/09 às 11:28:30Z, duração de 4,7 s.
- Antes: 60.975 linhas, 10.853 falhas, corte `runid <= 382785`, OID da tabela 23075 e `last_value` da sequência 382785. Relação com 36.798.464 bytes.
- Após: contagem, falhas, hash integral no mesmo corte, OID e sequência idênticos. Hash SHA-256 antes/depois: `08115570b80de92f31ff4318753689db9437828a01ba8ba0452948f5efc39ad2`.
- A relação passou para 26.189.824 bytes: **10.608.640 bytes recuperados fisicamente**. A soma dos bancos passou para **486.887.601 bytes**, margem aritmética de **13.112.399 bytes** para 500 MB.
- Foi utilizado o mecanismo nativo de manutenção; não houve TRUNCATE, cópia/reinserção manual ou alteração da política de retenção. O arquivo operacional preserva o comando realmente executado fora da pasta de migrations; não deve ser reexecutado pela publicação.

## Manifesto explícito

- `supabase/migrations/20260926112459_validate_redundant_observation_index_rollback.sql`
- `supabase/migrations/20260926112510_drop_redundant_proesc_observation_index.sql`
- `supabase/maintenance/20260926112830_vacuum_cron_history.sql`
- `ai/operacao/registros/alteracoes/2026-09-26-recuperacao-espaco-tecnico.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json` — entrada composta pelo coordenador.

Total: 5 arquivos. Sem alteração de versão nesta entrega operacional. As duas entradas do ledger e o comando executado permanecem como fontes imutáveis da manutenção.

## Pendências e limites

- A proposta de TRUNCATE/cópia/reinserção do cron e suas fixtures não foram aplicadas; foram movidas para `tmp/propostas-nao-aplicadas/`. Não ficam como migration pendente nem pertencem à publicação.
- O VACUUM comum anterior está documentado em [redução de chamadas ociosas](2026-09-25-reducao-chamadas-ociosas.md): opção `SKIP_LOCKED`, conclusão em 26/09 às 00:49:43Z, hash dos 53.571 registros concluídos preservado e nenhuma redução física comprovada. O SQL literal completo não foi preservado nos artefatos locais consultados; não presumir outras opções.
- Não houve nova consulta de logs/analytics nesta preparação. Log Query, ingestão de logs e armazenamento do banco são métricas distintas; a remoção do índice não reduz o Log Query acumulado.
- A recuperação do cron foi medida; a margem final de 13,11 MB continua limitada. Não prometer permanência abaixo de 500 MB, pois o crescimento operacional e os recursos temporários continuam consumindo espaço.
