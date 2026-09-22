# Lote ativo

Estado: IMPLEMENTADO LOCALMENTE — BLOQUEADO PARA VALIDAÇÃO REMOTA

## Lote: 2026-09-22-caixa-evidencia-financeira-v2

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-22-caixa-evidencia-financeira-v2.md`.

- Pedido: corrigir as cobranças permanentemente em conferência no Caixa.
- Integração V2 de situação explícita, preservação de evidências e teste real do recurso financeiro implementados em rascunho.
- Testes focados e checagem de tipos passaram; produção ainda não alterada.
- Acesso Supabase somente leitura impede prova real do contrato e reprocessamento.
- Antes de liberar continuamente, confirmar IDs entre versões, adequar reutilização/polling OPEN e verificar o Caixa por polo/mês.
- O lote anterior permanece documentado em `ai/operacao/registros/alteracoes/2026-09-21-realtime-retencao-efetiva.md`; esta entrega não modifica suas rotinas.
