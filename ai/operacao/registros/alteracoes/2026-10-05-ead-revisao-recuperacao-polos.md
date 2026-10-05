# Revisão independente do ciclo EAD — versão 4.8.169

## Pedido e escopo

O usuário pediu revisão com três agentes. As frentes foram contrato bancário,
ciclo de compra/acesso e consistência financeira. A autorização anterior para
aplicar e atualizar o projeto continua vigente. Execução interna, sem navegador.

O escopo parte da versão 4.8.168 publicada no main `e10a1d73185bd48b2a8daba0d3ea2493b0226e77`.
Dois problemas reproduzidos foram corrigidos e revisados independentemente.

## Achados e correções

- P2: ACTION sempre precedia OBSERVE. Seis revisões retriáveis mantiveram
  120 chamadas na primeira faixa; um pagamento tardio permaneceu CANCELADO.
  O controle OBSERVE recuperou o mesmo título para PAGO sem PUT.
  A prioridade agora alterna por minuto UTC; uma faixa vazia cede o lugar.
  Cada chamada continua processando no máximo um título. O ensaio integrado
  corrigido dividiu 120 chamadas em 60 ACTION/60 OBSERVE, recuperou PAGO e
  efetuou zero PUT. Nenhuma mudança na fila de conciliação normal.
- P1: o frontend envia polo NULL à lista de revisões. A guarda anterior exigia
  gestor global e negava 42501 ao gestor local, embora os dois filtros de linha
  já limitassem seus polos. NULL agora lista somente polos autorizados,
  exigindo autenticação, módulo financeiro e aba receber; permissões false
  ou NULL falham fechadas. Polo explícito mantém a guarda canônica.
  OID, metadados, ACL e ambos os filtros de linha foram preservados.
- A resolução de devolução foi revisada sem alteração: nova operação exige
  autorização atual; replay autorizado retorna a resolução existente sem
  nova mutação ou evento. Revogação do módulo/polo continua bloqueando.

## Manifesto explícito

- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration-handler.ts`
- `supabase/functions/banese-reconciliation-worker/ead-checkout-expiration-handler.test.ts`
- `supabase/migrations/20261005031239_scope_ead_payment_review_reader.sql`
- `supabase/tests/ead_payment_review_scope.isolated.test.mjs`
- `docs/contracts/ead-compra-opcional-expiracao.md`
- `.github/workflows/ead-checkout-lifecycle.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-05-ead-revisao-recuperacao-polos.md`

Total: 10 arquivos.

## Validação

- 57 testes Deno dos contratos bancários e handler passaram com typecheck.
- Revisor independente confirmou 23 testes relacionados e o ensaio integrado
  de 120 chamadas com handler, processador e RPCs reais em PostgreSQL/WASM.
- Harness de escopo passou antes/depois da correção, com duas origens e polos,
  permissões revogadas/NULL, polo estrangeiro, aluno sem acesso e devolução.
- Migration nova aplicada pelo MCP e registrada como 20261005031239.
  Metadados e privilégios reais antes/depois são idênticos.
- Entry point do artifact dedicado passou em `deno check`.
- Worker dedicado ACTIVE versão 2. Comparação dos 50 arquivos retornados pelo
  MCP confirmou alteração somente no handler; autenticação customizada mantida.
- CI inclui o novo harness de escopo. Publicação usa somente o manifesto acima;
  versão, changelog e registro de manifestos são compostos sobre o main remoto,
  sem sobrescrever alterações locais paralelas.
- Testes sintéticos e interleavings não equivalem a duas sessões PostgreSQL
  concorrentes. Nenhum aluno ou pagamento real foi usado como fixture.
- Não houve smoke visual/autenticado por determinação do usuário de não usar
  navegador. Evidências diretas são SQL, artifact, cron, testes e CI.

## Conferência operacional

A configuração de produção continua limitada à Matriz/Japoatã, com calendário
verificado de 2026; sandbox desligado. A margem de três dias bancários completos
e os bloqueios por pagamento/processamento permanecem.

Após implantar a correção, o título original de R$ 99,90 permaneceu PENDENTE,
compra opcional, matrícula PENDENTE e inscrição AGUARDANDO_PAGAMENTO.
Fingerprint econômico `f7f42d34a2501c1271dfe6dc545883e7` preservado.
O primeiro cancelamento elegível continua em 09/10/2026. A consulta canônica
do Caixa retornou vencido e margem de inadimplência iguais a zero.

A revisão inicial confirmou três cancelamentos anteriores DONE com situação
bancária 5 e nenhum pagamento efetivado. Nenhum cancelamento manual foi
solicitado nesta revisão. A confirmação final de publicação/cron fica
disponível no PR, nos checks e nos registros dos serviços.
