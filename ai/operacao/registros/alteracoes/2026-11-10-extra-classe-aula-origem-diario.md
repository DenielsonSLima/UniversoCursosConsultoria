# Extra-classe como complemento da aula e diário — 4.8.284

## Objetivo e aceite

Pedido de 10/11/2026: exigir aula de origem ao criar/editar extra-classe, apresentar como complemento/subaula e manter a ordem de data na grade e no diário. Remover a página final de instruções e substituir o retângulo dos títulos internos do diário por texto no estilo da página de validação. Ajuste posterior solicitado: retirar “DIÁRIO DE CLASSE” do topo e apresentar essa identificação discretamente no rodapé inferior direito. Preservar capa, validação/assinatura, modelo e marca d'água. GitHub e produção expressamente solicitados.

## Coordenação e escopo

Três agentes solicitados: interface/vínculo, diário/PDF e banco/contrato. Alinhamento: `aula_origem_id`, `p_aula_origem_id` e `aulaOrigemId`; ordenação e identificação do complemento vêm do payload canônico. Lote independente do piloto NFS-e em andamento, cujos arquivos e registro ativo são preservados. Sem inferência genérica de origem para o legado.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaGrade.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade-sync.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeModulo.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradePlanejamentoForm.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeAtividades.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeAtividadeEditor.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-aula-origem.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.utils.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-errors.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/useTurmaGradePlanoCursoPreview.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradePlanejamento.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.interaction.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioConteudoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioExtraClasseConteudo.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-content-order.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.fixtures.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.client.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.pdf.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-heading.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-layout.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-extra-class.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-academic.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios-template-defaults.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioTextSettings.tsx`
- `modules/gestor/secretaria/shared/canonical-institutional-header-pdf.ts`
- `supabase/migrations/20261110184000_extra_class_lesson_origin.sql`
- `supabase/migrations/20261110184100_extra_class_diary_chronology.sql`
- `supabase/migrations/20261110184200_extra_class_snapshot_chronology.sql`
- `supabase/migrations/20261110184300_diary_remove_instructions.sql`
- `supabase/tests/extra_class_lesson_origin.isolated.test.mjs`
- `supabase/tests/diario_extra_class_snapshot.isolated.test.mjs`
- `supabase/tests/extra_class_lesson_origin.rollback.sql`
- `.github/workflows/extra-class-attendance.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-10-a-13-versoes-4-8-208-a-214.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-10-extra-classe-aula-origem-diario.md`

Total: 49 arquivos.

## Reprodução e validação

Reprodução autenticada no Safari em produção: grade intercalada por data, sem vínculo de origem; diário com todas as aulas regulares antes das extras, cabeçalhos em retângulo e última página de instruções. Página de validação existente identificada e preservada.

51 testes focados de grade/interação, 63 testes de diário/modelo/PDF e 19 testes SQL isolados aprovados. TypeScript e build completo com Node 24.22.1 aprovados. PDF nativo de QA com modelo e marca reais: capa, validação e conteúdo renderizados, texto extraído e recursos isolados conferidos; sem instruções e com complemento intercalado. Todos os 49 arquivos do manifesto têm até 500 linhas (máximo 494).

A revisão independente acrescentou invalidação do crédito/cronologia após editar aulas ou complementos e guarda legível contra exclusão/recriação de sessão referenciada. Ação `VINCULAR_ORIGEM` altera somente vínculo de legado, incluindo respondidas, com autorização e revisão otimista.

Usuário autorizou rever todos os sete lançamentos existentes. Conteúdo e datas comprovam as seis correspondências de Anatomia nas capturas. Para Informática Básica, o responsável confirmou expressamente a origem em 12/09/2026. Correção será feita por RPC, com pré-condições e comparação de conteúdo, respostas, frequência e crédito.

O comando global local de teto encontrou somente o manifesto do piloto NFS-e paralelo ainda não registrado; ele não pertence a esta entrega. A publicação usa o registro remoto vigente acrescido apenas deste manifesto, preservando o lote local de NFS-e. CI e Preview do commit exato validarão esse registro isoladamente.

Teste adicional do rodapé aprovado: ausência da identificação no cabeçalho e posição vetorial no canto inferior direito. Artefatos temporários e fontes do piloto fiscal não integram a publicação.

## Operação remota

PR 378, commit de produto `84c8aa95270c060f9625db432b34b5ef158c5e71`: 16 verificações e Preview aprovadas. Produção usa novo build desse mesmo produto com ambiente de produção.

As quatro fontes SQL do manifesto foram aplicadas via MCP. Ledger remoto, na mesma ordem: `20261110184353_extra_class_lesson_origin`, `20261110184356_extra_class_diary_chronology`, `20261110184358_extra_class_snapshot_chronology`, `20261110184400_diary_remove_instructions`. Fontes aplicadas permanecem imutáveis.

Contrato transacional real aprovado com rollback integral. A verificação de ator ausente foi ajustada para limpar tanto o claim individual quanto o JSON de claims, como exige o ambiente remoto; não houve mudança na autorização do produto. RPC operacional confirmou sete vínculos e zero extras sem origem, com comparação antes/depois de conteúdo, respostas, frequência e crédito. A identidade do gestor da sessão foi validada e usada na auditoria, sem alternativa para outro gestor.

Edge `assinatura-eletronica-diario-artefatos` publicada na versão 17, ativa e com JWT obrigatório. Pacote derivado da versão remota 16, preservando quatro diferenças fora deste lote: 61 testes do pacote exato aprovados, sete arquivos do compositor conferidos contra a fonte final. Modelos Técnico, Livre e Especialização com instruções desativadas. Os cinco tipos de avisos de segurança preexistentes permaneceram iguais.

Smoke autenticado final do site em conferência. Documentos já assinados e seus snapshots não foram reescritos.
