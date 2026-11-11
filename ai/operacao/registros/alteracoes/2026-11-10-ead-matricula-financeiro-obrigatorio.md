# EAD: matrícula com financeiro obrigatório sem permissão de dispensa

## Objetivo e aceite

Pedido: revisar a inclusão em Gestão → EAD por administrador sem acesso ao Financeiro. Usuário confirmou esse caminho; não informou aluno/curso do incidente. Não realizar recuperação retroativa, pois o lançamento já foi criado manualmente em Outros Créditos.

- Gestão/Alunos pode incluir com cobrança obrigatória, mesmo sem módulo Financeiro.
- Somente quem tem acesso efetivo ao Financeiro visualiza a escolha de dispensar cobrança.
- Sem Financeiro, a confirmação exibe aviso e solicita o checkout canônico, com matrícula pendente e preço decidido pelo backend.
- Erro ou resposta sem confirmação do financeiro não são apresentados como inclusão concluída.
- A RPC genérica não pode ativar EAD contornando os fluxos específicos.

## Diagnóstico e mudança

O código local exigia Financeiro para qualquer inclusão: botão, hook e autorização de checkout. Os testes existentes consolidavam essa restrição. A autorização agora distingue matrícula acadêmica com cobrança de dispensa financeira. A RPC de dispensa mantém sua autorização original no servidor, sem ampliar permissões.

A inspeção somente leitura do projeto configurado confirmou também que `matricular_aluno_turma` aceitava EAD pelo legado. O teste isolado reproduziu vínculo ATIVO sem título antes da nova guarda. A migration proposta bloqueia esse caminho antes da escrita e preserva as regras das demais modalidades.

## Manifesto explícito

- `modules/gestor/gestao/ead/detalhes/ead-enrollment.model.ts`
- `modules/gestor/gestao/ead/detalhes/components/AdicionarAlunoEadModal.tsx`
- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadMutations.ts`
- `modules/gestor/gestao/ead/detalhes/ead-turma.service.ts`
- `modules/gestor/gestao/ead/detalhes/ead-enrollment.smoke.test.mjs`
- `supabase/functions/gateways/checkout/ead-manager.ts`
- `supabase/functions/gateways/checkout/ead-context.ts`
- `supabase/functions/gateways/checkout/ead-manager.test.ts`
- `supabase/migrations/20261111010609_block_ead_generic_enrollment_bypass.sql`
- `supabase/tests/ead_generic_enrollment_guard.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-10-ead-matricula-financeiro-obrigatorio.md`
- `.github/workflows/ead-credit-corrections.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 16 arquivos. Os dois arquivos de versionamento são preparados no diretório isolado de publicação a partir de main; as alterações NFS-e locais permanecem preservadas.

## Validação

- 31 testes Deno de checkout EAD, autorização e reserva: aprovados, incluindo gestor global sem Financeiro e escopo de abas explicitamente vazio.
- Testes PGlite de matrícula do gestor, dispensa e nova guarda genérica: aprovados.
- Smoke React DOM: aprovado, cobrindo escolha com Financeiro, cobrança obrigatória sem Financeiro, revogação durante o modal, dispensa programática negada, resposta sem título, clique duplo e retry idempotente.
- Safari autenticado no site local: Gestão → EAD → turma → Alunos → Adicionar aluno abriu o modal; nenhuma inclusão real confirmada.
- Safari com componentes reais e dados sintéticos: perfil Gestão/Alunos sem Financeiro exibiu aviso, sem seletor de dispensa; confirmação enviou `payment-checkout`, `managerEnrollment=true`, `BOLETO`, fechou o modal e mostrou aguardando pagamento. Harness regenerável em `/private/tmp/universo-ead-permissions-review`, fora do manifesto.
- Build completo aprovado com Node 24.22.1 já instalado em tmp. Node padrão 24.19.0 foi recusado pela guarda de segurança antes do build.
- Revisão independente de autorização: sem defeitos materiais.
- `git diff --check` do manifesto: aprovado. Todos os 12 arquivos têm menos de 500 linhas; maior arquivo de implementação: `ead-context.ts`, 487 linhas.
- `npm run check:file-lines`: execução global falhou por seis arquivos ausentes do antigo painel NFS-e de homologação, fora deste manifesto. Não alterado trabalho paralelo para resolver esse registro.

## Entrega e limitações

Migration aplicada e conferida no ledger. Edge `payment-checkout` v31 ACTIVE, preservando todos os arquivos da v30 salvo os dois componentes de autorização deste lote. Frontend 4.8.286 preparado em branch isolada para Preview e produção autorizada. Não houve criação, alteração ou duplicação de cobranças reais nesta revisão. Smoke real de geração com o perfil sem Financeiro depende de um cadastro de teste acordado.

O lote NFS-e já ativo e os arquivos com mudanças anteriores foram preservados. Este registro delimita a correção EAD sem substituir `LOTE_ATIVO.md`. A publicação deve isolar os trechos deste pedido dos demais trabalhos já presentes nos arquivos compartilhados. Nenhuma migration aplicada foi editada.

Usuário autorizou explicitamente aplicação e produção após revisão por três agentes. Revisões frontend, backend e entrega concluídas; sem defeitos materiais. Migration aplicada pelo MCP no projeto configurado, ledger `20261111010609_block_ead_generic_enrollment_bypass`; fonte preservada byte a byte sob esse identificador. Verificação remota em transação com identidade e permissões reais da administradora recebeu PT409 no caminho genérico antes da escrita e terminou com ROLLBACK. Frontend em preparação para publicação isolada 4.8.286; versão local 4.8.285 pertence à NFS-e e permanece preservada. Não foram modificadas fontes do corpus RAG padrão; registros históricos não fazem parte desse corpus.
