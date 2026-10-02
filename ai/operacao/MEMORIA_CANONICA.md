# Memória canônica do projeto

Atualizada em: 2026-10-01

## Finalidade

Este arquivo é um índice curto de contexto durável. Ajustes rápidos não precisam lê-lo. Detalhes de domínio ficam nas políticas específicas e são carregados somente quando a tarefa os envolve.

## Operação

- AGENTS.md define a classificação entre ajuste rápido, mudança padrão e mudança crítica.
- LOTE_ATIVO.md contém somente um lote corrente; históricos ficam em ai/operacao/registros/.
- Um agente é o padrão. Delegação só ocorre para frentes independentes e materialmente úteis.
- A validação deve exercer o fluxo real afetado antes de build ou suítes amplas.
- Acesso remoto à interface, smoke autenticado e automação CUA deste projeto usam exclusivamente o Safari; nunca abrir nem automatizar o Google Chrome. Se o Safari não tiver uma sessão útil, registrar a pendência sem trocar de navegador.
- Regras globais não são acrescentadas durante hotfix de produto.

## Arquitetura e qualidade

- O frontend React/TypeScript/Vite coleta intenção e apresenta o retorno canônico.
- Regras acadêmicas, financeiras, autorização, elegibilidade, valores e paginação pertencem ao backend/RPC quando aplicável.
- TanStack Query e Realtime usam invalidação pelo menor escopo afetado.
- O teto arquitetural é de 500 linhas físicas por arquivo manual. Todo arquivo tocado acima disso deve ser modularizado no próprio lote; a adoção é incremental pelos manifestos auditados.
- Migrations já aplicadas permanecem imutáveis mesmo acima do teto. Novas migrations devem ser divididas antes da aplicação quando a separação for tecnicamente segura; gerados, lockfiles, binários e terceiros ficam fora da contagem.
- Testes-fonte e migrations permanecem no repositório mesmo depois de executados.
- tmp, caches, relatórios e PDFs/PNGs de QA são regeneráveis e podem ser limpos.

## Políticas condicionais

- PDFs gerados pelo produto: politicas/PDFS_OFICIAIS.md
- Supabase e segurança: politicas/SUPABASE_E_SEGURANCA.md
- Financeiro: politicas/FINANCEIRO.md
- Plano de Curso: politicas/PLANO_CURSO.md
- Interface: politicas/INTERFACE.md
- Entrega e publicação: PROTOCOLO_DE_LOTES.md

## RAG

- Fontes padrão: AGENTS.md, esta memória, lote corrente, protocolo, políticas e docs/decisions/.
- Registros históricos não entram no corpus padrão.
- search lê somente o índice existente e nunca grava ou reindexa.
- index é executado explicitamente uma vez no fechamento de lote relevante.
- Embeddings e OpenContext são opcionais e nunca bloqueiam a operação.

## Ciclos técnicos e matrícula local — 2026-09-24

Contrato vigente: [ciclos financeiros técnicos](../../docs/decisions/ciclos-tecnicos-cobrancas.md). Consultar antes de alterar elegibilidade, datas, matrícula sem boleto, baixa, estorno ou C2. Preservar origens Banese/Proesc, prova individual, destino LOCAL e replay da mesma operação. Revisão com três agentes publicada na 4.8.82/PR174; evidências em [registro da revisão](registros/alteracoes/2026-09-24-revisao-baixa-matricula-local.md).

## Entrega financeira publicada — 2026-09-12 (4.8.47)

- PR 141: squash e026a0f56c301f86ba9aee30c263042d97ff1631; Vercel success e versão pública 4.8.47 confirmada. GitHub Actions ficou QUEUED sem runner; não confundir testes locais aprovados com CI concluído.
- Banese reconhece o próximo dia útil nacional comprovado de 2026, sem alterar os termos. Título revisado da Radiologia pago por R$ 260,00 em 08/09/2026.
- Composição Proesc exige prova compatível com principal, recebido e data; evidência posterior conflitante invalida a prova. Desconhecido permanece nulo. Duas provas históricas foram gravadas com desconto de R$ 19,90 cada e recebíveis preservados.
- Auditoria da T42 após essas provas: 346 vínculos, 204 pagos, 142 abertos, R$ 53.813,57 recebidos. A importação de outras turmas possui lote e conferência próprios; não inferir cobertura de ciclos pelo número da turma.
- Registro: registros/alteracoes/2026-09-12-revisao-banese-proesc.md.

## Importação Proesc por XLS — 2026-09-12

- Cadastros por CPF canônico preservam pessoas existentes; estado acadêmico pertence à matrícula, não ao cadastro global. Reuso em outro polo acrescenta visibilidade sem mover o polo original.
- A fonte XLS comprova cadastro, turma e situação acadêmica; os pagamentos são conferidos pela API. Turno, data final, ID nativo e cobertura financeira não são inferidos quando ausentes.
- Etapa aplicada: 385 pessoas (382 novas, 3 reutilizadas), quatro turmas INTEGRAL de Japoatã e 207 matrículas; histórico com 2.940 cobranças e 1.854 pagamentos, total recebido de R$ 470.746,72. As cinco turmas SEM tiveram INTEGRAL e aulas aos sábados confirmados pelo usuário; nove turmas e 392 matrículas concluídas para os 385 alunos; financeiro adicional concluído. Total das nove turmas: 6.071 cobranças, 3.536 pagamentos confirmados, R$ 898.688,99 recebidos e 2.535 registros em conferência, com identidade, datas e valores auditados sem divergências. Nove eventos PARCIAL/PROESC_API preservam a conferência residual; monitor habilitado para os 6.071 novos vínculos e os 346 da T42, com uma Conta Proesc compartilhada. Um cadastro aguarda CPF.
- Cobertura financeira é individual e permanece em revisão até prova suficiente. Sincronizar pagamento confirmado não autoriza criar outro ciclo ou boleto. T42 e Radiologia mantêm as regras existentes.
- Base 4.8.48 publicada no PR142, squash b5b185e5067e5a7ea02075edfb6667ddcb5fb72b, com CI/Vercel e versão pública confirmados. 4.8.49/revisão 58 publicada no PR143/squash 58a6675fcc531d4e907987b0d5281698fb6ad7e6: CI/Vercel SUCCESS, HTTP200 com asset main-BVVN6ra3.js e acesso autenticado confirmados. Resumo e classificação financeira vêm do backend, sem cálculo no frontend. RAG indexado uma vez no fechamento pelo coordenador. Registro: registros/alteracoes/2026-09-12-proesc-importacao-xls.md.

## Conciliação publicada — 4.8.50

- Remover Atualizar Dados e textos indevidos de Mercado Pago; acrescentar filtro Proesc/Banese junto à busca.
- Origem, filtro, paginação e totais pertencem à RPC, mantendo autorização por polo. Não desligar monitores nem alterar fatos financeiros ao remover a ação visual.
- Versão 4.8.50/revisão 59 publicada no PR144/squash 4b513e085dcb6c0dcf133cf9c0975f28a0023caf, com Vercel SUCCESS e HTTP200 asset main-B8U4uhUw.js; smoke autenticado dos filtros confirmado em produção na 4.8.52. Duas migrations aplicadas e imutáveis. RAG indexado uma vez pelo coordenador, 11 fontes/71 chunks. Proesc REVIEW não implica vencimento confirmado nem permite consulta Banese. Registro: registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md.

## Caixa mensal publicado — 4.8.51

- Inadimplência e margem devem representar o mês e polo selecionados, com numerador, denominador e resultado canônico calculados no backend/RPC.
- Base é o principal elegível com vencimento no mês; atraso usa posição no corte atual/encerramento. Pagamento posterior preserva atraso histórico; desconto não cria saldo residual. Proesc sem prova fica fora das bases com metadados de conferência. Nenhum cálculo financeiro no frontend.
- PR145 publicado após autorização renovada, squash 02409544d1def71a655e2831c0a6c72cd30fc891; CI/Vercel/HTTP200 confirmados. Asset main-C8lAX0ye.js, rótulos/linha laranja observados nas imagens do usuário em produção. Duas migrations imutáveis, 64 testes, SQL real e PDF aprovados. Smoke autenticado do PDF final e teste com usuário restrito ainda sem fixture. Registro: registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md.

## Consulta API Proesc e Banese — 4.8.52

- Painel separado de Token/Histórico, apenas leitura de RPC. Execuções futuras reais e sanitizadas; observações, importações e baixas automáticas são conceitos distintos.
- Banese mantém os erros históricos e informa recuperação posterior e estado atual separadamente; nenhum reprocessamento é autorizado pela simples existência de erro antigo.
- Sete migrations Proesc e uma Banese aplicadas, Edge Proesc v7 ativa e duas execuções reais de 60 cobranças concluídas com telemetria completa. Seis unidades SQL isoladas aprovadas; índices resolvem contagem pesada. Financeiro/Caixa recuperados e preservados após timeouts, com smoke autenticado. Frontend não repete consultas após erro.
- PR146 publicado, squash b2b11a5cbd5fba8e4fd8fdea8d76b537e9add785, CI/Vercel/HTTP200 aprovados. Safari autenticado em produção confirmou as cinco abas, Caixa/Recebíveis e filtros de Conciliação. Aviso EDI7 conferido anteriormente.
- Usuário renovou autorização para corrigir e publicar em 12/09 às21:09. Registro: registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md.

## Recuperação de configuração dos workers — 4.8.53 em publicação

- HTTP504 intermitente nos getters de configuração precede operações bancárias; getter SQL direto em 2,740 ms. Causa exata na camada de API ainda inconclusiva.
- Patch restrito à leitura dos segredos Banese/Push, usado em três workers, com uma repetição, prazo total e metadados sanitizados. Sem alteração de dados financeiros, credenciais ou cron.
- Edge conciliação v101, Push v16 e cancelamento v6 publicadas via MCP. 45 testes e revisão aprovados; tipagem cancelamento mantém erro preexistente reproduzido no remoto, sem alteração financeira. Smoke natural: 14 execuções HTTP200; duas falhas504 internas recuperadas na segunda tentativa. A instabilidade externa não foi declarada eliminada.
- Registro: registros/alteracoes/2026-09-13-workers-configuracao-resiliente.md.

## Proesc V2 operacional — backend ativado (01/10/2026)

- O usuário determinou consultar as turmas/alunos existentes pela V2 e encerrar rede V1. A [decisão V2](../../docs/decisions/proesc-v2-operacional.md) e a [skill única](integracoes/proesc/SKILL.md) substituem orientações antigas de selecionar V1; provas históricas não são apagadas nem usadas como fallback de rede.
- `/invoices` exige mês de dois dígitos (`09`). Setembro retornou 308 parcelas/16 páginas; a ausência anterior com `9` não era ausência financeira. `PAGAMENTO PARCIAL`/`SUPERIOR` não comprovam saldo: preservar quitações e componentes contábeis anteriores; ausência V2 não comprova cancelamento.
- Sete migrations V2 e Edge `proesc-api` v28 implantadas via MCP; backend ativado às 22h21 de Brasília. FULL completo: 1.971 pessoas e 12.814 parcelas em 47 meses; 402/402 matrículas financeiras de 400 alunos conferidas em dez turmas. Foram aplicadas 38 quitações (R$ 9.743,70), confirmadas 2.532 abertas e preservados 3.820 pagamentos. Duas parciais e 25 obrigações ausentes continuam em conferência; 6.422 parcelas sem vínculo local não geraram cobranças. [Registro da migração](registros/alteracoes/2026-10-01-proesc-v2-operacional.md).
- Runtimes V1 desligados, rotas antigas HTTP410 e agendamento V2 habilitado, sem fallback. Caixa de setembro no polo conferido: base R$ 46.933,90, 173 elegíveis, uma pendência de R$ 279,90 (antes 38/R$ 10.636,20); vencido no corte R$ 23.420,70 e margem 49,90%. O indicador ainda não é completo. Banese/541 contas fora do Proesc e 402 matrículas preservados integralmente.
- Fonte V2, identidade inequívoca, principal/vencimento, opt-out, cancelamentos antigos e pagamentos locais cercam a projeção. Banese e fatos acadêmicos/ciclos já comprovados ficam preservados. Classificação de ciclo desconhecida não vira C1 pela quantidade de parcelas.
- Configuração e monitor V2 preparados localmente; publicação frontend e smoke autenticado ainda não atestados. Não confundir implantação da Edge/banco com publicação do site.
- Correção posterior autorizada e aplicada: abertura operacional zero em 01/10 apenas no polo Japoatã/conta Proesc; posição de outubro R$ 1.300,00, sem carregar R$ 3.139,90 históricos. Quatro composições aprovadas exibem desconto calculado de R$ 19,90 cada; uma atrasada conserva diferença não discriminada. Não confundir desconto calculado por regra com componente comprovado pela API, nem estender a aprovação a outras parcelas. [Correção de abertura/composição](registros/alteracoes/2026-10-01-proesc-v2-virada-composicao.md).
- Ampliação posterior autorizada: abertura zero nos quatro polos e encerramento operacional separado em 30/09, histórico intacto. Outubro Japoatã R$ 1.300,00, Porto R$ 260,00, demais zero. Quinta composição calculada em Porto; política automática desde 01/10 limitada às regras homologadas T43/T44/T45 e pagamentos pontuais com identidade/valor/configuração comprovados. Subtotais conhecidos não desaparecem por um componente desconhecido. [Entrega 4.8.149, testes e publicação](registros/alteracoes/2026-10-01-proesc-v2-fechamento-publicacao.md).
- Reconferência dirigida: 27 Proesc em revisão (25 ausentes e duas parciais), incluindo as três de outubro. Matrícula x Financeiro retornou HTTP401 com token atual; Pessoas/Parcelas HTTP200. Tarifas de R$ 3,97 vistas no extrato não foram fornecidas pelas consultas V2 e não viraram despesa automática. Liberação bancária não substitui data de pagamento.
