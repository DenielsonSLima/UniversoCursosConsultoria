# Lote ativo

## Lote: 2026-10-09-portal-aluno-cracha-consulta-grade

Estado: implementação e revisão cruzada concluídas; fechamento para publicação 4.8.192.
Aceite: crachá com PDF fiel e botões separados; consulta respeita configuração salva;
disciplinas da grade permitem consultar os dias de aula cadastrados.
Escopo: documentos de identificação e consulta acadêmica do portal do aluno.
Base: 4.8.191, commit cd6a2641b99e7a3ca77a6b25ce1c8793dc3cae66.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-09-portal-aluno-cracha-consulta-grade.md`.
Banco: migration 20261009145431 aplicada e consulta real da CIE antiga validada.
PDF: compositor vetorial e mesmo Blob em prévia, download e impressão.
Segurança: política e máscaras canônicas no backend; snapshots não regravados.
Validação: crachá/modelo real, regressão da carteirinha, grade, SQL e render público.
Limitação: Safari autenticado e impressão física indisponíveis no ambiente atual.
Publicação: revisão conjunta e testes focados concluídos; CI/Preview antes do merge.

## Entregas anteriores preservadas

4.8.191: declarações e segunda via EAD, PR #284.
4.8.190: login por matrícula acadêmica, PR #283. 4.8.189: carteirinha, PR #282.
4.8.188–184: identidade/modelo/grade EAD, emissão automática, Banese e desconto.
