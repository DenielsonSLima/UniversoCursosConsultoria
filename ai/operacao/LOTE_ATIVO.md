# Lote ativo

## Lote: 2026-10-08-dispensa-controle-local

Estado: candidato 4.8.182/revisão 191 para PR de rascunho, sem aplicação remota neste lote.
Objetivo/aceite: reconhecer dispensa LOCAL apenas com reversão auditada da baixa de controle; preservar histórico, identidade e guardas; nenhum novo grant ou emissão automática.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-08-dispensa-controle-local.md`.
Validação: testes sintéticos isolados e CI do commit exato; revisão independente antes de qualquer aplicação.
SQL: review-drafts fora das migrations automáticas; nomes canônicos somente após aplicação e histórico conhecido.

## Contexto anterior preservado

Lote anterior: `ai/operacao/registros/alteracoes/2026-10-07-correcao-financeira-limitada.md`.
A 4.8.181 e o aviso C2 permanecem preservados; este lote não autoriza novo ciclo ou dispensa de consentimento.
