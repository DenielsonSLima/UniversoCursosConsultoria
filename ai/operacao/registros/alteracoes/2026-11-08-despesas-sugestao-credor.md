# Sugestão da última despesa por credor

Data: 08/11/2026. Mudança no formulário financeiro, isolada do lote NFS-e paralelo.

## Objetivo e aceite

Selecionar um credor em despesas fixas ou variáveis sugere categoria ativa,
descrição e valor-base do último lançamento não excluído/cancelado do mesmo
credor, polo e tipo. Último significa cadastro mais recente (`created_at`, com
desempate por ID), independentemente do filtro de vencimento da listagem.
Campos editados manualmente são preservados, inclusive durante a consulta.
Trocar o credor remove somente sugestões automáticas anteriores. Datas,
baixa/pagamento, encargos, parcelas, rateio, convênio e anexos não são copiados.
O modo inicial continua pendente; escolhas explícitas do usuário continuam válidas.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormCoreFields.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-sugestao.model.ts`
- `modules/gestor/financeiro/despesas/components/despesa-sugestao.model.test.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesaSugestao.ts`
- `modules/gestor/financeiro/despesas/despesas-sugestoes.service.ts`
- `modules/gestor/financeiro/despesas/despesas-sugestoes.service.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-08-despesas-sugestao-credor.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/parceiros-nomes-credores.yml`

Total: 12 arquivos.

## Evidência inicial e limites

Formulário atual mantém os três campos independentes de fornecedorId e não
consulta histórico ao selecionar o credor. Fonte remota de DespesaForm conferida
em main antes do patch. Schema e RLS existentes confirmados via MCP somente
leitura: SELECT autenticado usa `is_financeiro_for_polo(polo_id)`; há índice de
fornecedor. Nenhuma migration, mutação financeira ou ampliação de acesso prevista.

## Validação e entrega

12 testes comportamentais/contratuais aprovados, lint dos arquivos de produto e
TypeScript do caminho afetado sem erros. A consulta equivalente, via MCP somente
leitura, retorna a despesa esperada e seu valor-base. Não houve escrita no banco.
Smoke desktop no Safari concluído: seleção preenche os três campos, mantém datas
e pendente, permite edição e troca para parceiro sem histórico limpa só os dados
automáticos. Em 390 px, seleção, mensagem e campos empilhados conferidos no Chrome,
usado por autorização expressa do usuário devido à navegação concorrente no Safari.
Dados sintéticos isolados; nenhum cadastro ou pagamento de teste em produção.
Também conferido o cache vencido: um histórico antigo sintético com valor 999
não é aplicado enquanto há refetch; somente a resposta atual com valor 120 e
categoria Internet preenche o formulário. O hook espera `isFetching` terminar.

`npm run check:file-lines` executado: falha por fontes auditadas antigas ausentes
no checkout local, sem relação com o patch. O manifesto atual é auditado isoladamente
e tem a verificação completa no checkout remoto de CI. Metadados de release
4.8.269/revisão 278 montados sobre main remoto f715bcb72811256620be032ecacde548c4c3e7fa
para preservar o lote NFS-e paralelo e o histórico. Entrega no PR 363 com Preview;
resultados finais de CI e URL registrados na descrição do PR.

Produção deste novo lote depende de autorização específica após o resultado
concreto e a prévia estarem prontos.
