# Conciliação Banese com diferença não discriminada

Data: 15/11/2026. Classe: mudança crítica (financeiro, banco e publicação).
Autorização: usuário solicitou correção com três agentes e produção. Confirmou conciliar os três pagamentos pelos totais e datas oficiais do banco, registrando a diferença sem inventar composição de encargos.
Status: backend publicado e três pagamentos conciliados; versão 4.8.345 em publicação.

## Contrato e aceite

- Somente ação autenticada e explícita, com total/data autorizados, para título Técnico API em produção, transação única e quarentena REVIEW_REQUIRED.
- Nova consulta GET prova identidade integral, CPF, ASBACE, valor nominal, vencimento e par bancário exato. Sem recuperação Pix auxiliar, emissão, manutenção bancária ou parcelas futuras.
- Aprovação compara fatos imutáveis, termos e faixa calculada; o reconciliador automático continua recusando diferenças financeiras.
- Persistência canônica/CAS grava baixa e revisão atomicamente. Registra autoridade, motivo, horário, diferenças contra nominal e esperado, com componentes desconhecidos.
- Caixa/relatórios preservam juros, multa, acréscimo e desconto desconhecidos; mostram a diferença não discriminada. Evidência inválida/desatualizada não reativa fórmula. Composição manual explícita e títulos sem revisão mantêm o contrato existente.
- Replay preserva a revisão original e a única transação. Termos, linha, código de barras e Pix permanecem intactos.

## Manifesto explícito

- `supabase/functions/gateways/api/banese.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.ts`
- `supabase/functions/gateways/api/banese-reviewed-settlement.ts`
- `supabase/functions/gateways/api/banese-reviewed-settlement.test.ts`
- `supabase/functions/banese-reconciliation-worker/worker-action.ts`
- `supabase/functions/banese-reconciliation-worker/reviewed-payment.ts`
- `supabase/functions/banese-reconciliation-worker/reviewed-payment.test.ts`
- `supabase/migrations/20261115085510_banese_reviewed_payment_composition.sql`
- `supabase/tests/banese_reviewed_payment_composition.fixture.sql`
- `supabase/tests/banese_reviewed_payment_composition.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-banese-pagamentos-revisados.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-09-versao-4-8-278.md`

Total: 16 arquivos. Ficha PF e demais alterações locais ficam fora deste manifesto.

## Evidência e validação

GET oficial isolado confirmou novamente os três pagamentos. Antes da baixa, os três títulos estavam em quarentena, com uma transação cada. Simulação somente leitura reproduziu a atribuição indevida por tolerância da composição antiga; a revisão explícita agora mantém componentes nulos.

Testes Deno da ação, portal, diagnóstico, revisão financeira e cálculo aprovados; tipagem do handler e lint focados aprovados. Ensaio PGlite com RPC canônica real cobriu evidência atômica, CAS, replay, termos/conta/tarifa/líquido preservados, rejeição de evidência inválida, marcador obsoleto, fluxo sem marcador e precedência manual.

## Produção e fechamento

Migration remota 20261115085510 aplicada via MCP, sem alteração de ACL/owner dos chamadores. Helper permanece privado. Worker106 ACTIVE relido:110 arquivos iguais ao bundle esperado, com105 dependências preservadas e autenticação interna existente.

Três ações sequenciais responderam HTTP200/success/paid. Cada título ficou PAGO/PAID, fila DONE sem próxima consulta e uma transação. Totais e datas coincidem com a autorização e os GETs oficiais. Revisão espelhada no snapshot transacional e no recebível; diferenças contra cálculo esperado preservadas.

O relatório real do Caixa retornou três pagamentos com valores/datas oficiais, componentes nulos e diferença contra nominal não discriminada. Hashes de termos, linha, código e Pix permaneceram iguais aos anteriores. Conta bancária vinculada pelo fluxo canônico de baixa; tarifa e líquido não foram inferidos. Nenhuma emissão ou manutenção bancária foi solicitada.

34 testes Deno repetidos pelo agente principal, ensaio SQL PGlite, tipagem, lint, build Node24.22.1, controle de versão e auditoria de linhas aprovados. Revisão cruzada de três agentes. Alteração sem nova interface; contrato real validado por execução e leitura do Caixa. Safari autenticado pós-publicação do predecessor continua sem janela disponível (cgWindowNotFound), sem troca de navegador.

Base remota de publicação: main53d857c218470db86f61f80466a72b389f2463f6, preservando os lotes anteriores. Nenhum dado pessoal ou resposta bancária bruta integra este registro.
