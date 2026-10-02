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

## Histórico Proesc, Caixa e conciliação — 4.8.47–52

Composição exige identidade, principal, recebido e data compatíveis; prova posterior conflitante invalida a anterior e desconhecido fica nulo. Banese conserva o próximo dia útil nacional comprovado de 2026, sem presumir outros calendários. [Auditoria T42 e entrega 4.8.47](registros/alteracoes/2026-09-12-revisao-banese-proesc.md). XLS comprova cadastro/turma/situação acadêmica; API comprova pagamentos. CPF canônico preserva pessoas e visibilidade por polo; estado acadêmico pertence à matrícula. Não inferir turno, datas, IDs ou cobertura de ciclos. Pagamento não autoriza novo ciclo/boleto. [Importação 4.8.48–49, totais e provas](registros/alteracoes/2026-09-12-proesc-importacao-xls.md).

Origem, escopo por polo, paginação, bases mensais e valores pertencem às RPCs. Pagamento posterior preserva atraso histórico; desconto não cria saldo residual. REVIEW não comprova vencimento nem autoriza consulta Banese. [Conciliação 4.8.50](registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md) e [Caixa 4.8.51](registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md). Painel API é somente leitura; observação, importação e baixa são distintas. Preservar erros Banese e separar recuperação posterior; erro antigo não autoriza reprocessamento. Frontend não repete consultas após erro. [Consulta API 4.8.52, incidente e smoke](registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md). Histórico completo de publicações, agregados, testes e limitações permanece nesses registros inalterados.

## Recuperação de configuração dos workers — 4.8.53 em publicação

- HTTP504 intermitente nos getters de configuração precede operações bancárias; getter SQL direto em 2,740 ms. Causa exata na camada de API ainda inconclusiva.
- Patch restrito à leitura dos segredos Banese/Push, usado em três workers, com uma repetição, prazo total e metadados sanitizados. Sem alteração de dados financeiros, credenciais ou cron.
- Edge conciliação v101, Push v16 e cancelamento v6 publicadas via MCP. 45 testes e revisão aprovados; tipagem cancelamento mantém erro preexistente reproduzido no remoto, sem alteração financeira. Smoke natural: 14 execuções HTTP200; duas falhas504 internas recuperadas na segunda tentativa. A instabilidade externa não foi declarada eliminada.
- Registro: registros/alteracoes/2026-09-13-workers-configuracao-resiliente.md.

## Proesc V2 operacional — 01/10/2026

V2 é a única fonte de rede; V1 permanece só como prova histórica, sem fallback. Mês exige `09`; ausência/parcial/superior não comprovam baixa ou saldo. Leia a [decisão](../../docs/decisions/proesc-v2-operacional.md) e a [skill](integracoes/proesc/SKILL.md) antes de operar. Abertura operacional zero em 01/10 nos quatro polos, histórico preservado. Descontos calculados somente por regras homologadas e guardas; desconhecido continua em conferência e subtotal conhecido permanece visível. Vinte e sete parcelas pendentes, uma composição atrasada e tarifas sem retorno aplicado exigem prova adicional. [Entrega 4.8.149, resultados, pendências e publicação](registros/alteracoes/2026-10-01-proesc-v2-fechamento-publicacao.md); backend aplicado não comprova publicação do site.
