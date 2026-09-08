# Turmas técnicas em andamento

## Pedido e análise em etapas

1. Diagnóstico: a origem financeira existia no fim do formulário; cadastro sempre planejado, valores do primeiro ciclo ainda editáveis e histórico externo sem títulos locais bloqueava segundo ciclo.
2. Revisão independente: manter políticas existentes (incluindo T42), idempotência, proteção de títulos emitidos, status acadêmico e geração exclusivamente manual.
3. Implementação: origem na primeira etapa; início histórico e fase EM_ANDAMENTO; matrícula antiga desativada; histórico externo opt-in; sem cobranças bloqueia edição e geração.
4. Validação: contrato real por MCP em transação revertida, testes focados, TypeScript, build e percurso local no Safari.

## Regras de produto

- NOVA mantém baselines, valores padrão e critérios existentes.
- IMPORTADA_CICLO_1 + HISTORICO_EXTERNO gera somente ciclo 2, com confirmação manual do gestor; não registra quitação ou boletos fictícios do ciclo anterior.
- HISTORICO_EXTERNO exige ausência de recebíveis locais para evitar sobreposição ambígua. Qualquer histórico local exige revisão, sem relaxar as políticas já existentes.
- IMPORTADA_CONCLUIDA é identificador financeiro de compatibilidade; a interface diz sem novas cobranças. Não significa conclusão acadêmica nem quitação.
- Entrada de alunos antigos não gera cobrança; inscrições públicas são bloqueadas para estes novos modos importados.
- Somente futuras emissões permitidas recebem valores, descontos, juros e multa; títulos existentes não são reprecificados.
- Valores internos de referência continuam no schema para compatibilidade com o validador. Não representam saldo devido e são ocultos no modo sem cobranças.
- Guardas no banco impedem matrícula/automação/condições individuais incompatíveis; campos financeiros inalterados não bloqueiam edição acadêmica.

## Manifesto explícito

- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoDadosStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoFinanceiroStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoForm.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoReviewStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoAutorizacaoStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoOrigemFields.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-origem.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-origem.test.mjs`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-financeiro-preview.service.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.constants.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.contract.test.mjs`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.types.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.validation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigEditor.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigSummary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoOverrideDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-financeiro-policy.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/gestao-create-turma.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaConfiguracoes.tsx`
- `supabase/migrations/20260908162727_support_external_technical_class_history.sql`
- `supabase/migrations/20260908162734_gate_external_technical_cycle_state.sql`
- `supabase/migrations/20260908162741_guard_imported_technical_financial_edits.sql`
- `supabase/tests/imported_technical_class_history.rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-08-turmas-tecnicas-em-andamento.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

- `internal/versioning/changelog/2026-08-26.md`

Total: 38 arquivos.

## Validação

- 18 testes Node do formulário/origem aprovados, incluindo render dos campos bloqueados e totais somente do segundo ciclo.
- 47 testes Deno dos contratos diretamente relacionados aprovados (9 subpassos). Uma expectativa estrutural foi atualizada para incluir o novo bloqueio de edição individual.
- TypeScript sem erros; build completo aprovado (aviso conhecido de chunks grandes).
- MCP: migrations em transação com teste sintético e ROLLBACK aprovado.
- Casos SQL: criação/replay dos três modos, vínculo sem títulos, primeiro ciclo novo preservado, segundo ciclo externo com encargos canônicos, bloqueios acadêmico/configuração/histórico local, autorização antes de replay, payload divergente, prévia desatualizada, geração local idempotente e nenhum pagamento/emissão fabricado.
- Leitura posterior confirmou ausência de schema e fixtures persistidos.
- Smoke Safari local: cinco etapas e submit dos dois modos importados; data do segundo ciclo digitada; matrícula desabilitada; inscrições bloqueadas; retorno EM_ANDAMENTO com baseline 1/2 correto. Serviços simulados no harness; valores reais validados separadamente por RPC.
- Render visual conferido no Safari. Teste autenticado integrado após deploy ainda pendente.
- Harnesses, builds e logs em tmp e /tmp são regeneráveis e não entram no manifesto.

## Riscos e entrega

- Mudança crítica: interface e três migrations devem ser entregues juntas, na ordem do manifesto.
- Novo critério externo não altera políticas de turmas existentes.
- Comparação por MCP GitHub com main `4ff24617544efab56d98b76651c6cda5b775272f` concluída: diferenças dos 27 arquivos existentes correspondem ao lote; 8 arquivos são novos. Alterações locais anteriores presentes no destino foram preservadas. Conferir novamente o HEAD no momento da publicação.
- Três migrations aplicadas por MCP Supabase; nomes locais alinhados aos registros remotos 20260908162727, 20260908162734 e 20260908162741, sem alteração do SQL aplicado.
- Teste contratual transacional repetido após aplicação e aprovado, com rollback das fixtures. Nenhum título bancário emitido. GitHub e deploy em execução.
- Publicação em produção autorizada em 08/09/2026 pelo usuário após apresentação das regras e validações. Revisão final independente do SQL aprovada, sem novos bloqueadores. Versão 4.8.36.
- Fechamento de publicação: 18 testes Node, 47 Deno (9 subpassos), TypeScript, build 4.8.36, versão e teto de linhas aprovados. Entradas 4.8.6–4.8.7 do changelog movidas integralmente ao arquivo histórico para respeitar o teto.
- Resultados de CI, Preview, produção e smoke posterior serão registrados no PR da versão; testes de emissão bancária real não fazem parte deste lote.
- CI inicial detectou contrato estrutural da trava de duplo envio. A conferência do histórico externo foi separada da trava existente, preservando ambas as guardas e o contrato de progresso da emissão.
