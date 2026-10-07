# Lote ativo

## Lote: 2026-10-07-correcao-financeira-limitada

Estado: versão 4.8.181 em preparação de atualização do PR; 14 migrations e grants aprovados instalados, worker v12 e emissor v10 ativos. Execução financeira dos 49 títulos pendente.
Objetivo: corrigir obrigações técnicas preservando recebíveis/ciclos, separar cancelamento bancário do ajuste interno e exigir novo consentimento real antes da reemissão manual.
Aceite: escopo e termos imutáveis; banco confirmado antes do ajuste; C2 cancelado não reabre; matrícula paga preservada; dispensa LOCAL comprovada; nenhuma emissão automática.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-07-correcao-financeira-limitada.md`.
Validação: SQL e UI sintéticos; caminho canônico de persistência com banco simulado e identidade original; nenhum título real cancelado ou emitido.
CI/Preview: reconferir o commit exato desta atualização. Build Deno completo, elegibilidade C2 com definições reais, concorrência PostgreSQL e smoke Safari autenticado devem ser conferidos conforme o registro.
Publicação: reconciliar no repositório os 15 payloads SQL exatos já instalados, preservando os drafts de teste e o histórico remoto. Esta atualização documental não executa cancelamento nem emissão.
Pendência separada: R$ 200,00 ainda não resolvidos; não representam baixa, estorno ou devolução confirmados.

## Contexto anterior preservado

Lote anterior: `ai/operacao/registros/alteracoes/2026-10-07-aviso-segundo-ciclo.md`.
O aviso C2 publicado na 4.8.180 permanece inalterado. Este lote não autoriza novo ciclo ou dispensa de confirmação de parcelas abertas.
