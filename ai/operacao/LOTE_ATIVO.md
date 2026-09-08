# Lote ativo

Estado: `CORREÇÃO EM VALIDAÇÃO — RECUPERAÇÃO DOS RECEBÍVEIS`

## Lote: 2026-09-08-recebiveis-recuperacao-carregamento

- Pedido: revisar travamento após a versão 4.8.34 e corrigir recuperação da tela.
- Risco: leitura financeira e publicação, sem alterações de banco ou valores.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-08-recebiveis-recuperacao-carregamento.md`
- Evidência: timeouts 57014 e HTTP503/PGRST002 às 00:21 em America/Maceio.

### Aceite

1. Nenhuma leitura fica pendente indefinidamente no cliente.
2. Erro/timeout oferece nova tentativa preservando filtros, inclusive detalhes.
3. Falha inicial não aparece como lista vazia; mostrar suspensão offline.
4. Preservar escopo autorizado, auditoria da baixa e cálculos no backend.
5. Revisão, testes focados, build e smoke proporcional antes do fechamento.
