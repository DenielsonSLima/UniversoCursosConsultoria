# Caixa: evidência explícita de cobranças Proesc V2

Estado: IMPLEMENTADO LOCALMENTE — RASCUNHO, SEM DEPLOY E SEM REPROCESSAMENTO.

## Problema confirmado

Consulta agregada remota identificou 2.624 vínculos cujo último snapshot é UNKNOWN/REVIEW, todos com NO_PAYMENT_IN_OBSERVED_PERIODS. O coletor V1 não produzia OPEN. O Caixa exige prova explícita para incluir obrigações abertas. A ausência de baixa em recortes mensais não permite concluir inadimplência.

## Alteração

- V2 invoices complementa somente observações V1 cuja única lacuna é ausência de pagamento.
- Leitura completa por unidade/mês, com paginação, concorrência máxima de três consultas e orçamento de 35 segundos subordinado ao prazo do worker.
- Prova OPEN exige situação EM ABERTO/VENCIDO, valor pago explicitamente zero, ausência explícita de data de pagamento e concordância de identificador, CPF normalizado por hash, turma, vencimento e principal com o vínculo V1.
- O snapshot é registrado na RPC canônica API_OPEN_OBLIGATION. Não há baixa, recibo ou reabertura automática de título pago.
- Falha V2, ausência da parcela e consulta V2 incompleta preservam o snapshot anterior quando V1 só não encontrou pagamento; resposta V1 totalmente vazia também o preserva. Outras divergências V1 ou conflito explícito V2 registram REVIEW. A tentativa sem snapshot fica no ledger sem simular snapshot consultado.
- Teste de conexão passa a verificar pessoas e cobranças, sem retornar dados pessoais ou credenciais.
- Nenhuma alteração no frontend, na fórmula do Caixa ou em migrations aplicadas.

## Manifesto explícito

- `supabase/functions/proesc-api/contract.ts`
- `supabase/functions/proesc-api/v2-client.ts`
- `supabase/functions/proesc-api/invoice-evidence.ts`
- `supabase/functions/proesc-api/invoice-evidence.test.ts`
- `supabase/functions/proesc-api/invoice-observation.ts`
- `supabase/functions/proesc-api/invoice-observation.test.ts`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-api/sync-worker.invoices.test.ts`
- `supabase/functions/proesc-api/test-token.ts`
- `supabase/functions/proesc-api/test-token.test.ts`
- `supabase/functions/proesc-api/versioned-connections.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-22-caixa-evidencia-financeira-v2.md`

Total: 14 arquivos.

## Validação executada

- 46 testes passaram: contrato, coleta V2, resolução de evidência, worker, escala/aborto, teste de conexão e isolamento de versões.
- Testes TypeScript executados em Node 24 com transformação de tipos e harness temporário de Deno.test; Deno não está disponível neste ambiente.
- Checagem TypeScript dos arquivos de implementação passou (ES2023, DOM, resolução bundler).
- Revisão independente conferiu o contrato OPEN e identificou guarda adicional no reuso: snapshot antigo só conclui UNCHANGED com observação VERIFIED, como exige o ledger. Guarda incorporada.
- Verificação de limite de linhas passou; índice operacional regenerado localmente.
- Nenhuma escrita financeira ou implantação foi realizada.

## Bloqueios e aceite antes de produção

1. A conexão MCP Supabase atual executa como supabase_read_only_user; não tem EXECUTE nas RPCs protegidas de conexão/probe. É necessário disponibilizar conexão com acesso autorizado para validar e publicar.
2. Confirmar em consulta real autenticada o acesso a invoices e a correspondência invoice_id V2/source_key V1. O esquema oficial documenta ambos os dados, mas a equivalência de IDs entre versões ainda precisa dessa prova. Nenhum vínculo aproximado deve ser feito.
3. Conferir uma amostra paga, aberta, vencida e negociada por polo, incluindo os 39 títulos de julho da Matriz mostrados pelo usuário. Confirmar OPEN/VERIFIED aceito pela RPC e refletido no Caixa sem recibos adicionais.
4. Medir o ciclo completo e adequar reutilização/polling de provas OPEN antes de ativação contínua. A RPC atual de reuse rejeita open_evidence; sem esse ajuste, cada confirmação aberta produzirá um novo snapshot. Este pacote NÃO deve ser liberado continuamente sem resolver esse gate.
5. Confirmar runtime Deno/Edge, publicar a função e reprocessar de forma limitada por polo. Comparar os totais anteriores/posteriores por mês e explicar todo remanescente REVIEW com causa concreta. Não zerar pendências artificialmente.
6. Falhas de acesso e divergências reais podem continuar exigindo revisão. Não declarar que todos os avisos sumiram sem verificar os dados reais.

## Fontes

- Documentação oficial: https://proesc.readme.io/reference/parcelas (esquema expandido de resposta 200, consultado em 2026-09-22).
- Contratos versionados de snapshot, obrigação aberta, ledger, polling e reutilização.
- Auditoria agregada remota somente leitura, sem exportar dados pessoais ou segredos.
