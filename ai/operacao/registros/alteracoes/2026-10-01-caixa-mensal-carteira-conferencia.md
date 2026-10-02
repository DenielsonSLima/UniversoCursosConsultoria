# Caixa — visão mensal, carteira geral e registros em conferência

Estado: ESCOPO INICIAL VALIDADO; RETIRADA ADMINISTRATIVA APLICADA; PUBLICAÇÃO PENDENTE.
Resultado remoto da retirada conferido em 02/10/2026 às 03:44 UTC. Entrega posterior à 4.8.149/PR240,
sem incorporar arquivos paralelos fora do manifesto abaixo.

## Pedido e reprodução

O usuário pediu que os avisos de cobranças em conferência abram um modal em
tela cheia com os registros e motivos. Pediu também separar o valor em aberto
da competência da carteira geral, exibindo abaixo total aberto, vencido e a vencer.
Três agentes trabalham nas frentes backend, interface e revisão independente.

Reprodução em Safari autenticado local: o bloco mensal apresenta 1.560,00
recebidos, 811.332,11 em aberto da carteira inteira e zero vencido no mês.
Avisos globais informam três cobranças mensais e 27 na carteira, sem detalhamento.
O helper mensal usa competência/corte; o helper de carteira anterior usa posição
atual. A divergência semântica não será corrigida com subtração no frontend.

## Aceite

- Mensal: recebido por pagamento na competência; aberto/vencido/a vencer
  somente para vencimentos da competência, conforme prova e corte canônicos.
- Carteira geral separada: posição aberta, parcela vencida até o corte e parcela
  a vencer; obrigações futuras já cadastradas não são recebimentos realizados.
- REVIEW permanece fora dos valores confirmados; aviso abre os registros exatos
  do recorte, com aluno, turma, matrícula, referência, vencimento, nominal e motivo.
- Contagem e soma do modal devem reconciliar com o card; paginação no servidor.
- Escopo por polo e capacidade financeira; resultado geral somente autorizado.
- Nenhuma consulta Proesc V1, chamada externa ao abrir modal ou alteração de fatos.
- Design existente, tela cheia, foco/Esc, fechamento, loading/erro/vazio e
  troca de polo/competência sem reaproveitar resultados de outro recorte.
- Datas importadas de criação local não provam emissão histórica; explicitar
  quando a posição é reexpressa no corte com o cadastro atual.
- Registros em conferência não comprovam dívida ou inadimplência; rótulos de
  valor e vencimento devem dizer "cadastrado", sem presumir estado da origem.
- Sem botão "Atualizar lista" no sucesso. Atualizações financeiras recebidas
  pelo Realtime invalidam as consultas ativas do recorte; "Tentar novamente"
  permanece somente no erro, sem polling novo ou chamada direta ao Proesc.

## Risco e validação prevista

Financeiro e RPC somente leitura. Validar histórico no corte, pagamento posterior,
origens diferentes, REVIEW, cancelamento, ciclos preparados, empréstimos,
autorização/polo, paginação, moeda, projeção canônica e interface real.
Testes SQL isolados antes de aplicar; RPC real após migration via MCP.
Build e CI de publicação após revisão, sem ocultar limitações do smoke.
O pedido adicional de retirada é uma operação administrativa de escrita,
separada dessas RPCs de leitura, com manifesto exato, arquivo recuperável e
autorização explícita. Não equivale a quitação nem cancelamento na origem.

## Validação da leitura

- Migrations114/115 aplicadas via MCP, ledger20261002030652/20261002030655.
  Consultas privadas sem grant ao cliente; RPCs públicas com guarda de identidade,
  módulo/polo/aba e search_path vazio. Anon não executa. Segurança auditada por
  três agentes; advisors preservam avisos anteriores e acrescentam duas RPCs
  autenticadas SECURITY DEFINER intencionalmente guardadas (462 para464).
- PGlite: paridade mensal, corte histórico, pagamento posterior, desconto não
  residual, fontes, preparação sem emissão, empréstimos, paginação, ACL e
  imutabilidade. RPCs reais: resumo global968ms, lista820ms, sem escrita.
- Antes da retirada administrativa: mensal aberto81.525,19; geral803.814,51,
  vencido236.010,48 e a vencer567.804,03 no corte02/10. O valor antigo811.332,11
  incluía29parcelas preparadas sem emissão/pagamento/CNAB, somando7.517,60.
  Comparação por identidade:2.899comuns,29somentelegado,nenhuma somente nova.
- Conferência global27/7.557,30, páginas20+7 sem repetição/omissão; mensal3/839,70.
  Valores nominais não representam dívida. Textos ajustados após o usuário
  confrontar um registro local com relatório de origem sem cobrança correspondente.
- Fingerprints de6.958recebíveis,7contas e4despesas iguais antes/depois das
  migrations de leitura. Nenhuma baixa, tarifa ou componente financeiro criado.
- TypeScript e lint dos13arquivos de interface aprovados; Caixa143testes,
  141aprovados e2ignorados condicionais anteriores. Build4.8.150 aprovado;
  avisos anteriores de chunks grandes/importação mista fora do escopo.
- Após remover "Atualizar lista": dez testes focados de conferência aprovados,
  incluindo ausência do botão no sucesso e callback de nova tentativa no erro;
  lint dos dois arquivos alterados aprovado. Sem novo build amplo nessa rodada.

## Pedido adicional de retirada administrativa

O usuário contestou registros ausentes dos relatórios e do inventário V2,
solicitando expressamente remoção do cadastro ativo, não só ocultação do aviso.
Escopo autorizado:22registros de três matrículas (8+7+7). Preservar parcelas
pagas e uma obrigação vencida real identificada no relatório. Não atribuir
estado PAGO/CANCELED à API sem retorno correspondente; remoção administrativa
precisa de arquivo privado recuperável, identidade/fingerprint e proteção contra
recriação. Aplicação via MCP em transação única com 22 alvos exatos e guardas
de preservação antes do commit. Nenhum registro adicional foi retirado.

Migrations 116/117 e teste-fonte adicionados ao lote. A primeira cria arquivo
privado recuperável e vínculo histórico; a segunda cria operações administrativas
restritas ao operador de banco, replay com payload imutável e guardas contra
recriação pela V2. As migrations não arquivam registros por si: a operação exige
solicitação separada com alvos exatos e fingerprints conferidos.

Validação local PGlite aprovada: alvos exatos, atomicidade, replay, permissões
privadas, preservação de evidência, recuperação byte a byte com triggers reais,
dependências impeditivas e nova observação V2 sem ressuscitar o registro.
Migrations116/117 aplicadas via MCP, ledger20261002034151/20261002034154.
Auditoria independente pós-commit: 22 contas ativas retiradas, 22 cópias privadas
recuperáveis e vínculos preservados com automação desligada. Os 27 registros
reais das três matrículas e os demais recebíveis permanecem com hashes integrais
idênticos; 971 snapshots preservados. Contas bancárias e despesas inalteradas.
Conferência mensal passou de3 para0; geral de27 para5, nominal1.399,50.
Confirmados inalterados: mensal81.525,19/297 e geral803.814,51/2.899.
Os88eventos financeiros esperados foram emitidos para22identidades e4polos.
Nenhum nome, documento ou payload pessoal compõe este registro.

## Confirmação pontual por prova do portal

Duas parcelas de setembro apareciam como pagas no portal, mas como pagamento
parcial na V2. Nova consulta V2 confirmou identidades, valores e datas, mantendo
a divergência de rótulo. A autorização do usuário limita a correção a esses
dois registros; o significado geral de pagamento parcial permanece inalterado.
Migration 118 aplicada via MCP, ledger 20261002040948: operação privada de
manutenção, sem novos grants aos clientes, ator real, prova com hash, replay
imutável, comparação do estado anterior e auditoria transacional.
Confirmações aplicadas em transação única: 573,14 recebidos em setembro;
Proesc em outubro permanece com 6 recebimentos/1.560,00 e posição preservada;
o agregado de outubro de todas as origens também permaneceu inalterado.
As 12 parcelas futuras, os demais 6.934 recebíveis, as sete contas e todos os
snapshots anteriores permaneceram intactos. API original preservada; componentes
continuam desconhecidos, sem inferir juros, descontos ou tarifas. Teste PGlite
com triggers/claims reais, identidade, replay, abertura em 01/10 e preservação
pela próxima observação parcial aprovado pelo autor e revisores independentes.
Pós-check independente: conferências gerais de cinco para três, nominal 839,70;
conferência mensal e do polo corrigido zeradas. Oito eventos Realtime e duas
auditorias registrados. Uma sincronização Banese posterior ao commit confirmou
outro pagamento; essa alteração concorrente não é efeito da correção Proesc.
Advisors acrescentam apenas três tabelas privadas com RLS sem política externa,
intencionalmente sem grants. Avisos anteriores permanecem sem novas exposições.

## Smoke e limites

Safari autenticado local: recorte mensal/global, modal em tela cheia, paginação
20+7 e fechamento por Esc conferidos. Atualização automática comprovada no
contrato Realtime e nos eventos reais; remoção do botão validada em dez testes
e no modal autenticado de carteira do polo, com dois registros em conferência.
Produção permanece sem sessão financeira autenticada disponível para smoke.
O usuário retirou o relatório XLS do escopo; comparação interrompida, sem importar
ou alterar dados com base nesse arquivo. A divergência de atraso entre Caixa e
Financeiro foi diagnosticada: data versus status persistido, modalidades distintas
e inclusão de pré-emissões. A mudança no Financeiro aguarda decisão; não foi
implementada neste lote. Após as duas quitações, nova leitura UI ficou indisponível
por ausência de janela Safari acessível; não apresentar isso como smoke aprovado.
Gate global de linhas local aponta 14 arquivos/manifestações ausentes da cópia
local anterior ao lote; os 30 arquivos deste manifesto estão dentro de 500 linhas.
Preservar esses arquivos remotos e exigir validação do checkout completo no CI.

## Manifesto explícito

Total: 30 arquivos. Inclui correção pontual com prova de portal e diagnóstico
da divergência de critérios entre Financeiro e Caixa, sem corrigir esse segundo
fluxo antes da decisão do usuário.

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/useCaixaRealtime.ts`
- `modules/gestor/caixa/components/CaixaStatementSection.tsx`
- `modules/gestor/caixa/components/CaixaCommitmentTracks.tsx`
- `modules/gestor/caixa/components/CaixaImmersiveLayout.test.tsx`
- `modules/gestor/caixa/review-pending/CaixaReceivablesPortfolio.tsx`
- `modules/gestor/caixa/review-pending/CaixaReviewPendingModal.tsx`
- `modules/gestor/caixa/review-pending/CaixaReviewPendingPanel.tsx`
- `modules/gestor/caixa/review-pending/caixa-receivables-position.service.ts`
- `modules/gestor/caixa/review-pending/caixa-review-pending.contract.ts`
- `modules/gestor/caixa/review-pending/caixa-review-pending.service.ts`
- `modules/gestor/caixa/review-pending/caixa-review-pending.test.tsx`
- `modules/gestor/caixa/review-pending/useReviewDialogFocus.ts`
- `supabase/migrations/20261002011400_caixa_review_drilldown.sql`
- `supabase/migrations/20261002011500_caixa_receivables_position.sql`
- `supabase/migrations/20261002011600_proesc_administrative_receivable_archive.sql`
- `supabase/migrations/20261002011700_proesc_administrative_archive_operations.sql`
- `supabase/migrations/20261002011800_proesc_portal_payment_confirmation.sql`
- `supabase/tests/caixa_review_drilldown.isolated.test.mjs`
- `supabase/tests/proesc_administrative_archive.isolated.test.mjs`
- `supabase/tests/proesc_portal_payment_confirmation.isolated.test.mjs`
- `scripts/test-caixa-report.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-01-caixa-mensal-carteira-conferencia.md`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-fechamento-publicacao.md`
- `ai/operacao/registros/alteracoes/2026-10-02-caixa-financeiro-paridade-diagnostico.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
