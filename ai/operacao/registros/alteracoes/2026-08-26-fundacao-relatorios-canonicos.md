# Fundação canônica do módulo de Relatórios

Data: 2026-08-26
Estado: RPCs aplicadas e validadas em produção; frontend local aguarda publicação e smoke visual

## Objetivo

Criar a fundação segura para corrigir o módulo de Relatórios sem calcular regras de negócio no frontend. Padronizar a prévia, o download e a impressão no mesmo PDF vetorial institucional e migrar os relatórios de Turmas e de Alunos Acadêmicos para respostas autoritativas do backend.

## Evidência reproduzida

- O inventário encontrou rotas antigas que ainda calculam dados no navegador ou chamam `window.print()` diretamente, enquanto os relatórios financeiros mais novos já compartilhavam um fluxo de exportação.
- O relatório de Turmas selecionava `turmas.data_fim`, coluna inexistente no contrato atual; a coluna canônica é `data_previsao_termino`.
- A consulta remota somente leitura confirmou 27 matrículas na base observada: 25 `PENDENTE`, 2 `DESISTENTE`, 0 `ATIVO` e 0 `CONCLUIDO`. Nenhuma matrícula foi promovida para igualar indicadores visuais.
- O Extrato Financeiro por Conta vazio antes da seleção de uma conta é um estado intencional, não ausência de dados gerais.
- A ação “Imprimir / PDF” das rotas legadas abria a impressão do navegador antes de oferecer uma prévia interna consistente.

## Decisões

- O frontend envia intenção e filtros e apresenta a resposta. Totais, classificação, status, filtros aplicados, ordenação, paginação e motivo de vazio pertencem às RPCs.
- `PENDENTE`, `ATIVO`, `DESISTENTE` e `CONCLUIDO` permanecem situações distintas; `CURSANDO` consulta somente `ATIVO` e `FINALIZADOS` somente `CONCLUIDO`.
- Os contratos rejeitam payload incompleto ou inconsistente em vez de transformar falha em lista vazia.
- CPF sai mascarado do backend e dados acadêmicos sensíveis não são devolvidos fora do modo que realmente os utiliza.
- Prévia, download e impressão reutilizam exatamente o mesmo `Blob` PDF. A interface não chama a impressão do Safari diretamente.
- O PDF usa o cabeçalho institucional e a marca d’água configurados em Modelos Documentos. Na ausência de marca configurada, usa um símbolo visual sutil da Universo, sem texto selecionável falso.
- Imagem legada sem opção explícita de rotação não recebe rotação implícita. Falha ao carregar uma logo configurada é exibida como erro, não ocultada por substituição silenciosa.

## Escopo entregue localmente

- Modal genérico acessível de prévia PDF, com download e impressão do mesmo arquivo.
- Compositor financeiro vetorial nativo compartilhado pelos relatórios que já usam `FinancialReportExportButton`.
- Relatório de Turmas migrado para `get_relatorio_turmas_secure`.
- Relatórios acadêmicos compartilhados migrados para `get_relatorio_alunos_academicos_secure`: Cursando, Finalizados, Situação do Aluno e o wrapper de Matrícula Inicial.
- Contratos de resposta estritos, testes de regressão e RBAC explícito para escopo global ou por polo.

## Escopo ainda legado

Esta fundação não declara o catálogo inteiro como migrado. Permanecem para teste e correção individual as rotas antigas de Cursos, Polos, Estágios, DRE, Matrículas, Diagnóstico Censo/Matrícula Inicial, Financeiro por Turma/Mês, Pré-estágio e Lucro por Turma, além de qualquer fluxo legado que ainda calcule ou imprima no navegador.

## Publicação

- Aplicação autorizada pelo responsável em 2026-08-26.
- `20260827000401_create_secure_classes_report`: aplicada via MCP Supabase.
- `20260827000431_create_secure_academic_students_report`: aplicada via MCP Supabase.
- Nenhum dado acadêmico foi alterado; as migrations criam somente as duas funções de consulta, seus grants mínimos, comentários e a notificação de recarga do schema.
- O frontend deste lote ainda não foi publicado no GitHub/Vercel. Depois dessa publicação, o smoke visual autenticado ficará a cargo do responsável, que testará cada relatório individualmente no navegador.

## Manifesto explícito

Total: 25 arquivos

- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-26-fundacao-relatorios-canonicos.md`
- `modules/gestor/cadastros/modelos-documentos/cabecalho-institucional/cabecalho-institucional.contract.test.ts`
- `modules/gestor/financeiro/components/FinancialReportPreview.tsx`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.fallback.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.layout.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.resources.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.test.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.ts`
- `modules/gestor/financeiro/components/financial-report.vector-pdf.types.ts`
- `modules/gestor/relatorios/components/RelatorioAlunosAcademicos.tsx`
- `modules/gestor/relatorios/components/RelatorioTurmas.tsx`
- `modules/gestor/relatorios/pdf/ReportPdfPreviewModal.tsx`
- `modules/gestor/relatorios/services/relatorio-alunos-academicos.contract.ts`
- `modules/gestor/relatorios/services/relatorio-alunos-academicos.service.test.ts`
- `modules/gestor/relatorios/services/relatorio-alunos-academicos.service.ts`
- `modules/gestor/relatorios/services/relatorio-turmas.contract.ts`
- `modules/gestor/relatorios/services/relatorio-turmas.service.test.ts`
- `modules/gestor/relatorios/services/relatorio-turmas.service.ts`
- `modules/gestor/secretaria/shared/canonical-document-vector-pdf.core.ts`
- `scripts/test-financial-report-pdf.mjs`
- `scripts/test-selectable-pdf-exports.mjs`
- `supabase/migrations/20260826230000_create_secure_classes_report.sql`
- `supabase/migrations/20260826231000_create_secure_academic_students_report.sql`

## Validação

- Três agentes revisaram separadamente contratos acadêmicos, contrato/RBAC do backend e fidelidade visual dos PDFs; os bloqueadores encontrados foram corrigidos e rechecados.
- Contrato de Turmas: 5/5 testes.
- Contrato de Alunos Acadêmicos: 7/7 testes.
- PDF financeiro vetorial: 9/9 testes.
- Cabeçalho institucional: 9/9 testes.
- Contratos canônicos de documentos: 51/51 testes.
- Inventário de exportações PDF: aprovado, sem novo pipeline raster.
- ESLint focado no manifesto TypeScript/TSX: aprovado.
- TypeScript completo com heap ampliado: aprovado.
- Build Vite de integração: aprovado; permaneceu somente o aviso histórico de chunks acima de 500 kB.
- Todos os arquivos manuais do manifesto ficaram abaixo de 500 linhas.
- `npm run check:file-lines` reconheceu o manifesto deste lote e suas duas migrations aplicadas, mas o comando global ainda termina com uma falha operacional preexistente: `ai/operacao/LOTE_ATIVO.md`, pertencente ao lote paralelo de carnês, não declara o ponteiro `Manifesto explícito`. Esse lote paralelo não foi alterado nem misturado a esta publicação.
- Whitespace/diff check focado: aprovado.
- Ledger remoto confirmado nas versões `20260827000401` e `20260827000431`.
- As duas funções estão `STABLE`, `SECURITY DEFINER` e com `search_path` vazio; `PUBLIC` e `anon` não possuem `EXECUTE`, enquanto `authenticated` e `service_role` possuem o grant intencional protegido pelas guardas internas de módulo e polo.
- Smoke direto como `service_role`: Turmas devolveu 64 turmas em andamento, sendo 63 EAD e 1 Técnico; Situação do Aluno devolveu 27 matrículas, sendo 25 `PENDENTE`, 2 `DESISTENTE`, 0 `ATIVO` e 0 `CONCLUIDO`.
- O Security Advisor sinaliza as duas funções por serem `SECURITY DEFINER` executáveis por `authenticated`; o aviso foi revisado e é intencional neste contrato, pois ambas usam `search_path` vazio, grants mínimos e autorização interna por identidade, módulo e polo conforme a política do projeto.
- O Performance Advisor não apresentou aviso relacionado às duas novas funções.
- Smoke visual autenticado: delegado ao responsável para a conferência relatório por relatório no navegador, depois da publicação separada do frontend.
