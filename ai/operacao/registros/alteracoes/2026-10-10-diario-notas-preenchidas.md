# Diário: notas preenchidas e frequência compacta

Regra esclarecida pelo usuário em 10/10/2026: qualquer instrumento avaliativo vazio fica fora da soma, não apenas O. Zero precisa ser lançado explicitamente. A implementação anterior exigia os demais instrumentos e foi reproduzida por leitura em produção: todos ativos, P=5 e os demais vazios retornava NULL.

## Aceite e escopo

Backend calcula a soma das notas ativas preenchidas em P/TI/TG/S/CQ/O, com limite10 e duas casas decimais. Qualquer nota zero é válida; todos os instrumentos ativos vazios mantêm média nula. Instrumentos anulados não participam. Nenhuma nota é preenchida artificialmente. Recuperação, frequência, aproveitamentos e autorização mantêm suas regras. Fechamento já consulta o helper canônico. Snapshot valida campos opcionais e conserva médias legadas congeladas; frontend não passa a calcular a média exibida.

A frequência tinha limite de dez períodos por bloco, separando 18/07 das cinco datas anteriores. O compositor passa a doze períodos com encontros inteiros; identificação do aluno ocupa 84 mm e cada período ocupa o saldo disponível. Continuação por quantidade de alunos permanece. Modelo salvo, capa, contracapa, marca-d’água e assinaturas são preservados. A Edge de artefatos deve receber o mesmo compositor e validador do lote.

## Validação

25 testes focados passaram (3 SQL isolados, 4 interface, 6 snapshot, 10 fronteira do compositor, 2 paginação), além de TypeScript, build completo e contrato operacional. Revisão independente aprovou a regra das notas e as duas páginas de frequência renderizadas: seis datas M/T juntas, nomes/matrículas íntegros e continuação correta de 20 alunos. Migration4.8.204 já aplicada permanece imutável. Nova migration somente substitui o helper; nenhuma nota real é escrita. Smoke visual fica com o usuário conforme orientação anterior.

## Manifesto explícito

Total: 15 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-resultado-instruments.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-academic.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-snapshot-contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-frequency-layout.test.ts`
- `supabase/migrations/20261010224500_diario_sum_filled_instruments.sql`
- `supabase/tests/diario_sum_filled_instruments.rollback.sql`
- `supabase/tests/diario_sum_filled_instruments.isolated.test.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-diario-notas-preenchidas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
