# Diário: O opcional e precisão das médias

Pedido de 10/10/2026. As notas estavam salvas, mas a função canônica devolvia média nula quando O estava ativo e vazio. O usuário confirmou O opcional por aluno, sem transformar ausência em zero, e cálculo no backend. A soma preserva duas casas decimais, até 10; os demais instrumentos ativos continuam obrigatórios. Nenhuma nota ativa preenchida permanece sem lançamento.

## Aceite e escopo

- Somar P=5 e TI=4,5 com O vazio: 9,5; O preenchido participa da soma.
- Preservar 4,75 e nota zero explícita; campos vazios permanecem nulos.
- Reutilizar cálculo canônico em diário, resultados e fechamento.
- Interface informa opcionalidade e salvamento ao sair do campo, sem cálculo local de médias.
- Validador do snapshot fechado acompanha o contrato; modelos, compositor e histórico documental preservados.

## Validação

Reprodução em produção por consulta somente leitura confirmou notas persistidas e média nula. Reprodução SQL: 5 + 4,5 + O vazio = NULL; com O=0, resultado 9,5. Soma 1,25 + 3 + 0,5 retornava 4,8. Teste de interface novo falhou antes do patch e passou depois. Quatro testes SQL isolados em PGlite0.3.16 passaram, cobrindo helper, fechamento, view, zero explícito, ausência de notas, precisão, créditos, guardas existentes, permissões e preservação documental. Quatro testes da interface e seis do contrato de snapshot passaram. O contrato aceita o arredondamento de snapshots antigos, mantendo os dados congelados. Revisão independente do banco aprovada. TypeScript e build aprovados. A consulta de impacto encontrou apenas duas médias antes nulas que serão liberadas, sem notas persistidas alteradas. Publicação e migration serão verificadas no fechamento remoto. Conferência visual com o usuário conforme orientação anterior; não foi executado smoke autenticado.

## Manifesto explícito

Total: 13 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-resultado-instruments.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.validation-academic.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-snapshot-contract.test.ts`
- `supabase/migrations/20261010223000_diario_optional_o_and_precision.sql`
- `supabase/tests/diario_optional_o_and_precision.rollback.sql`
- `supabase/tests/diario_optional_o_and_precision.isolated.test.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-diario-o-opcional.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
