# Transcrição dos diários T41 e T42

Estado: schema aplicado; publicação compatível antes da transcrição operacional.

## Problema e resultado pretendido

A importação anterior guardou documentos em um histórico separado. O diário normal e a grade continuaram sem aulas. Esta correção materializa os mesmos registros nas tabelas acadêmicas existentes, preservando o documento como evidência.

- 12 diários T41 e dois T42 (Anatomia e Ética).
- Datas e conteúdo seguem o quadro de aulas do DOCX. Divergências de dia da semana não impedem a transcrição, conforme instrução explícita do usuário.
- Horas rateadas proporcionalmente entre os encontros existentes, com ajuste centesimal determinístico para fechar teoria + prática da disciplina; estágio separado.
- Notas, médias, resultados escritos e símbolos de frequência preservados. Instrumentos repetidos ou combinados permanecem identificados pelo documento.
- Campos vazios e traços não viram zero ou presença. Identidades sem correspondência permanecem na fonte, sem nova matrícula presumida.
- Fonte privada imutável, vínculo por célula, transação por documento, fingerprint e replay idempotente.
- Frontend apresenta o resultado das RPCs. Nenhum fechamento, promoção, aproveitamento ou mudança financeira integra a transcrição.

## Validação

- Conferência independente entre OOXML e payload: 14 fontes únicas, cabeçalhos 12 T41/2 T42, 14.829 campos/referências, 122 datas/conteúdos, 3.401 marcações e 1.164 instrumentos sem diferença de extração ou associação de linha.
- Primeiro ensaio SQL de aulas das 14 fontes aprovado com rollback; soma exata T+P, datas, conteúdo, horários ausentes, fingerprints, replay e autorização verificados.
- Três ensaios SQL com rollback aprovados: aulas, notas/frequência e transcrição atômica das 14 fontes. Replay, autorização, projeções e preservação de matrícula/período/financeiro verificados.
- Publicação sobre main 4.8.56 preserva integralmente a entrega paralela do Caixa; versão acadêmica final 4.8.57.
- Onze migrations aplicadas com IDs canônicos; fonte privada preservada.
- Build final 4.8.57, typecheck focal, 12 testes de interface/contrato, 13 testes PDF e check:file-lines aprovados.
- Revisão independente dos contratos de interface e PDF aprovada, com correções de valores ausentes e controles sem autorização de escrita. Prévia sintética renderizada sem cortes, modelo institucional preservado.
- Publicar interface compatível antes de marcar fontes como materializadas; em seguida executar 14 transações e conferir dados e telas autenticadas T41/T42.
- A interface materializada usa o diário normal, sem cards ou banners de histórico/DOCX. Assinatura e fechamento permanecem sujeitos às regras existentes.

## Manifesto explícito

Total: 38 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoBoundary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-documentary.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioDocumentaryContext.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioFrequenciaTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/TurmaDiarioCard.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/turma-diarios.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioExport.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.browser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-documentary.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.utils.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioLocalState.ts`
- `supabase/migrations/20260913123343_diario_lesson_materialization_registry.sql`
- `supabase/migrations/20260913123346_diario_lesson_materialization_preview.sql`
- `supabase/migrations/20260913123349_diario_lesson_materialization_apply.sql`
- `supabase/migrations/20260913123351_diario_grouped_lesson_read.sql`
- `supabase/migrations/20260913123353_diario_documentary_operational_fields.sql`
- `supabase/migrations/20260913123356_diario_documentary_write_guards.sql`
- `supabase/migrations/20260913123359_diario_documentary_materialization.sql`
- `supabase/migrations/20260913123406_diario_operational_materialization_complete.sql`
- `supabase/migrations/20260913123409_diario_documentary_result_projection.sql`
- `supabase/migrations/20260913123412_diario_operational_source_read.sql`
- `supabase/migrations/20260913123415_diario_operational_cards_read.sql`
- `supabase/tests/diario_lesson_materialization.rollback.sql`
- `supabase/tests/diario_documentary_materialization.rollback.sql`
- `supabase/tests/diario_operational_materialization.rollback.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-13-diarios-operacionais.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
