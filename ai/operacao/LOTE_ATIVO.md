# Lote ativo

Estado: `VALIDADO PARA PUBLICAÇÃO — 4.8.36`

## Lote: 2026-09-08-turmas-tecnicas-em-andamento

- Pedido: cadastrar turma nova ou em andamento; gerar somente o 2º ciclo ou nenhuma cobrança.
- Risco: financeiro e ciclo acadêmico. Revisão independente do backend e implementação do formulário.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-08-turmas-tecnicas-em-andamento.md`

### Aceite

1. Turma nova preserva regras e geração manual existentes.
2. Turma em andamento começa academicamente EM_ANDAMENTO com início histórico.
3. Primeiro ciclo externo não cria títulos nem informa quitação; apenas segundo ciclo disponível.
4. Sem novas cobranças bloqueia geração e edição financeira.
5. Cadastro e vínculo de aluno não emitem títulos; matrícula antiga não é recriada.
6. Valores, desconto, juros e multa valem apenas para novas emissões permitidas.
7. Validar autorização, idempotência, duplicação, testes focados e smoke.
8. Publicação em produção autorizada pelo usuário em 08/09/2026, após apresentação das três regras e validações.

- Testes focados, TypeScript, build e smoke local Safari aprovados. Contrato MCP testado com rollback.
- Três migrations aplicadas via MCP e contrato transacional aprovado após aplicação; fixtures revertidas.
- Manifesto de 38 arquivos aprovado. Resultados de Preview, produção e smoke pós-deploy serão registrados no PR da versão 4.8.36.
