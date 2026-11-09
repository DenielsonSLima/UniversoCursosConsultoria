# Frequência com crédito extra-classe — 09/11/2026

## Pedido e aceite

Mudança crítica acadêmica, Supabase, PDF e publicação. O usuário solicitou três agentes, análise do fluxo e reunião antes de implementar, testes e publicação em produção via GitHub. Confirmou considerar somente atividades criadas pelo botão extra-classe e a situação da matrícula na data da atividade, preservando crédito anterior à saída.

Frequência = (horas presenciais − horas de falta + horas extra elegíveis) / (horas presenciais + horas extra elegíveis). Preservar notas, aproveitamentos, dependências, históricos importados e assinados antigos. Nenhuma presença sintética em diario_frequencia; nenhuma inferência pelo título de aula comum.

## Plano e análise antes do patch

1. Três frentes independentes mapearam cálculo canônico, origem das extras/UI e regressões/elegibilidade. Os agentes trocaram achados antes da implementação.
2. Reprodução remota somente leitura: há uma atividade publicada de 4h; a frequência regular e o resultado da matrícula não consultam atividades_extra_classe. Na disciplina afetada existem vinte matrículas ativas com chamada pendente; o patch não pode eliminar essa pendência presencial.
3. Progresso conta PUBLICADA com prazo nulo ou realizado, usando America/Maceio. Data pedagógica = prazo; sem prazo, data local da criação. Rascunhos, arquivadas e futuras ficam fora.
4. Crédito temporal usa movimentos da matrícula; trancamento/transferência/cancelamento/desistência interrompem a partir da data efetiva. Sem movimento que comprove situação anterior, o estado atual é o fallback conservador. Não mudar o roster geral neste lote.
5. Alinhar resultados por disciplina, matrícula e projeção legada sem substituir wrappers de histórico/dependência. Chamada presencial incompleta continua pendente; total_aulas/total_faltas representam sessões reais.
6. Assinatura atual congela somente sessões e valida frequência por elas. Incluir extensão extraClassCredit schemaVersion1 opcional em snapshot2, com atividades e IDs elegíveis por aluno, incorporada ao hash. Ausência conserva o contrato anterior. Não relaxar validade de evidências nem reconstruir modelos.
7. Preservar origem do modelo, capa, contracapa, campos, slots e marca d'água (URL, opacidade, escala e rotação). Mostrar extras no conteúdo/PDF pelo compositor vetorial existente.
8. Testes isolados, comparação de invariantes/ACL e revisão dos três agentes; Preview e build antes do fechamento autorizado em produção. GitHub e Supabase exclusivamente via MCP; publicar somente manifesto explícito.

## Manifesto explícito

- `.github/workflows/extra-class-attendance.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-09-extra-classe-frequencia.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasseTabs.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioConteudoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioExtraClasseConteudo.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.keys.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.client.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.fixtures.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.pdf.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-extra-classe.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.browser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-academic.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-extra-class.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-structure.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioExport.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioExtraClasseCredito.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioRealtime.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaGrade.ts`
- `supabase/migrations/20261109040000_extra_class_attendance_credit.sql`
- `supabase/migrations/20261109040100_extra_class_diary_results.sql`
- `supabase/migrations/20261109040200_extra_class_enrollment_results.sql`
- `supabase/migrations/20261109040300_extra_class_legacy_result_projection.sql`
- `supabase/migrations/20261109040500_validate_diario_extra_class_snapshot.sql`
- `supabase/migrations/20261109040600_freeze_diario_extra_class_credit.sql`
- `supabase/tests/diario_extra_class_snapshot.isolated.test.mjs`
- `supabase/tests/diario_extra_classe.fixture.mjs`
- `supabase/tests/diario_extra_classe.isolated.test.mjs`

Total: 39 arquivos.

## Validação e limitações

21 testes SQL isolados passaram: 12 de cálculo/elegibilidade/ACL/precedência e 9 de snapshot com core e wrappers reais. O patch do congelador foi aplicado isoladamente à definição atual do remoto, preservando OID, ACL, SECURITY DEFINER e search_path. 41 testes Deno distintos e 3 testes Node de leitura/SSR/cache passaram; a execução final focada repetiu 23 Deno e 3 Node. Revisão independente dos três agentes sem bloqueador de código.

PDF nativo de cinco páginas gerado, texto extraído e capa, contracapa, frequência, resultados e conteúdo inspecionados. Presenças/faltas reais, percentuais 75/50 e linha extra 8h corretos; recursos raster somente logos/QR isolados. Modelos, slots e quatro parâmetros da marca preservados pelo mesmo contrato/adapters/compositor. Artefatos temporários não integram o manifesto.

Revisão de desempenho encontrou custo quadrático na projeção legada e corrigiu com JSON materializado uma vez por oferta. Medição isolada sintética com 100 alunos passou de 1075 ms para 9 ms na view; RPC 24 ms. Produção tem uma atividade 4h e 20 matrículas nessa turma. Duas matrículas ingressaram após a atividade; corte por ingresso efetivo acrescentado e testado, preservando movimentos retroativos frente à data de importação.

Os 39 arquivos do manifesto estão abaixo de 500 linhas físicas (índice RAG gerado é exceção). Checker global local encontrou 51 referências históricas ausentes no checkout, fora do manifesto. Typecheck global local foi interrompido por erros de sintaxe em alterações paralelas de DespesasFixasTab/DespesasVariaveisTab; nenhum desses arquivos foi alterado neste lote. CI do candidato confirmou TypeScript global, teto de linhas e contrato operacional. A primeira Preview ficou READY; o lint identificou cinco referências globais apenas nos testes novos, corrigidas para globalThis.structuredClone com lint focado e oito testes aprovados. O candidato final repete a integração antes da implantação, preservando as frentes paralelas.

CUA e a tentativa direta de Safari retornaram Sky Computer Use native pipe startup failed; smoke autenticado visual pendente. SSR, contrato SQL e renderização nativa são evidências separadas e não substituem esse smoke. Não foi aberto outro navegador.

Assinatura preenchida mantém o requisito existente de ao menos uma sessão presencial real; o lote não cria aula fictícia para disciplinas exclusivamente extra-classe.

## Publicação

Autorizada explicitamente pelo usuário nesta conversa em 09/11/2026, após planejamento e validação. Base remota inicialmente verificada 4.8.276; reconciliada com entrega paralela 4.8.277, main fdd0ce02a0b52aeebd4db7811fa67b2f20f37657. Os 13 arquivos frontend existentes coincidem com a base remota; não há interseção com a entrega paralela. Candidato 4.8.278 em 39 arquivos; nenhum Git/gh/Supabase CLI utilizado.

Sequência aditiva: commit/Preview/CI → migration400 (somente helper/getter novos) → Edge assinatura-eletronica-diario-artefatos com dependências compartilhadas compatíveis e JWT mantido → frontend compatível → resultados 401–403 → validação 405 e congelador 406 → leituras reais e confirmação dos artefatos/ACL/ledger. Sem recalcular assinados, notas ou chamadas persistidas. A publicação final e os recibos sanitizados serão registrados após as operações.
