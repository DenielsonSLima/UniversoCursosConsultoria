# Certificado EAD fiel ao modelo salvo

## Objetivo e causa

Entrega 4.8.187, continuidade autorizada da correção EAD.
O editor e a emissão usavam renderizadores diferentes. O lote anterior
preencheu a grade, mas desviou a tabela configurada para texto genérico,
alterando colunas, fonte e apresentação. A conferência não havia comparado
a emissão com o editor real. A prévia fluida da Secretaria também mudava
a geometria em relação ao A4, e erros de leitura podiam gerar modelo padrão.

Aceite: emissão, prévia e impressão da Secretaria EAD reproduzem o modelo
persistido, com seus blocos, tabela, fontes, imagens e posições.
Outras modalidades conservam seu fluxo.

## Implementação

- EAD compartilha o renderizador de blocos do editor, com substituição literal
  e segura das variáveis. A amostra do editor EAD deixa de simular curso técnico.
- Modelo é lido do cadastro persistido, priorizando o ID escolhido no curso.
  Falha, ausência do ID ou catálogo sem EAD bloqueiam prévia/download.
  Secretaria e histórico atualizam a leitura na abertura, sem modelo genérico.
- Prévia da Secretaria usa A4 fixo com escala visual proporcional. A impressão
  restaura escala 1:1, oculta controles e mantém texto/tabela selecionáveis.
- Backend acrescenta snapshot eadCurriculumTable v2: componentes, carga, status
  e páginas. A UI somente apresenta os dados; não calcula carga ou nota.
- Carga por módulo só aparece quando o cronograma é coerente com o total oficial.
  Auxiliar Administrativo: seis componentes de 20h, total 120h.
  Eletricista: cadastro soma 162h versus 160h oficiais; carga por componente
  fica desconhecida, sem rateio inventado ou alteração do cadastro.
- Status Concluído depende do progresso persistido. Nota global da prova não
  vira nota de cada módulo. Segunda via usa o snapshot da validação e não
  mistura fontes quando o documento está incompleto.
- Emissão nova grava v1 e v2; reutilização preserva o documento congelado.
  Helper privado complementa v2 apenas quando v1, identidade e curso conferem.

## Manifesto explícito

- `.github/workflows/ead-automatic-certificate.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-08-ead-modelo-fiel.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaBlockContent.tsx`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaPreview.tsx`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.model.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/gestor/secretaria/certificados/certificados.types.ts`
- `modules/gestor/secretaria/certificados/components/CertificadoPreview.tsx`
- `modules/gestor/secretaria/certificados/components/EadCertificateBlock.tsx`
- `modules/gestor/secretaria/certificados/components/EadCertificateScaledPreview.tsx`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-curriculum.test.mjs`
- `modules/gestor/secretaria/certificados/components/ead-certificate-curriculum.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-layout.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-template.test.mjs`
- `modules/gestor/secretaria/certificados/ead-certificate-model.test.mjs`
- `modules/gestor/secretaria/certificados/ead-certificate-model.ts`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.test.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`
- `modules/gestor/secretaria/certificados/usePersistedEadCertificateTemplates.ts`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `modules/gestor/secretaria/historico-emissoes/ead-emission-template.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `supabase/migrations/20261008210000_build_ead_certificate_table.sql`
- `supabase/migrations/20261008210010_snapshot_table_on_ead_issue.sql`
- `supabase/migrations/20261008210020_complete_missing_ead_table.sql`
- `supabase/tests/ead_certificate_table.isolated.test.mjs`
- `supabase/tests/fixtures/ead-certificate-test-harness.mjs`

Total: 37 arquivos. Assets reais, dados pessoais, identificadores,
inventários e plano exato de manutenção ficam fora do repositório.

## Validação e revisão

- Três agentes: backend, interface e revisão independente.
- SQL isolado com migrations reais: 8 casos novos da tabela, 10 de currículo
  anterior e 11 de emissão/autorização, com o novo emissor aplicado em todos.
- Contratos de apresentação, variáveis literais, modelo persistido e serviço
  real do histórico; cobertura de ID por curso, atualização e leitura falha.
- Interface real da Secretaria: aprovação automática, ações bloqueadas na
  ausência do modelo, atualização na abertura e fluxo técnico preservado.
- Navegador/PDF: 5 casos sintéticos e 5 com modelo persistido inventariado,
  assets reais e identidade sintética. Comparação editor/emissão de geometria,
  fontes, conteúdo, QR e imagens; prévia real da Secretaria desktop e móvel.
- Impressão da Secretaria exercitada com CSS do produto, sem CSS substituto
  no teste. Duas páginas A4, extração de texto e inspeção visual de frente/verso.
- O modelo cadastrado não é alterado. Sem sessão autenticada real de usuário;
  consultas controladas são simuladas nos ensaios visuais.
- O bridge de download preexistente do aluno não é reescrito neste lote.
- Manutenção exata de dois registros ensaiada com rollback, replay sem escrita
  e recusa de inventário divergente. v1, código, datas e contador preservados.
- CI, manifesto/linhas, build e Preview devem aprovar o commit antes da produção.

## Complemento controlado e publicação

1. Conferir CI/Preview e drift das funções já publicadas.
2. Aplicar migrations novas 210000, 210010 e 210020, na ordem.
3. Completar somente v2 dos dois certificados inventariados em transação.
4. Verificar paridade certificado/validação, seis linhas, identidade e emissão
   única; curso, progresso e demais campos permanecem iguais.
5. Integrar a branch e conferir implantação e versão pública 4.8.187.

Backup das definições e ACL fica no inventário privado. Reversão de software
usa nova migration para restaurar o emissor anterior; não apaga nem reemite
documentos. Resultado de CI, manutenção e produção é confirmado na entrega.

