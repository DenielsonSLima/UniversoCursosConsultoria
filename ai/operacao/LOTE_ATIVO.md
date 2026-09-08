# Lote ativo

Estado: `VALIDADO PARA PUBLICAÇÃO — 4.8.37`

## Lote: 2026-09-08-revisao-turmas-em-andamento

- Pedido: revisar novamente a entrega, corrigir achados e atualizar o GitHub.
- Risco: transição de modo do formulário financeiro; sem mudança de schema ou títulos.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-08-revisao-turmas-em-andamento.md`

### Aceite

1. Escolher sem novas cobranças descarta referências financeiras inválidas de rascunho anterior.
2. Curso, datas e demais dados acadêmicos são preservados.
3. Matrícula/automação permanecem bloqueadas e nenhum pagamento é presumido.
4. Turma nova e segundo ciclo mantêm o comportamento validado.
5. Teste de regressão, smoke e CI antes do fechamento no GitHub.

- A 4.8.36 foi publicada e validada em produção; evidências finais no PR #131.
- Correção atual reproduzida e coberta por teste; publicação autorizada no escopo da mesma funcionalidade.
- 20 testes Node, TypeScript, build, limite de linhas e smoke local aprovados. Evidências finais de GitHub/Vercel no PR da 4.8.37.
