# Registro operacional: índice da fila Proesc V2

Data: 06/10/2026. Escopo documental de uma alteração já aplicada e validada.
Base: main `c5315f327f48429a3a09314215aadee01d8b3ef2`, versão 4.8.174.

## Objetivo e autorização

Registrar de forma reproduzível o índice mínimo autorizado para reduzir a
leitura repetitiva da fila Proesc V2. O responsável autorizou o índice e,
posteriormente, seu registro no projeto. A entrega documental é proposta em
PR draft, sem merge, nova operação Supabase ou deploy manual.

## Alteração já realizada

Em 06/10/2026, a resposta de sucesso do MCP Supabase foi observada às 12:43:30
UTC para CREATE INDEX CONCURRENTLY isolado, sem BEGIN, no projeto
`kfekgwyqozhicpfuunpo`:

- Índice `internal_proesc.proesc_v2_invoice_staged_task_id`.
- Tabela `internal_proesc.v2_invoice_observations`.
- B-tree não único em `(task_id, id)`, parcial `result = 'STAGED'`.
- Operação avulsa: não foi criada entrada no ledger de migrations.

As funções, COUNT/remaining, lote de 20, cron, RLS, privilégios, replay,
auditoria, regras financeiras e demais índices não foram alterados pelo DDL.
Não houve exclusão manual de dados ou execução de worker de teste.

## Aceite e evidência

- Catálogo independente às 12:44:49 UTC confirmou definição, predicado e
  flags valid/ready/live; índice não único.
- Planos sem ANALYZE e UUID fictício passaram a usar o índice para a seleção
  com FOR UPDATE e para COUNT, preservando a semântica das consultas.
- Em tráfego normal, leituras por chamada caíram de 16.317,83 para 39,925 na
  comparação registrada, redução observada de 99,755%.
- As janelas não têm carga idêntica; buffers PostgreSQL não são medição física
  de disco. Não se declara recuperação de orçamento de E/S com esses dados.

O [runbook operacional](../../../../docs/sistema/operacao/proesc-v2-indice-fila.md)
contém SQL, pré-verificação estrita, tratamento de estado já correto,
interrupção por drift/índice inválido, riscos e dados das janelas.

## Validação desta entrega documental

- Conferência de escopo: somente os dois Markdown do manifesto.
- Conferência de linhas, links internos e estrutura feita antes do commit.
- Revisão independente concluída, sem bloqueadores, para SQL, idempotência,
  links relativos e limites de medição dos dois arquivos do manifesto.
- CI do PR deve ser conferida no commit publicado; esta página não presume
  resultado de uma execução ainda não concluída.
- Build, lint global e testes SQL novos não foram executados localmente para
  este registro. Nenhum novo SQL de produção foi executado para validá-lo.
- Não foi alterado o lote ativo de outro trabalho, a configuração de qualidade,
  a memória canônica, a versão do produto ou qualquer migration existente.
- O ambiente desktop estava offline e não havia ambiente de código salvo;
  leituras e publicação de GitHub foram feitas pelo MCP autorizado.

## Riscos e pendências explícitas

- Não usar IF NOT EXISTS como prova de equivalência de índice.
- Não envolver CONCURRENTLY em transação e não recriar cegamente após timeout.
- Falha pode deixar índice inválido; não há DROP/REINDEX automático no runbook.
- A reconstrução em outros ambientes é assistida, não automática. Integração
  formal ao mecanismo de migrations permanece pendente, sem ledger fictício.
- Retenção V2 e validação de restauração pertencem a outra proposta. Nenhuma
  exclusão definitiva de evidência financeira está autorizada por este registro.

## Manifesto explícito

Total: 2 arquivos.

- `docs/sistema/operacao/proesc-v2-indice-fila.md`
- `ai/operacao/registros/alteracoes/2026-10-06-proesc-v2-indice-fila.md`
