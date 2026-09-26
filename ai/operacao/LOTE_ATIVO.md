# Lote ativo

Estado: VALIDAÇÃO / PUBLICAÇÃO — INCIDENTE AUTH E LOGS

## Lote: 2026-09-25-incidente-login-logs

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-25-incidente-login-logs.md`.

- Pedido: investigar login travado e pico de ingestão com três agentes; corrigir causas comprovadas.
- Etapa 1: reprodução do bloqueio e agregação de logs por serviço, erro e horário.
- Etapa 2: login institucional e aluno corrigidos localmente; Edge `portal-auth` v16 publicada e migration de validações permanentes aplicada com sucesso.
- Etapa 3: 81 testes integrados aprovados e revisão cruzada concluída; teste SQL remoto com quatro rejeições e rollback aprovado, frontend 4.8.90 em validação/publicação pelo MCP.
- Manifesto: 24 arquivos. Preservados o hotfix remoto 4.8.87 e as mudanças já presentes em main 4.8.89.
- Não emitir, cancelar ou baixar cobranças; preservar migrations aplicadas e alterações paralelas.
- Usuário autorizou corrigir e normalizar o ambiente; login real será testado por ele após recuperação. Reinício pelo painel expressamente autorizado como exceção ao MCP.
- Rastreamento da indisponibilidade posterior ao pico de logs segue em andamento; não declarar saúde sustentada com base em uma leitura bem-sucedida isolada.
- Lote anterior concluído: revisão de transferências, PR177, produção 4.8.85; registro anterior preservado.
