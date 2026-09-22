# Lote ativo

Estado: IMPLEMENTADO — VALIDAÇÃO DE ENTREGA REALTIME

## Lote: 2026-09-21-realtime-retencao-efetiva

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-21-realtime-retencao-efetiva.md`.

- Continuação do pedido de corrigir crescimento técnico desnecessário em produção, preservando dados úteis.
- A retenção existente de 24 horas depende da emissão de eventos com IDs específicos e deixa sinais antigos acumulados.
- Tornar a retenção independente de novos eventos, com manutenção limitada e agendamento horário.
- Ajustar assinaturas de sinais de Gestão para INSERT antes da ativação, evitando invalidação por expiração técnica.
- Escopo restrito às três tabelas de sinais efêmeros; nenhum pagamento, baixa, prova financeira ou registro de acesso integra a limpeza.
- Validar fronteira temporal, lote, autorização, concorrência e reexecução, com revisão independente e leitura remota antes/depois.
- O Caixa 4.8.75 foi publicado no PR #167 e conferido em sessão autenticada; seu registro é atualizado somente para fechar a entrega anterior.
- Expurgo genérico de logs após 90 dias e agregação das reservas Proesc continuam no planejamento separado.

- Instalação remota inativa confirmada; testes SQL e frontend, build e revisão independente aprovados. Publicação precede ativação e drenagem.
