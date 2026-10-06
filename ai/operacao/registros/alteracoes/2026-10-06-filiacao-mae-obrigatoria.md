# Filiação — somente mãe obrigatória — 4.8.175

## Pedido e aceite

O responsável pediu que somente o nome da mãe seja obrigatório na filiação,
com revisão por três agentes e publicação em produção.
Base main `c5315f327f48429a3a09314215aadee01d8b3ef2`, versão 4.8.174.
Aceite: mãe continua obrigatória para ingresso técnico; pai vazio não gera
pendência cadastral nem impede matrícula técnica. Dados pessoais e endereço
mantêm as validações anteriores. Cadastro gradual inicial permanece preservado.

## Reunião técnica e correção

- Interface: formulário do gestor e perfil do aluno apresentam pai opcional e
  explicitam a exigência do nome da mãe para matrícula técnica.
- Regra cliente: checklist mínimo técnico deixa de exigir o nome do pai;
  ausência da mãe permanece bloqueante.
- Regra canônica: RPC de ingresso remoto também exigia pai. Migration aditiva
  preparada remove somente essa exigência, mantendo permissões e demais regras.
  Projeto Supabase confirmado pelo endpoint usado no frontend de produção;
  migration aplicada via MCP como `20261006172335`, com função remota conferida
  byte a byte e assinatura/ACL preservadas. Contrato instalado aprovado.
- Publicação: versão/revisão avançam; manifesto incremental e Preview precedem
  produção. GitHub e Supabase remotos exclusivamente via MCP.

## Manifesto explícito

- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepFamily.tsx`
- `modules/aluno/perfil/usePerfilDadosForm.ts`
- `modules/shared/utils/technicalEnrollmentRequirements.ts`
- `modules/shared/utils/technicalEnrollmentRequirements.test.ts`
- `.github/workflows/quality-gates.yml`
- `supabase/migrations/20261006172335_make_technical_father_name_optional.sql`
- `supabase/tests/technical_father_name_optional.rollback.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-06-filiacao-mae-obrigatoria.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`

Total: 13 arquivos.

## Validação e limites

Manifesto fechado por paths explícitos, com todas as fontes materializadas.
Frontend: 8 testes focados e matriz de 20 casos aprovados com dados sintéticos.
Controle de versão local aprovado; histórico anterior preservado; arquivos
manuais atualmente no manifesto respeitam o teto de 500 linhas.
Migration de 213 linhas aplicada e conferida. Teste SQL pós-aplicação aprovado
em transação/rollback: trecho exato de validação da RPC instalada com fixtures
em memória, mãe obrigatória, pai opcional, CPF e guardas de requestId/autorização.
Não cria matrícula completa; smoke desse fluxo autenticado permanece pendente.
CI completo, Preview e publicação em andamento.
Workflow inclui a regressão de filiação em Deno, sem alterar os gates anteriores.
RAG reindexado explicitamente após fechamento do lote: 15 fontes e 80 trechos;
status local ATUAL. A segunda geração atualiza a nova evidência da migration aplicada.
Smoke visual/autenticado Safari pendente: esta sessão não oferece Safari
autenticado. A conferência técnica não comprova o fluxo visual em produção.
Não são usados dados reais de alunos nas regressões.
