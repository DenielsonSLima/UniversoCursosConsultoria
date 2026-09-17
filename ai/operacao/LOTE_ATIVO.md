# Lote ativo

Estado: BACKEND VALIDADO — EM PUBLICAÇÃO — REFERÊNCIA DA CONSULTA PROESC NA CONCILIAÇÃO (4.8.68)

## Lote: 2026-09-16-conciliacao-horario-consulta

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-16-conciliacao-horario-consulta.md`.

- Usuário solicitou reunião, revisão, implantação em produção e revisão posterior; validação permanece interna, sem navegador.
- Exibir referência temporal da consulta somente quando a origem API estiver comprovada e faltar horário real de baixa.
- Campo canônico independente distingue horário da observação/lote de consulta de pagamento e baixa; observação genérica não serve de fallback.
- Consulta não confirma composição financeira. Datas econômicas, valores, campos desconhecidos e autorização permanecem intactos.
- Cinco arquivos frontend, dois SQL e cinco de operação compõem o manifesto de doze arquivos; CI existente já cobre os testes.
- Vinte e três testes de mapper/renderização, onze cenários SQL e lint focado aprovados; revisão independente da interface sem achados. TypeScript, build e teto aprovados.
- Horário real tem prioridade; timestamp ausente, inválido ou sem fuso mantém a ausência. Referência exibida acompanha cada nova resposta canônica.
- Backend aplicado e revisão independente posterior aprovada: consulta em campo próprio, data de pagamento e composição preservadas; desempenho e permissões conferidos.
- Versão 4.8.68 / revisão 77 em publicação; CI, Preview, deploy e conferência final do domínio registrados no PR.
- Entrega anterior: 4.8.67. Histórico anterior e memória preservados.
