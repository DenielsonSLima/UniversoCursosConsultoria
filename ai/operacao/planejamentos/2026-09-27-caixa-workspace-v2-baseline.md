# Baseline remoto — Caixa Workspace v2

Data da auditoria: 2026-09-27 17:29 (America/Maceio)

Projeto Supabase: `kfekgwyqozhicpfuunpo`
Escopo: etapas 0–1, somente leitura; nenhuma migration, DDL, DML ou publicação foi executada.

## Resultado executivo

O Caixa atual é funcional, mas sua tela principal depende de até oito RPCs independentes para o mesmo polo e competência, além da leitura de polos. As consultas repetem fontes financeiras, não compartilham o mesmo snapshot e possuem critérios de corte, tipos monetários e guardas de acesso diferentes. Uma RPC agregadora v2 é viável e reduz round-trips, porém não deve simplesmente chamar todas as RPCs públicas atuais em sequência: isso manteria a duplicação de trabalho, herdaria permissões incompatíveis e poderia multiplicar o custo da prestação mensal.

O principal gargalo remoto observado em `pg_stat_statements` é `get_caixa_prestacao_mensal_secure`, com média acumulada de 1.851,36 ms. Linha de corte e posição total também são relevantes, com médias de 579,48 ms e 513,82 ms. A prioridade técnica do v2 deve ser compartilhar bases materializadas dentro de uma única instrução e preservar os cálculos no banco.

## Método e limitação da coleta

Foram consultados via MCP Supabase, apenas com `SELECT`:

- histórico remoto de migrations;
- catálogo `pg_proc`/`pg_namespace`/`pg_roles`, assinaturas, configuração, ACLs e hashes das definições;
- dependências entre funções e tabelas, derivadas das definições remotas;
- métricas agregadas de `extensions.pg_stat_statements` e `pg_stat_user_tables`;
- timezone e data corrente do banco.

Uma chamada de amostragem que retornaria somente tipo, tamanho e chaves de topo dos JSONs foi recusada pelo papel SQL do MCP com `42501 permission denied`. Não foi forçada troca de papel nem contornado o controle de acesso. Portanto, os formatos abaixo combinam definições remotas, contratos canônicos versionados e consumidores atuais; não houve leitura nem exposição de conteúdo financeiro individual.

## Estado remoto e histórico relevante

- Migration mais recente do Caixa: `20260927194749_create_caixa_contas_pagar_resumo`.
- Convênios do Caixa: sequência `20260927120551` a `20260927123831`, incluindo leitura, Realtime, relatório v7 e hardening.
- Otimização mensal: `20260922013628_optimize_caixa_monthly_core` e `20260922013637_reuse_caixa_monthly_evidence`.
- Linha de corte vigente: `20260922013646_caixa_linha_corte_previstas_a_vencer`.
- Posição total/Proesc: `20260913123752_caixa_posicao_total_proesc_control` e `20260926121636_preserve_explicit_caixa_proesc_evidence`.
- Timezone da sessão do banco: `UTC`. No instante da auditoria, `CURRENT_DATE` e a data institucional coincidiam em `2026-09-27`, mas podem divergir diariamente na janela entre 21h e 24h em Maceió.

## Inventário das RPCs atuais

Todas as dez RPCs abaixo estão em `public`, retornam `jsonb`, são `STABLE`, `SECURITY DEFINER`, pertencem a `postgres`, revogam execução anônima e concedem `EXECUTE` a `authenticated` e `service_role`.

| RPC | Assinatura efetiva | Conteúdo/corte principal | Média / máximo acumulados |
| --- | --- | --- | --- |
| `get_caixa_prestacao_mensal_secure` | `(uuid = null, date = CURRENT_DATE, integer = 6)` | visão mensal, saldos atuais, realizados, compromissos, séries, contas e qualidade | 1.851,36 / 7.557,79 ms; 288 chamadas |
| `get_caixa_financiamento_resumo_secure` | `(uuid = null, date = CURRENT_DATE)` | crédito, obrigação/principal/encargos rateados e pago | 202,00 / 2.737,33 ms; 244 chamadas |
| `get_caixa_custos_operacionais_secure` | `(uuid = null, date = CURRENT_DATE)` | custo econômico, pago, aberto, vencido e rateios | sem amostra própria identificável |
| `get_caixa_patrimonio_resumo_secure` | `(uuid, date)` | posição patrimonial a custo, aquisições e perdas da competência; rejeita competência futura | 200,54 / 3.229,00 ms; 238 chamadas |
| `get_caixa_posicao_liquida_resumo_secure` | `(uuid = null, date = CURRENT_DATE)` | patrimônio a custo menos empréstimos ainda devidos | 242,94 / 3.426,00 ms; 241 chamadas |
| `get_caixa_posicao_total_resumo_secure` | `(uuid = null, date = CURRENT_DATE)` | caixa registrado + patrimônio a custo − empréstimos, no corte | 513,82 / 7.833,17 ms; 245 chamadas |
| `get_caixa_contas_pagar_resumo_secure` | `(uuid = null, date = data institucional)` | competência, pagas, a vencer, atraso e agenda D0–D+7 | 17,10 / 58,01 ms; 9 chamadas |
| `get_caixa_convenios_resumo_secure` | `(uuid = null, date = CURRENT_DATE)` | saldos, créditos, despesas, comprometido e itens por convênio | 49,26 / 176,14 ms; 11 chamadas |
| `get_caixa_linha_corte_secure` | `(uuid = null, date = CURRENT_DATE)` | receitas, inadimplência, despesas, cobertura e histórico | 579,48 / 7.001,14 ms; 168 chamadas |
| `get_caixa_relatorio_mensal_detalhado_secure` | `(uuid = null, date = CURRENT_DATE)` | relatório mensal detalhado v7, incluindo convênios; uso sob demanda | 1.277,33 / 5.933,11 ms; 36 chamadas |

As métricas de `pg_stat_statements` são acumuladas e misturam escopos, competências, aquecimento de cache e versões anteriores da mesma assinatura. Servem como ordem de grandeza, não como SLO nem benchmark isolado.

## Contratos e semânticas observadas

### Prestação mensal

Contrato amplo com `meta`, `saldos_hoje`, `resumo_competencia`, `compromissos`, `receitas_por_modalidade`, `despesas_por_categoria`, `serie_mensal`, `contas`, `classificacao`, `conciliacao` e `qualidade_dados`. O contrato atual mistura posição de hoje com recorte mensal e retorna valores monetários como números JSON.

### Contas a pagar

Contrato v1 com `competencia`, período `[inicio, fim_exclusivo)`, `data_corte`, escopo e critério `POSICAO_REEXPRESSA_NO_CORTE`. Expõe `contas_competencia`, `pagas_competencia`, `a_vencer_competencia`, `em_atraso` e `agenda_financeira` (`hoje`, próximos sete dias sem sobrepor hoje e oito pontos diários de D0 a D+7). Valores monetários são strings decimais.

O corte é `min(hoje em America/Maceio, último dia da competência)`. Pagamentos posteriores ao corte são reabertos quando existe data de pagamento. Despesas rateadas permanecem em frações econômicas e o título físico não é duplicado. Financiamentos são excluídos. Cancelamentos/exclusões sem histórico de vigência continuam refletindo o estado atual e impedem reconstrução histórica perfeita.

### Posições e patrimônio

Patrimônio, posição líquida e posição total usam strings decimais nos contratos mais novos. A posição líquida é exclusivamente patrimônio ativo a custo menos empréstimos devidos; não inclui contas a pagar abertas. A posição total adiciona o caixa registrado e também não deve descontar compromissos ainda não pagos. A regra a preservar no v2 é: apenas saídas efetivamente pagas afetam realizados e caixa; títulos abertos são informativos/projetivos.

### Linha de corte, custos, financiamento e convênios

Linha de corte retorna receitas realizadas/previstas, inadimplência, despesas fixas/variáveis/rateadas, cobertura e histórico. Custos e financiamento distinguem obrigação econômica, baixa física e rateio. Convênios expõem saldo inicial, créditos recebidos, despesas pagas, comprometido aberto, disponível, projetado e itens. Esses contratos legados ainda usam números JSON para moeda.

### Relatório detalhado

É uma composição v7 voltada a PDF e não deve integrar o payload inicial do workspace. Deve permanecer lazy/on-demand, pois seu custo e volume são incompatíveis com a abertura da tela.

## Segurança efetiva

- ACL remoto: apenas `postgres`, `authenticated` e `service_role`; `anon` não executa nenhuma das RPCs inventariadas.
- Oito RPCs usam `SET search_path TO ''`. `get_caixa_custos_operacionais_secure` e o core privado `get_caixa_prestacao_mensal_secure_raw` usam `search_path=public`; o v2 não deve repetir essa exceção.
- `get_caixa_prestacao_mensal_secure_raw` e `get_caixa_relatorio_mensal_detalhado_v6_core` têm execução somente para `postgres`, o que é adequado para helpers internos.
- A prestação mensal delega autorização ao core privado. A posição líquida delega aos resumos seguros de patrimônio e financiamento. A posição total valida por chamadas seguras e também controla contas bancárias.
- A matriz de acesso não é uniforme: custos e linha de corte aceitam Caixa ou Financeiro; financiamento exige escopo financeiro e módulo Caixa; patrimônio exige Caixa; convênios exigem Financeiro e aba Convênios; contas a pagar aceita Caixa ou Financeiro + aba Despesas.

Consequência: uma agregadora que apenas encadear as RPCs públicas falhará integralmente para perfis que hoje podem ver somente parte da tela. O v2 precisa de uma guarda central explícita e de disponibilidade por seção, sem elevar privilégios nem revelar seções fora do perfil.

## Fontes e custo estrutural

As funções sobrepõem leituras de `contas_pagar`, `contas_receber`, `despesas_lancamentos`, rateios, empréstimos, patrimônio, contas bancárias, transferências e convênios. `contas_receber` era a maior relação relevante na coleta, com cerca de 6.866 linhas vivas estimadas e 99,5% de uso acumulado de índices. As relações novas de despesas, patrimônio e convênios tinham cardinalidade muito baixa ou zero; isso impede concluir que os planos atuais escalarão com volume real.

O risco de performance não está hoje no tamanho bruto do payload, mas na repetição de varreduras e composições: a posição líquida chama patrimônio e financiamento; a posição total volta a combinar essas dimensões; a prestação e a linha de corte revisitam recebíveis e despesas. Realtime pode invalidar várias famílias simultaneamente e provocar uma nova rajada das mesmas consultas.

## Lacunas que a v2 deve fechar

1. Snapshot único: oito respostas independentes podem representar instantes diferentes.
2. Corte único: `CURRENT_DATE` usa UTC no banco, enquanto a regra institucional é `America/Maceio`.
3. Dinheiro único: contratos antigos usam número JSON e os novos usam texto decimal.
4. Autorização única: as guardas atuais não são intercambiáveis entre seções.
5. Fonte compartilhada: bases de recebíveis, despesas, empréstimos e patrimônio são recalculadas.
6. Reconstrução histórica: cancelamentos/exclusões sem vigência temporal não podem ser reexpressos com fidelidade total.
7. Integridade do cliente: alguns mapeadores legados aceitam ausência/inválido como zero; isso pode ocultar quebra de contrato.
8. Payload inicial: listas de contas e convênios não têm uma política global de limite/paginação.
9. Drill-down: não existe contrato paginado único para explicar os KPIs sem baixar coleções amplas.
10. Observabilidade: métricas atuais agregam versões e parâmetros, sem dimensão por escopo/competência.

## Contrato mínimo proposto para `get_caixa_workspace_v2_secure`

Assinatura alvo:

```sql
get_caixa_workspace_v2_secure(
  p_polo_id uuid default null,
  p_competencia date default timezone('America/Maceio', now())::date,
  p_meses_historico integer default 6
) returns jsonb
```

Envelope obrigatório:

```text
versao: 2
meta: competencia, periodo_inicio, periodo_fim_exclusivo, data_corte,
      timezone, gerado_em, escopo_tipo, polo_id, meses_historico,
      criterio_posicao, criterio_realizado
resumo_executivo: caixa, entradas_pagas, saidas_pagas, resultado_realizado
compromissos: contas_a_pagar, contas_a_receber, inadimplencia, agenda_financeira
fluxo: receitas, despesas, serie_mensal
cobertura: linha_de_corte, margens, diagnosticos
posicoes: patrimonio_custo, emprestimos_a_pagar, posicao_liquida, posicao_total
operacoes: conciliacao, contas_resumidas, convenios_resumidos
qualidade_dados: alertas, contagens e completude
secoes: disponibilidade e motivo canônico por seção
```

Regras do contrato:

- toda moeda como string decimal canônica com duas casas; contagens como inteiro e percentuais calculados no banco;
- competência normalizada para o primeiro dia; período sempre `[inicio, fim_exclusivo)`;
- `data_corte = min(data institucional, fim_exclusivo - 1 dia)` para posições reexpressas;
- realizado usa somente pagamento/recebimento efetivo até o corte;
- contas abertas não reduzem caixa, resultado realizado, patrimônio a custo nem posições líquida/total;
- rateio econômico e baixa física continuam separados, sem dupla contagem;
- seções não autorizadas retornam envelope indisponível sem dados, em vez de derrubar seções permitidas;
- arrays do payload inicial têm limite fixo; detalhes completos pertencem a RPC paginada posterior;
- frontend valida, formata e apresenta; não soma, rateia, calcula percentual nem reconcilia valores.

## Critérios de saída da etapa de contrato

1. Guardas aprovadas para os dois caminhos de entrada: módulo Caixa ou módulo Financeiro com aba Despesas, sempre respeitando polo/global.
2. `SECURITY DEFINER`, `search_path=''`, `PUBLIC/anon` revogados e helpers internos sem execução pública.
3. Testes negativos comprovam negação cruzada entre polos, global indevido, usuário sem módulo e anônimo.
4. Testes de paridade comparam cada seção v2 à RPC canônica atual no mesmo polo, competência e corte.
5. Invariantes provam que aberto não altera realizado e que pagamentos parciais/rateios não duplicam títulos ou valores.
6. Testes de virada de dia cobrem UTC versus `America/Maceio`, mês corrente, passado e tentativa futura.
7. Contrato falha explicitamente em campo ausente/tipo inválido; nenhum valor monetário ausente vira zero no frontend.
8. Uma única execução SQL produz todas as seções visíveis no mesmo snapshot.
9. Benchmark com `EXPLAIN (ANALYZE, BUFFERS)` em dados representativos demonstra ausência de N+1 e de regressão material frente à prestação mensal isolada; o SLO final deve ser fixado após esse ensaio.
10. Payload inicial tem tamanho máximo definido e o relatório PDF continua fora do carregamento inicial.

## Decisão para a próxima etapa

Criar primeiro um core privado v2 com bases materializadas compartilhadas e um wrapper público seguro. Não chamar em cascata todas as RPCs públicas. Durante a transição, manter as RPCs atuais intactas e testar paridade seção a seção; somente depois trocar a query da tela. Cache TanStack deve usar chave por polo + competência + versão, `staleTime` curto e invalidação Realtime consolidada/debounced, evitando invalidar simultaneamente as famílias legadas e v2 após a migração da tela.
