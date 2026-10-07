# Lote ativo

## Lote: 2026-10-07-correcao-financeira-limitada

Estado: candidato 4.8.181 em PR de rascunho; validação local revisada, CI e validações complementares pendentes.
Objetivo: corrigir obrigações técnicas preservando recebíveis/ciclos, separar cancelamento bancário do ajuste interno e exigir novo consentimento real antes da reemissão manual.
Aceite: escopo e termos imutáveis; banco confirmado antes do ajuste; C2 cancelado não reabre; matrícula paga preservada; dispensa LOCAL comprovada; nenhuma emissão automática.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-07-correcao-financeira-limitada.md`.
Validação: SQL e UI sintéticos; caminho canônico de persistência com banco simulado e identidade original; nenhum título real cancelado ou emitido.
CI/Preview: aguardando commit exato. Build Deno completo, elegibilidade C2 com definições reais, concorrência PostgreSQL e smoke Safari autenticado devem ser conferidos conforme o registro.
Publicação: apenas código de revisão; SQL fora de supabase/migrations, sem grants, aplicação de banco, deploy de Edge Function ou execução financeira autorizados por este lote.

## Contexto anterior preservado

Lote anterior: `ai/operacao/registros/alteracoes/2026-10-07-aviso-segundo-ciclo.md`.
O aviso C2 publicado na 4.8.180 permanece inalterado. Este lote não autoriza novo ciclo ou dispensa de confirmação de parcelas abertas.
