# Cancelamento bancário de inclusão indevida — candidato isolado

## Escopo
Nova Edge `enrollment-inclusion-cancellation` e namespace privado
`internal_inclusion_cancellation`. Cancela exclusivamente os títulos de um run
nativo inteiro aprovado por manutenção, um item por chamada. Não reemite, não
altera a matrícula e não exclui histórico ou identificadores bancários.

Execução SYSTEM_MAINTENANCE com referência/hash da autorização explícita do
solicitante CHAT_OWNER separados da identidade original da emissão. Nenhum
auth.uid é fabricado. Prepare/approve/dispatch permanecem privados; somente cinco
RPCs operacionais recebem EXECUTE de service_role.

## Invariantes
Manifesto e snapshots imutáveis; comparação de escopo antes de replay; lease e
intenção duráveis; GET estrito de identidade, termos e pagamentos antes/depois
do cancelamento. Resultado incerto permite somente confirmação GET. Pagamento,
divergência ou consulta incompleta param o item. Reconciliação conserva run,
autorizações, recebíveis e transações originais.

Cercas limitadas aos itens aprovados impedem concorrência de recebimento local,
renegociação, reemissão e conciliação. Histórico de ledger ou número cancelado
exige revisão. Evidência de pagamento posterior nunca é apagada.

## Validação e publicação
Testes sintéticos de processador/HTTP, adapter bancário e SQL isolado. CI inclui
PostgreSQL17 com sessões independentes para concorrência. Nenhum teste acessa
banco bancário real. Revisão local não declara deploy nem cancelamento realizado.
Sem incremento de versão web: pacote backend isolado, sem colisão com releases UI.

Antes de operação real: revisão/CI verde do commit exato, autorização de publicação,
readback de migrations/ACL/dependências, manifesto privado conferido, aprovação
da operação e GET bancário fresco. O arquivamento recuperável do episódio
acadêmico/financeiro e futura continuidade correta são trabalho separado.
Nenhum dado pessoal, ID de aluno ou evidência privada integra este lote público.
