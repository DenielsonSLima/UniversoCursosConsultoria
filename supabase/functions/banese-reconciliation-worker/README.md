# Banese reconciliation worker

Worker interno e exclusivo do Banese para consultar a API de boletos em lotes
pequenos. O agendamento ocorre no Postgres a cada minuto.

- A funcao nao aceita JWT de usuario nem dados de boleto no corpo.
- A autenticacao usa um segredo aleatorio armazenado no Vault.
- Os recebiveis sao reservados no banco por uma RPC atomica com `SKIP LOCKED`.
- Sem titulo elegivel, o worker retorna `NO_CLAIMABLE_TITLES` sem criar
  registros vazios de execucao ou de auditoria financeira.
- `CodigoSituacaoBoleto = 3` inicia a conciliacao de pagamento; os detalhes em
  `PagamentosEfetivados` confirmam data e valor antes da baixa local.
- Divergencias preservam a cobranca e sao repetidas em uma execucao posterior.
