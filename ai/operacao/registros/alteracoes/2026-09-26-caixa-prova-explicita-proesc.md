# Caixa: preservação de prova explícita Proesc
Status: backend aplicado e validado em 26/09/2026; publicação deste manifesto pendente.
Base de publicação: `13925bcef0c71dd3d11135a3a32afba239627425`.
Classificação: mudança crítica de leitura financeira, sem baixa ou emissão.

## Problema e comportamento
Uma consulta contábil inconclusiva posterior podia colocar novamente em conferência um título com prova explícita OPEN já registrada. Os dois leitores privados do Caixa agora preservam essa prova somente quando os eventos posteriores são buscas sem pagamento estritamente compatíveis.

Pagamento, cancelamento, renegociação, divergência, ajuste ou substituição são barreiras; não se busca uma prova antiga atravessando conflito. Mudança local posterior também impede o retorno. A prova mantém os timestamps originais e não recebe validade renovada por polling.

Ingestão, histórico, cálculo de valores, autorização pública, escopo por polo, APPLY e FINALIZE foram preservados. Os helpers são privados, SECURITY INVOKER e sem grants externos. Referências qualificadas e ausência de cláusula SET permitem incorporação ao plano dos leitores, cujas proteções originais permanecem.

## Aplicação e integridade
Aplicada exclusivamente via MCP Supabase às 12:16:36 UTC:
- Ledger: `20260926121636_preserve_explicit_caixa_proesc_evidence`.
- SQL local idêntico ao ledger, SHA-256: `4e2cbf6f0d4ca64e4f5dec0bf94a80679a0275c127d92b3bf2aeaf47614c17a4`.
- Transação com lock_timeout de 2s e statement_timeout de 8s.
- Pós-aplicação: helpers sem SECURITY DEFINER e EXECUTE somente para o proprietário; leitores e agregados íntegros.

Agregados antes/depois: agosto 54 títulos/R$15.183,70 em conferência; setembro 78/R$21.931,40; receitas futuras confirmadas R$84.659,80 em 308 títulos, com outros 1189 em conferência. Nenhuma prova dos 132 títulos foi registrada neste lote; a conferência do relatório oficial é separada.

## Validação
- 40 cenários sintéticos SELECT-only e 40 no Postgres isolado, usando os corpos reais.
- Migration integral, drift, OIDs/ACLs, ausência de writes financeiros, escopo por polo e dois leitores testados.
- Compactador vigente testado integralmente: preservou IDs das extremidades de cada bloco e toda a história; só duplicatas intermediárias foram movidas. A migration verifica seu hash antes de alterar leitores.
- Ensaio transacional com rollback e JSONs/hash financeiro idênticos: agosto 474,472→29,653ms; setembro 229,787→18,491ms; receitas futuras 706,036→187,759ms.
- Os tempos são amostras antes/depois sujeitas a cache, não garantia de aceleração geral. A variante inicial com chamadas por linha foi descartada por regressão; o teste final exige ausência de Function Scan.
- Ensaios revertidos sem entradas no ledger. Smoke visual integrado e conferência individual do relatório ficam para o coordenador.

## Manifesto
- `supabase/migrations/20260926121636_preserve_explicit_caixa_proesc_evidence.sql`
- `supabase/tests/caixa_proesc_effective_evidence.readonly.mjs`
- `supabase/tests/caixa_proesc_effective_evidence.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-09-26-caixa-prova-explicita-proesc.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

A registry de publicação parte integralmente do main indicado e acrescenta somente este registro. Sem alteração de versão frontend, AGENTS, skills ou memória.

