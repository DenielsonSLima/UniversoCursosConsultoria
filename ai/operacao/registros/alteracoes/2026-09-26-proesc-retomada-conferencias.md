# Proesc: prazo de rede e retomada das conferências

## Pedido, autorização e aceite

Após revisar as correções publicadas em 4.8.92, o usuário autorizou corrigir os problemas encontrados em etapas, com cuidado. Este lote prepara a versão 4.8.93 e mantém V1 para o financeiro e V2 para dados dos alunos.

Aceite: a espera na fila não consumir o prazo individual de rede; uma consulta longa preservar páginas completas para a próxima execução; falhas, cancelamentos e evidência parcial nunca confirmarem elegibilidade. Preservar autorização, identidade, escopo, lease, cursor, idempotência e validade de cinco minutos. Não aumentar paralelismo diante de HTTP 429.

O lote trata transporte e conferência. Não constitui nova prova de pagamento, cancelamento ou estado aberto dos 78 recebíveis ainda em revisão, R$ 21.931,40 nominais, registrados no lote anterior.

## Reprodução e evidência

1. O cliente V1 iniciava o timeout antes de adquirir a fila compartilhada. Harness local com duas respostas saudáveis de 80ms e prazo individual de 120ms: ambas concluíam sem fila; com fila, a segunda expirava depois de aproximadamente 41ms de rede. A espera consumia o orçamento HTTP.
2. A revisão de ciclos precisava completar toda a janela na mesma execução. Harness com fonte sempre HTTP 200, 36 meses e prazo acelerado de 105s para 90ms: o leitor sequencial interrompia a coleta e a execução seguinte recomeçava no primeiro mês, sem cache completo nem registro de elegibilidade.

Harnesses temporários: `tmp/caixa-proesc/review-4892/queue-deadline.ts` e `cycle-deadline.ts`. Esses testes demonstram falhas possíveis com fonte saudável; não identificam sozinhos a causa exata do timeout da execução de produção das 02:08 UTC.

A execução natural de 26/09 às 02:40:03.909–02:40:27.683 UTC concluiu um lote com dois vínculos consultados, dois inalterados e zero aplicados. Quatro respostas HTTP 200: fevereiro 1.743ms, abril 8.643ms, setembro 5.425ms e agosto 6.964ms. O contador de falhas consecutivas voltou a zero. Isso comprova aquele lote, sem demonstrar normalização sustentada nem eliminar os defeitos reproduzidos.

## Correção preparada

### Prazo individual de rede

O transporte coordenado oferece um callback privado de despacho. O cliente inicia seus 12s somente depois de adquirir a vez, imediatamente antes do fetch. O prazo continua cobrindo headers e corpo; o AbortSignal global permanece ativo durante fila e leitura. Fetch comum e transportes coordenados compostos continuam aceitos.

A fila segue limitada a uma resposta em andamento até EOF ou cancelamento do corpo, compartilhada entre sincronização e revisão de ciclos em cada `internal_sync`. Não há promessa de exclusão distribuída entre instâncias nem pausa baseada em uma cota suposta do provedor. HTTP 429 e demais erros relevantes preservam a interrupção das novas saídas naquela execução.

### Páginas retomáveis

Nova RPC `proesc_cycle_review_pages_service` oferece `read` e `append` somente após autorização e validação do cache, lease, unidade, janela, turmas e revisão da credencial. A tabela interna tem RLS e não concede acesso direto a clientes ou ao papel service_role; a RPC pública é restrita ao serviço e mantém a autorização do operador.

Cada página preserva todas as linhas e duplicidades. A projeção contém dez campos: chave, indicador de principal, centavos, turma, hash da pessoa, vencimento, criação, cancelamento, renegociação e indicador de inconsistência. CPF bruto, nomes, token e payload integral do provedor não são persistidos. A normalização de obrigações ocorre somente depois da montagem da janela inteira, preservando conflitos entre meses e os bloqueios de identidade.

O armazenamento é compartilhado por revisão da credencial, unidade e período, sem duplicar páginas para cada matrícula. Limites: menos de 20.000 linhas e 2MB de JSON canônico por página, 256 páginas e 8MB de conteúdo no conjunto; cada contexto continua limitado a 72 meses. O limite de conteúdo não equivale ao tamanho físico da tabela e dos índices. Uma trava de quota serializa gravação e limpeza de páginas vencidas ou de credencial anterior. O parser Edge admite 8,1MB na resposta para acomodar os metadados sem ampliar a quota de conteúdo.

`read` e `append` devolvem hashes calculados no servidor. `complete` envia `resumeVersion: 1` e o manifesto de hashes; o banco confere cobertura integral, ausência de lacunas e correspondência com as páginas usadas. Mudança concorrente de conteúdo é rejeitada. O instante final é o menor `observedAt` real, nunca a hora de montagem ou retomada. Evidência vencida é recolhida novamente; o contrato legado permanece compatível durante a ordem de implantação.

A coleta interrompe novas leituras ao atingir o orçamento suave de 75s, libera o lease do cache e preserva as páginas completas. O prazo global de 105s do worker permanece. Grupos menores com cobertura integral já salva podem concluir depois do orçamento suave sem iniciar outro GET; uma janela grande pendente não bloqueia automaticamente toda a revisão.

O resultado diferencia `pending`, `progressiveCount` e `sourceFailed`. Progresso persistido com pendência e sem falha de fonte permite continuação no próximo cron de dois minutos. Falha de fonte mantém backoff de 15 minutos, inclusive quando outro grupo já foi revisado. Conflitos permanentes de concessão/validade do mesmo fluxo passam a PT409, evitando tratá-los como falhas de serialização retentáveis.

## Manifesto explícito

Total: 26 arquivos. O histórico deslocado do changelog permanece versionado, preservando seu conteúdo e o teto de linhas.

- `supabase/functions/proesc-api/v1-client.ts`
- `supabase/functions/proesc-api/v1-paced-transport.ts`
- `supabase/functions/proesc-api/v1-paced-transport.test.ts`
- `supabase/functions/proesc-api/v1-queue-deadline.test.ts`
- `supabase/functions/proesc-api/cycle-page-evidence.ts`
- `supabase/functions/proesc-api/cycle-review-pages.ts`
- `supabase/functions/proesc-api/cycle-schedule-source.ts`
- `supabase/functions/proesc-api/cycle-review.ts`
- `supabase/functions/proesc-api/cycle-review-batch.ts`
- `supabase/functions/proesc-api/cycle-page-evidence.test.ts`
- `supabase/functions/proesc-api/cycle-review-resume.test.ts`
- `supabase/functions/proesc-api/cycle-review.test.ts`
- `supabase/functions/proesc-api/cycle-review-batch.test.ts`
- `supabase/functions/proesc-api/cycle-review-abort.test.ts`
- `supabase/functions/proesc-api/handler-sync-coordination.test.ts`
- `supabase/migrations/20260926113042_validate_resumed_proesc_cycles_rollback.sql`
- `supabase/migrations/20260926113107_resume_proesc_cycle_pages.sql`
- `supabase/migrations/20260926113109_verify_resumed_proesc_cycles.sql`
- `supabase/tests/proesc_cycle_pages.transaction.sql`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-proesc-retomada-conferencias.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Os identificadores acompanham o ledger aplicado: `20260926113042` registra o ensaio revertido, preservado como fonte comentada sem efeito; `20260926113107` cria as páginas retomáveis e `20260926113109` reforça conclusão e continuidade. Os corpos aplicados permanecem imutáveis. Harnesses, saídas de testes e pacotes temporários não integram o manifesto.

A publicação 4.8.93 reúne este manifesto ao [registro de recuperação de espaço técnico](2026-09-26-recuperacao-espaco-tecnico.md), pré-requisito da quota temporária. São 30 caminhos distintos: 26 do produto e quatro exclusivos da manutenção, com o cadastro de manifestos compartilhado. As evidências e os comandos operacionais continuam separados; a publicação não reexecuta o VACUUM nem o ensaio revertido.

## Validação local

- 100 testes integrados do fluxo afetado aprovados: cliente/fila, ciclo, handler, sincronizador, escala, orçamento de períodos e observação financeira.
- Dentro desse conjunto, 30 testes cobrem os arquivos de ciclo afetados; 12 são novos. Demonstram retomada em duas invocações, três páginas mais nove sem repetição, nenhuma classificação parcial, validade e MIN, hashes/identidade inválidos, abort após body, falha HTTP 429 com progresso preservado e conclusão de janela menor após yield da maior.
- A regressão de fila falhou antes da correção e passou depois, preservando também deadline global, corpo e cancelamento.
- Revisão independente comparou o normalizador anterior, transcrito do corpo lido antes da edição, e o novo em 200 casos sintéticos determinísticos, 7.200 linhas, sem divergência. Foram exercitados cancelamentos, flags nulas, identidades ausentes/conflitantes, duplicidades e valores negativos.
- ESLint dos arquivos de implementação/teste próprios e typecheck do handler aprovados. Os arquivos novos permanecem abaixo do teto de 500 linhas.
- Ensaio SQL via MCP: 36 verificações aprovadas com ROLLBACK e fingerprint preservado, incluindo autorização, limite de linhas, replay, credencial/contexto/lease, cobertura, hashes, validade, MIN, aborto/retomada e backoffs.
- Build de produção e validação do registro de versão 4.8.93 aprovados.

Saída regenerável: `tmp/caixa-proesc/validation-4.8.93.log`. A suíte SQL transacional também foi revisada independentemente quanto a fixture, guardas, ausência de operações financeiras e rollback. O smoke real de retomada da Edge v25 permanece pendente; os testes não o substituem.

Comando de integração executado:

```sh
deno test --allow-env \
  supabase/functions/proesc-api/cycle-page-evidence.test.ts \
  supabase/functions/proesc-api/cycle-review-resume.test.ts \
  supabase/functions/proesc-api/cycle-review.test.ts \
  supabase/functions/proesc-api/cycle-review-batch.test.ts \
  supabase/functions/proesc-api/cycle-review-abort.test.ts \
  supabase/functions/proesc-api/handler-sync-coordination.test.ts \
  supabase/functions/proesc-api/v1-client.test.ts \
  supabase/functions/proesc-api/v1-paced-transport.test.ts \
  supabase/functions/proesc-api/v1-queue-deadline.test.ts \
  supabase/functions/proesc-api/handler.test.ts \
  supabase/functions/proesc-api/sync-worker.test.ts \
  supabase/functions/proesc-api/sync-worker.scale.test.ts \
  supabase/functions/proesc-api/sync-worker-rate-limit.test.ts \
  supabase/functions/proesc-api/sync-worker-period-budget.test.ts \
  supabase/functions/proesc-api/sync-observation.test.ts
```

## Implantação e pendências

A manutenção criou a margem operacional registrada em 486.887.601 bytes para a soma dos bancos antes do armazenamento retomável. Após o ensaio revertido, as migrations `20260926113107` e `20260926113109` foram aplicadas e conferidas. A Edge `proesc-api` v25 está ACTIVE desde 26/09/2026 às 11:32:22 UTC, com 29 arquivos lidos de volta e coincidentes com o pacote implantado. SHA-256 do pacote: `97489d72e8bae71b47dc679fd25bcb964501cd3c137b5a23f67561498b74e397`.

Smoke pendente: respeitar o próximo disparo elegível e o backoff, verificar progresso persistido, retomada sem releitura indevida, cobertura/hashes, encerramento do lease e manutenção da ausência de escrita financeira parcial. Uma execução bem-sucedida não será descrita como normalização sustentada.

A retomada preserva trabalho, mas não relaxa os cinco minutos de validade. Se a leitura sequencial mais os intervalos entre execuções excederem essa janela, a evidência continuará pendente e partes vencidas precisarão ser consultadas de novo. Limites de armazenamento também falham sem truncar linhas. Backend e ensaio SQL estão concluídos; publicação GitHub da versão 4.8.93 e smoke real de retomada ainda não estão registrados como concluídos neste documento.
