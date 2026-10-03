# Renegociações — listagem, filtros e seleção expansível

## Objetivo e autorização

Corrigir a listagem presa em carregamento/HTTP 500, padronizar as abas internas, incluir filtros por tipo de curso e turma e permitir seleção de uma ou várias parcelas sob agrupamento expansível por aluno.

Em 03/10/2026, o usuário pediu três agentes e confirmou: “Sim, aplicar e publicar após os testes”. A autorização não inclui emissão, cancelamento ou baixa de cobranças. Mantida a escolha anterior de continuar sem teste no navegador.

Classificação: mudança crítica financeira, com Supabase e publicação. LOTE_ATIVO e frentes paralelas Proesc/Caixa preservados; este registro delimita a entrega.

## Etapas e aceite

1. Dados: reproduzir o erro e substituir a listagem cara por resumo nominal paginado por aluno.
2. Interface: reutilizar FinancialUnderlineTabs e seletores pesquisáveis no padrão do Financeiro.
3. Seleção: aluno → matrícula/turma → parcelas, detalhe sob demanda e seleção transferida ao modal fullscreen.
4. Integração: filtros no servidor e cache, erro recuperável, testes, revisão cruzada e publicação restrita.

Uma proposta continua limitada ao mesmo aluno, matrícula, turma e polo. Não misturar alunos nem políticas financeiras distintas. Frontend não calcula valores ou aprova elegibilidade.

## Diagnóstico e correção

- Logs reais: seis respostas 500 correlacionadas a seis timeouts na RPC v1 no intervalo das capturas.
- Consulta antiga: 14.393,87 ms para 2.904 títulos/382 matrículas; limite autenticado de 8 s. A elegibilidade era calculada por parcela antes da paginação.
- Consulta equivalente v2, somente leitura antes da aplicação: 131,998 ms, sem blocos temporários.
- RPC v2 aplicada, verificação READ ONLY com papel de servidor: 52,47 ms, 39 alunos, 20 grupos na primeira página, três opções de turma e payload de 15.292 bytes. Esta medição não equivale a teste autenticado no navegador.
- Listagem agora pagina alunos, preservando as matrículas do aluno na mesma página; opções de turma não dependem da página/busca.
- Resumo informa saldo nominal e elegibilidade pendente. Encargos e bloqueios permanecem desconhecidos até a consulta canônica do detalhe.
- Detalhe somente ao expandir a matrícula. Conferência, prévia e salvamento preservam as regras existentes.
- Chaves de consulta isolam polo, página, busca, curso e turma. Leituras têm prazo finito, cancelamento e erro com nova tentativa; sem repetição automática dos candidatos/detalhes.
- Tipos inicialmente suportados permanecem Técnico, Livre e Especialização. EAD é sinalizado como fora do escopo; Proesc, pagamento parcial e proveniência incompatível não são incluídos silenciosamente.

## Manifesto explícito

- `modules/gestor/financeiro/renegociacoes/RenegociacoesTab.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateStudentCard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateEnrollment.tsx`
- `modules/gestor/financeiro/renegociacoes/components/candidateSelection.model.ts`
- `modules/gestor/financeiro/renegociacoes/components/candidateSelection.model.test.ts`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoFilterPicker.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoFilters.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoFilters.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoPanels.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/WizardSteps.tsx`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacoesQueries.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.types.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.candidates.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.candidates.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.read-request.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.service.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.queryKeys.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.presentation.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.contract.test.ts`
- `supabase/migrations/20261003044712_receivable_renegotiation_candidate_listing_v2.sql`
- `supabase/tests/receivable_renegotiation_listing_v2.transaction.sql`
- `supabase/tests/receivable_renegotiation_listing_v2_readonly.sql`
- `scripts/test-renegociacao-listagem-sql.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-10-03-renegociacoes-listagem-filtros.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.test.mjs`

Total: 32 arquivos. Arquivos compartilhados recebem somente o delta deste lote sobre main remoto; alterações locais paralelas não entram na publicação.

## Banco e segurança

Projeto confirmado: Supabase `kfekgwyqozhicpfuunpo`. Migration aplicada via MCP com ledger `20261003044712`; prefixo local sincronizado sem alteração de conteúdo. Fonte aplicada imutável. RPC v1 preservada para compatibilidade.

Nova RPC SECURITY DEFINER intencional, search_path vazio, guarda de identidade/escopo e EXECUTE somente para authenticated/service_role. O advisory correspondente é esperado e foi revisado; não houve alteração de permissões de outras funções.

Fixtures locais cobrem usuário autenticado sintético, escopo global/polo e recusas anon/sem identidade. SQL remoto READ ONLY valida catálogo, grants, escopo e negação. Consulta positiva real usa papel de servidor, sem simular identidade de usuário.

Nenhuma proposta real foi gravada; nenhum título foi emitido, cancelado, baixado ou alterado durante esta correção. Pagamentos e valores financeiros continuam canônicos no backend.

## Validação

- 28 testes Node de navegação, contrato, normalização, filtros, deadline e seleção: PASS.
- Sete testes ReactDOM/jsdom de abas, seletores, agrupamento, seleção, lista → modal real e pilha de foco: PASS.
- Modal preserva uma ou N parcelas selecionadas, confere a identidade completa, bloqueia avanço em erro e remove seleção que perdeu elegibilidade após atualização.
- PGlite: 1.000 alunos/12.000 parcelas; filtros, paginação por aluno, parser real, ACL, origem e ausência de N+1: PASS.
- Regressão SQL com regras reais de propostas: PASS.
- Novo SQL readonly no Supabase e chamada positiva v2: PASS.
- TypeScript completo e build integrado: PASS; warnings preexistentes de chunks/importação permanecem.
- Revisão cruzada das três frentes não identificou Critical/Important aberto. Rótulo do filtro de turma permanece durante loading/erro e pode ser limpo para recuperação.
- Manifesto manual limitado a 500 linhas por arquivo; auditoria final/CI valida o snapshot restrito.
- Checagem global local encontra 14 referências antigas ausentes fora deste manifesto; preservadas sem reconstrução ou remoção. CI valida o repositório remoto completo.

Comandos adicionais reproduzíveis, com dependências temporárias e sem alteração do lockfile:

```sh
PGLITE_MODULE_PATH=/caminho/pglite/dist/index.js node scripts/test-renegociacao-listagem-sql.mjs
RENEGOCIACAO_JSDOM_PATH=/caminho/jsdom node --test modules/gestor/financeiro/renegociacoes/components/CandidateGroups.test.mjs modules/gestor/financeiro/renegociacoes/components/RenegociacaoFilters.test.mjs
```

Smoke visual autenticado: não executado, conforme escolha explícita do usuário. Testes DOM não comprovam renderização final no Safari. Este limite permanece registrado e não é ocultado pelo build.

## Publicação e limites

Versão alvo final: 4.8.157, revisão 166. A prévia 4.8.155 passou no CI, mas main avançou para 4.8.156 durante a validação. Conciliação sobre a nova base preserva integralmente a entrega Proesc, atualiza somente os quatro arquivos compartilhados e mantém este manifesto de 32 arquivos. Sem reescrever histórico: commit de conciliação na branch, novo CI/Preview e squash atômico na promoção autorizada. Resultado final registrado no PR.

O incremento continua sendo de propostas: não ativa acordos nem cancela parcelas originais. Aprovação/aceite, substituição bancária e acompanhamento de quitação real permanecem fora deste lote.

As skills específicas orientaram a preservação do padrão visual, seletores canônicos, separação entre resumo e cálculo financeiro, teste SQL isolado e publicação por manifesto; não houve redesenho global.
