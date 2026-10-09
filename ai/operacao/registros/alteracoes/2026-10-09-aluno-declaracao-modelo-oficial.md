# Declaração do aluno com o modelo institucional

Versão: 4.8.194. Base: 342d514ba58b4333b4e19e6316882b860e11fbf5.
Escopo autorizado: igualar a declaração de matrícula/cursando emitida pelo
próprio aluno ao modelo configurado pela instituição, com download e impressão.

## Causa e comportamento corrigido

O portal do aluno consultava diretamente a tabela de modelos, protegida para
perfis administrativos. Sem acesso ao registro salvo, o serviço devolvia um
modelo padrão: texto reduzido, assinatura ausente e ausência de QR configurado.
O substituidor específico do aluno também omitia o token de nascimento.
A impressão usava o HTML da página, separada do compositor oficial do Gestor.

A RPC `obter_declaracao_matricula_aluno_pdf` autoriza a matrícula ativa do aluno
antes de consultar o modelo, instituição e emissão. Prioriza o modelo global
salvo pelo editor e aceita a chave por polo somente como compatibilidade legada.
Ausência ou configuração inválida gera erro explícito, sem modelo substituto.
Não amplia RLS da tabela de modelos nem permite parâmetros de identidade,
conteúdo, validade ou ator fornecidos pelo navegador.

A emissão usa a função canônica existente, incluindo elegibilidade, validade e
idempotência. Reabrir consulta o modelo atual sem alterar código, datas,
contadores ou snapshot de uma emissão existente. A resposta contém somente os
dados necessários à declaração e os recursos institucionais do próprio polo.

O aluno utiliza `createDeclarationDocumentsPdf`, o mesmo compositor do Gestor.
Texto, identificação e nascimento passam pelo parser oficial; posições,
assinatura, QR, marca d'água e cabeçalho atravessam o payload configurado.
Prévia, Baixar PDF e Imprimir reutilizam o mesmo Blob. A tela apresenta estado
de preparação, erro e nova tentativa, em desktop e mobile. Fechamento e troca
de aluno, matrícula ou contexto invalidam resultados assíncronos anteriores.
O fluxo de IRPF e os demais documentos não são substituídos neste lote.

## Validação e estado de entrega

- SQL isolado: oito subtestes e a suíte aprovados, nove resultados PASS.
  Cobertura de propriedade da matrícula, RLS de modelos, identidade, prioridade
  global, atualização do modelo, idempotência, configuração inválida e grants.
- ESLint dos três arquivos de implementação aprovados.
- Navegador: cinco testes aprovados, incluindo texto completo, identidade do
  Blob em prévia/download/impressão, modelo atualizado, erros e mobile.
- Modelo real obtido pela RPC com identidade autorizada, renderizado com aluno
  sintético e recursos institucionais reais: três parágrafos, nascimento, CIN,
  assinatura, QR, fundo e posições conferidos no PDF e na página renderizada.
  A consulta preservou o hash do snapshot anterior da emissão.
- Advisors antes/depois: somente o aviso esperado da nova RPC SECURITY DEFINER
  executável por authenticated; propriedade da matrícula e identidade são
  conferidas antes da leitura, search_path vazio e acesso anônimo negado.
- Migration aplicada via MCP Supabase em 2026-10-09, com o nome imutável
  `20261009173251_student_enrollment_declaration_pdf.sql`.
- CI, Preview e publicação ainda pendentes.

Limitação: Safari autenticado e impressora física não estão disponíveis.
O checkout é seletivo; checagens globais dependem do CI. Testes controlados usam
dados sintéticos; artefatos PDF/PNG, dumps e dados pessoais não são publicados.
A entrada 4.8.111 do changelog foi arquivada integralmente, preservando o histórico
e o teto de 500 linhas do arquivo principal.

## Manifesto explícito

Total: 15 arquivos. Migration alinhada ao registro remoto de aplicação.

- `.github/workflows/document-identity-history.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-aluno-declaracao-modelo-oficial.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versao-4-8-111.md`
- `internal/versioning/system-version.json`
- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/aluno/secretaria/aluno-declaration.service.ts`
- `modules/aluno/secretaria/components/AlunoDeclarationDialog.tsx`
- `modules/aluno/secretaria/aluno-declaration.browser.fixture.mjs`
- `modules/aluno/secretaria/aluno-declaration.browser.test.mjs`
- `supabase/migrations/20261009173251_student_enrollment_declaration_pdf.sql`
- `supabase/tests/student_declaration_pdf.isolated.test.mjs`
- `supabase/tests/fixtures/student-declaration-boundaries.sql`
