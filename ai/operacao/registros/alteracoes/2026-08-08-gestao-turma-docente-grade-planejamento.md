# Alteração — docente e planejamento da grade técnica

- Lote: `2026-08-08-gestao-turma-docente-grade-planejamento`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO`
- Escopo: atribuição de docente, cache TanStack Query, Realtime da grade, seletor de docente e autorização das RPCs de planejamento de aula da Gestão.
- Não alterado: autenticação/refresh token geral, diário do professor, módulos externos à Gestão de Turmas Técnicas e publicação GitHub/Vercel. No banco remoto, somente a migration deste lote foi aplicada.

## Diagnóstico

- A atribuição persistia por `upsert` direto e enviava `professor_nome` calculado no cliente. A mutation invalidava várias consultas e o evento Realtime do mesmo `UPDATE` iniciava outra reconciliação, causando spinner e atualização tardia.
- O trigger legado de `turmas_disciplinas` também espelhava a mesma transação em `gestao_realtime_events`, gerando uma segunda notificação mesmo quando o evento direto já havia sido tratado.
- O seletor usava composição de página inteira, em vez de diálogo central com limite de viewport e rolagem interna.
- `salvar_encontro_turma` reutilizava `can_write_academic_record_open`, uma guarda própria do diário. Ela exige a janela acadêmica aberta e, no curso técnico, pode exigir turma em andamento; por isso a Gestão recebia o falso `42501` ao planejar uma aula antes do início.
- O `Invalid Refresh Token` visível na captura é uma falha de sessão separada e não explica o `42501` acadêmico.

## Resultado

- A RPC batch `atribuir_docente_disciplinas_turma` recebe somente turma, disciplinas e identificador opcional do professor. O banco valida o parceiro ativo, deriva o nome, preserva `concluida` e devolve as linhas canônicas na ordem solicitada.
- A autorização exige `service_role` ou módulo Gestão no polo da turma, recusa turma finalizada, vínculo inexistente e disciplina com `bloqueio_diario = 'TOTAL'`. A função usa `SECURITY DEFINER`, `search_path` vazio e não concede execução a `anon`/`PUBLIC`.
- O frontend atualiza a linha otimisticamente, restaura o cache no erro e reconcilia o retorno da RPC antes do toast. O evento local exato de `turmas_disciplinas` é correlacionado e suprimido; o espelho legado dessa tabela na outbox também é ignorado porque a assinatura direta já cobre alterações locais e externas. Outros eventos continuam invalidando/refazendo somente as consultas da turma.
- As mutações de criar, editar e remover aula escrevem o retorno canônico no cache e apenas marcam dependências como obsoletas; um único debounce Realtime reconcilia métricas e listas relacionadas.
- O planejamento ganhou `internal_academic.can_manage_turma_lesson_planning`, independente da janela do diário, mas mantendo vínculo, polo, módulo Gestão, turma não finalizada e ausência de bloqueio total. Criar, remover e definir horário usam a mesma guarda.
- O seletor agora é um portal central compacto, responsivo, com `max-height` de 88dvh, rolagem interna, backdrop, bloqueio do body, Escape, foco inicial/trap/restore e indicador somente no docente escolhido.
- A confirmação usa o título `Docente confirmado` e o nome canônico devolvido pelo banco. Falha ou retorno incompleto mantém o diálogo aberto para nova tentativa.

## Evidências

- `deno test --allow-read modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDialogs.test.ts`: 4/4 aprovados.
- `node --test modules/gestor/gestao/tecnicos/detalhes/turma-grade-sync.contract.test.mjs`: 4/4 aprovados.
- Contratos SQL de conteúdo planejado, diário da Gestão e nova autorização/RPC: 16/16 aprovados.
- ESLint focado nos cinco arquivos de produto alterados: aprovado.
- `npm run build`: aprovado para `2.3.0-beta.1`.
- `npx tsc --noEmit`: nenhum erro no lote; três erros paralelos permanecem em `SecretariaDocumentoEmissionPage.tsx` e `tmp/pdfs/review-caixa/real-report-harness.tsx`.
- Logs PostgreSQL: o erro “Sem permissão para alterar este encontro de aula” ocorreu às 22:03:50. Logs de Auth: dois `refresh_token_not_found` às 22:00/22:01, seguidos de login por senha e consultas autenticadas bem-sucedidas. Não houve erro Realtime no intervalo.
- Migration remota `20260809013837_fix_gestao_turma_docente_planejamento` aplicada pelo MCP no projeto `kfekgwyqozhicpfuunpo`.
- Validação remota confirmou RPC batch, guarda de planejamento no lugar da guarda de diário, `turmas_disciplinas` publicada diretamente no Realtime, `SECURITY DEFINER`, `search_path` vazio, execução apenas por `authenticated/service_role` e autorização do gestor da captura para a turma elegível.
- O advisor de performance não associou alerta às novas funções. O advisor de segurança registrou o aviso esperado para RPCs `SECURITY DEFINER` chamáveis por autenticados; a exposição é deliberada e protegida pelas guardas internas.

## Limitações e entrega

- O Safari foi inspecionado, mas a sessão local inválida redirecionou o Portal para `/sistema/login`. Credenciais e o desafio Cloudflare não foram manipulados; o clique final depende de novo login. O layout e os estados do seletor foram validados por contrato e comparados às capturas fornecidas.
- A primeira ferramenta Supabase descoberta apontava para outro projeto e foi descartada. A busca final encontrou o conector correto antes de qualquer escrita; logs, advisors, migration e consultas de validação foram então executados exclusivamente em `kfekgwyqozhicpfuunpo`.
- O índice RAG versionado foi recriado com 21 fontes e 152 trechos. A sincronização do cache opcional OpenContext falhou por falta de permissão de escrita em `~/.opencontext`; a fonte canônica em `ai/operacao/` permanece completa.
- Não houve commit, PR, Preview ou deploy web; a única alteração remota foi a migration Supabase descrita acima.
