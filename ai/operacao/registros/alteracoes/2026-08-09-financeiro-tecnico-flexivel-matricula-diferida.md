# Alteração — Financeiro Técnico flexível e matrícula diferida

- Lote: `2026-08-09-financeiro-tecnico-matricula-diferida-grade`
- Estado no fechamento: `PRONTO_PARA_VALIDACAO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`
- Publicação web/GitHub: não realizada.

## Resultado

- O visual anterior do Financeiro Técnico foi restaurado: cards do plano/recebido/inadimplência, barra de recebido, editor de regras, cronograma, instrução de boleto/carnê, Exportar, seis colunas, progresso, badges, extrato e ações.
- A regra da turma voltou a ser editável e flexível: matrícula e rematrícula são opcionais; mensalidades aceitam 1 a 60; valores, vencimento, desconto, juros, multa, seis políticas de aplicação e mensagem do boleto/carnê são configuráveis.
- Sem rematrícula, o ciclo encerra após as mensalidades. Com rematrícula, o pagamento abre o próximo ciclo com a quantidade configurada.
- A configuração individual do aluno usa override nullable por campo: `NULL` herda a turma e zero representa isenção explícita quando permitido. A confirmação mostra a regra efetiva do aluno.
- O aluno pode ser pré-vinculado sem título. A Gestão pode gerar ou agendar individualmente/em lote, com idempotência, locks, fingerprints e validação integral no backend.
- O frontend apenas coleta entradas e exibe workspace, cronograma, simulações, percentuais e progresso devolvidos pelas RPCs. TanStack Query reconcilia o retorno e o Broadcast privado trata mudanças externas sem refetch do eco local.
- Cada título técnico recebe snapshot imutável da política vigente na emissão, incluindo origem `TURMA`/`INDIVIDUAL` e `overrideAtivo`. Mudanças futuras na turma ou no aluno não reprecificam títulos emitidos.
- Estados `PENDENTE`, `AGENDADA`, `ATIVADA` e `GERADA` permanecem distintos. Regra ausente não é exibida como isenção de R$ 0,00.

## Banco e dados

- Migration remota registrada como `20260809062056_create_flexible_technical_financial_rules`.
- A primeira tentativa de aplicação falhou por sintaxe e foi integralmente revertida pela transação. A consulta foi corrigida e a aplicação seguinte concluiu com sucesso.
- A T46 foi confirmada no backend com matrícula R$ 200,00, mensalidade R$ 279,90, rematrícula R$ 200,00, 12 mensalidades, desconto R$ 19,90, juros de 1%, multa de 2%, as seis políticas e a instrução completa.
- Uma prévia não persistente confirmou também o cenário flexível sem matrícula, com 3 mensalidades e sem rematrícula, encerrando após as mensalidades.
- Existem oito matrículas técnicas pendentes na T46 e zero títulos técnicos emitidos no projeto no fechamento; nenhuma cobrança, pagamento, valor histórico ou vencimento foi alterado pela implantação.
- A migration anterior `060` já havia normalizado as oito turmas técnicas para 12 mensalidades e o mesmo conjunto de flags, sem manter snapshot anterior suficiente. Este lote não inventou dados para as outras turmas: preservou o estado atual e devolveu a edição canônica.

## Validações

- Contratos frontend financeiro: 8/8.
- Contratos SQL flexíveis/snapshot: 11/11.
- Suite integrada focada informada pelas frentes: 20/20 antes dos últimos asserts; os contratos finais específicos somaram 19/19.
- `npx tsc --noEmit`: aprovado.
- ESLint focado: aprovado.
- `npm run build`: aprovado para `2.3.0-beta.1`.
- MCP confirmou RPCs e grants, trigger de snapshot habilitado, portal snapshot-first, workspace canônico e reload do schema PostgREST.
- Logs posteriores mostraram o worker agendado técnico concluindo normalmente; advisors não apontaram erro novo específico. Os avisos de `SECURITY DEFINER` para autenticados são esperados nas RPCs protegidas por guardas internas; avisos gerais preexistentes ficaram fora deste lote.
- Nenhum navegador foi usado; a validação visual final ficou para o teste manual do usuário, conforme solicitado.

## Hotfix do workspace financeiro — 10:14

- Os logs do projeto correto mostraram duas respostas HTTP 200 da RPC `obter_financeiro_matricula_tecnica_workspace_secure`; portanto o alerta não era indisponibilidade, RLS nem RPC ausente. O parser rejeitava o JSON porque `regraEfetiva` de cada aluno não carregava os seis aliases de compatibilidade presentes na regra da turma.
- A migration incremental `20260809103000_fix_technical_financial_workspace_contract.sql`, aplicada por MCP como `20260809132059_fix_technical_financial_workspace_contract`, passou a devolver o mesmo contrato completo em toda regra renderizada.
- A consulta pós-aplicação na T40 confirmou 44 matrículas, 44 regras válidas e `contrato_completo = true`, sem escrever dados acadêmicos/financeiros e sem gerar cobrança.
- O erro estrutural ganhou tipo próprio no cliente e não é mais repetido pelo retry do TanStack Query. Falhas remotas transitórias ainda admitem uma única repetição.
- Validação final do hotfix: contratos focados 20/20, TypeScript aprovado, ESLint focado aprovado e build Vite aprovado. Nenhum navegador foi utilizado.
