# Lote ativo

## Lote: 2026-11-13-dashboard-atividade-datas
Objetivo: distinguir data civil de pagamento de timestamps reais na atividade recente.
Status: RPC v2 aplicada e contrato real validado; frontend preparado para revisão, CI, Preview e publicação autorizada.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-13-dashboard-atividade-datas.md`.
Base: main `690f19cc20118bee2d0d423075b2cf800293846c`, 4.8.337; entrega 4.8.338, revisão 347.
Aceite: “Ajuste isso pq tá confuso” e autorização de produção após a confirmação de envio ao GitHub e PR draft.
Guarda: nenhuma alteração de registros financeiros, matrícula, dados de aluno, cálculos ou permissões; RPC original preservada.
Validação: 23 testes Node/PGlite, quatro fusos, build, lint e linhas; consulta real de 20 eventos preservou ordem e conteúdo.
Banco: migration `20261113184005` / `dashboard_activity_civil_dates`; ausência de identidade bloqueada, anon sem EXECUTE.
Limite: smoke visual/autenticado pendente por indisponibilidade do navegador; status e evidências finais ficam na PR.
