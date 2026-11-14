# Caixa: PDFs e retorno da criação de crédito

Data: 14/11/2026. Classificação: mudança crítica de apresentação financeira/PDF.
Status: publicação 4.8.340 autorizada pelo usuário em 14/11/2026; gates da base limpa e revisão em andamento. Sem mutação financeira ou de banco.

## Pedido e aceite

Executar em sequência: incluir Serviços NFS-e em Origem das entradas / Receitas recebidas por modalidade no PDF completo; manter o resumido no mesmo padrão visual; depois corrigir o clique sem retorno na criação de link bancário em Outros Créditos.

Aceite: origens e valores canônicos completos; serviços identificados inclusive zerados; resumo de duas páginas com cartões, composições, fontes, cores, cabeçalho e marca comuns ao completo; validações visíveis e link retornado disponível para copiar; preservar idempotência e modos locais/PDV.

## Diagnóstico e implementação

- Reproduzido no Safari autenticado: completo de novembro/2026 mostrava apenas quatro modalidades. Payload já possui Serviços NFS-e; não é necessário alterar banco/RPC. O grupo representa recebimento confirmado vinculado a NFS-e de serviço autorizada em produção, não o mero valor emitido.
- Completo passa a desenhar todas as origens canônicas sem filtro fixo. Painel vetorial compartilhado dimensiona as linhas e mantém contagem/valor, com origem fiscal indicada em serviços.
- Resumido reutiliza a mesma página de indicadores/composições do completo e o mesmo painel de origens. Segunda página mantém agregados e posições complementares em cartões do padrão comum. Nenhum cálculo financeiro foi transferido ao frontend.
- Contexto compartilhado preserva logo, cabeçalho canônico e URL/opacidade/escala/rotação da marca paisagem. Os dois tipos continuam no mesmo Blob de prévia/download.
- Validação de crédito chamava `toast.warning`, método inexistente em `useToast`, causando exceção de evento. Avisos passam a `toast.info`. O botão do modo link passa a indicar Gerar link bancário e o retorno oferece Copiar link do pagador para a URL recebida. Sem URL, informa indisponibilidade sem inventar destino.

## Manifesto explícito

- `modules/gestor/caixa/report/caixa-report.vector-pdf.summary.ts`
- `modules/gestor/caixa/report/caixa-report.concise-pdf.ts`
- `modules/gestor/caixa/report/caixa-report.summary-parity.test.ts`
- `scripts/test-caixa-report.mjs`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-create.interaction.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-14-caixa-pdfs-e-link-credito.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `.github/workflows/other-credit-cancellation.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versao-4-8-272.md`

Total: 14 arquivos.

## Preservação e limites

Checkout já tinha alterações extensas anteriores, inclusive no Caixa, scripts e registros. Foram preservadas; snapshots dos arquivos de implementação antes desta tarefa ficaram em `/tmp/universo-caixa-20261114/baseline`. O manifesto identifica o trabalho desta demanda, não autoriza publicar integralmente todos os diffs preexistentes desses arquivos.

Nenhuma emissão de NFS-e, cobrança bancária, baixa, alteração de saldo ou operação remota foi executada. Revisão automática bloqueou clique em Salvar crédito no formulário real por poder criar recebível/cobrança; o fluxo de criação é validado com serviços sintéticos. Produção depende de pedido explícito e de manifesto revisado contra uma base limpa.

## Validação

- 12 testes dos compositores existentes aprovados; 2 regressões novas de origens/paridade aprovadas.
- Teste DOM do modal PDF aprovado: snapshot único, troca de tipo/escopo, descarte de geração antiga e download do mesmo Blob exibido.
- 5 checks DOM da criação de crédito aprovados com hook, modal, seletores, TanStack Query e notificações reais; serviços isolados sem rede. Incluem validação, pending, payload, cópia, erro, retry com mesma chave, ausência de URL, modos locais e transição PDV.
- Renderização Poppler e extração de texto nas duas páginas do resumido conferidas. Recursos: somente logo e marca isolados; texto vetorial e Inter incorporada. Poppler emite aviso Adobe-Identity-H das fontes, mas extração e renderização são legíveis; pdfjs também valida texto/limites.
- Safari local com modal PDF real e payload sintético: completo e resumido prontos, oito origens incluindo serviço e duas páginas no resumo. Safari local com hook/modal/seletores/notificações reais e serviço bancário sintético: aviso de descrição obrigatória visível; formulário válido fecha e oferece Copiar link do pagador. Nenhuma cobrança real.
- Fechamento: 14 testes dos PDFs + 1 teste DOM do modal PDF + 6 checks de criação/layout = 21 aprovados. ESLint focado e diff-check aprovados. Build global não executado: compositores e fluxo local afetado já exercitados, sem publicação.
- Todos os 10 arquivos do manifesto possuem até 500 linhas (maior: hook com 427).
- `npm run check:file-lines` foi executado e falhou em 8 referências preexistentes a arquivos ausentes, fora deste manifesto: migrations `20261113182000_bound_caixa_monthly_eligibility.sql` e `20261113184005_dashboard_activity_civil_dates.sql`; testes `caixa_monthly_bounded_eligibility.isolated.test.mjs`, `dashboard-activity.presentation.test.ts`, `dashboard-activity.service.test.mjs`, `dashboard_recent_activity.isolated.test.mjs`; workflow `dashboard-activity-dates.yml`; changelog `2026-11-08-versoes-4-8-268-a-269.md`. Nenhuma violação no manifesto atual; pendência global registrada sem reconstruir arquivos de outro lote.
- Índice RAG refeito uma única vez no fechamento após atualização do lote ativo.

Comandos focados: testes de `caixa-report.vector-pdf`, `caixa-report.concise-pdf` e `caixa-report.summary-parity` empacotados com esbuild em tmp; `CAIXA_UI_JSDOM_PATH=... node --test modules/gestor/caixa/report/CaixaReportPreviewModal.interaction.test.mjs`; `OTHER_CREDIT_JSDOM_PATH=... node --test modules/gestor/financeiro/outros-creditos/other-credit-create.interaction.test.mjs modules/gestor/financeiro/outros-creditos/other-credit-create-modal.test.ts`. JSDOM instalado somente em tmp, sem mudança de dependências do projeto.


## Publicação autorizada

- Usuário solicitou atualizar GitHub e produção em 14/11/2026. Versão 4.8.340 estável, revisão 349.
- Base remota confirmada pelo MCP: main `235160ebc5d09f8ceea00141b07bf4832304a1d8`, produção Vercel READY na 4.8.339.
- Candidato isolado exportado de main com verificação de hashes de blobs. Os quatro baselines de implementação coincidem byte a byte com main. Sobreposição limitada ao manifesto; alterações paralelas do checkout ficaram fora.
- As oito referências ausentes do checkout antigo foram recuperadas da base remota somente no diretório isolado de validação; não pertencem ao delta publicado.
- Gates da base limpa aprovados: build com Node24.22.1, TypeScript, ESLint focado, versão/histórico e teto de500linhas; suíte do Caixa com175aprovados e2skips já previstos;6checks de criação/layout aprovados. Preview, merge e smoke pós-publicação ainda pendentes.

- Histórico4.8.272 movido integralmente para arquivo próprio, com link no histórico ativo, para manter o teto de500linhas após acrescentar4.8.340. Nenhuma entrada histórica editada.

- Regressão de criação/link incluída no workflow financeiro existente, aproveitando DOM isolado já configurado. O teste cria explicitamente o diretório temporário para funcionar em checkout limpo.
- Revisão independente encontrou e corrigiu aviso de cursos omitidos no resumido: agora direciona ao relatório completo, sem referir uma Seção4 inexistente. Regressão adicional cobre o cenário.

- Revisão independente concluída sem pendências materiais após corrigir a continuação de cursos.15testes específicos dos PDFs aprovados, incluindo a nova regressão. Build final repetido após esse ajuste e aprovado.
