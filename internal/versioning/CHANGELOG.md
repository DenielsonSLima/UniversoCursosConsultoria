# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

## [4.8.69] - 2026-09-18

- Proesc possui configurações independentes para V1 e V2, com salvar, remover e testar por conexão.
- V1 preserva legado, parcelas e conciliação; V2 consulta dados de pessoas com token próprio e liberação do suporte.
- Segredos permanecem protegidos no servidor; erro em uma versão não troca automaticamente a fonte de dados.

## [4.8.68] - 2026-09-16

- Conciliação apresenta a referência da consulta à API Proesc quando não há horário da baixa, com identificação e legenda próprias.
- Horário real da baixa mantém prioridade; data de pagamento, composição e campos desconhecidos são preservados.
- Apenas observações com origem API comprovada fornecem essa referência, sem promover consultas a confirmações financeiras.

## [4.8.67] - 2026-09-16

- Conciliação apresenta os componentes financeiros canônicos do Proesc, incluindo informações parciais e cálculos pelas regras informadas, com a mesma discriminação disponível no Caixa.
- Composição calculada mantém sua identificação; valores desconhecidos continuam sem preenchimento e diferenças permanecem em conferência.
- Ausência de horário da baixa no Proesc recebe mensagem específica, preservando a data de pagamento sem inventar hora, forma ou conta.

## [4.8.66] - 2026-09-16

- Conciliação evita consultar evidências de vencimento para recebimentos já pagos, preservando filtros, totais e autorização.
- Dashboard, prestação mensal do Caixa e lista da conciliação encerram a tentativa ao receber timeout SQL, sem repetir automaticamente a consulta cancelada.
- Falhas transitórias de rede mantêm uma repetição; novas consultas continuam permitidas e erros permanecem visíveis.
- Preparação local da entrega; publicação e validação final registradas no lote correspondente.

## [4.8.65] - 2026-09-16

- Baixa manual aceita o contexto auditável da operação sem confundi-lo com alteração financeira da parcela.
- Conflitos reais respondem imediatamente, preservando o bloqueio de segurança e evitando repetição até expirar a operação.
- Mensagens de falha preservam o motivo retornado pelo banco; nova operação não herda o erro anterior.
- Tentativas reconciliadas podem ser encerradas por revisão auditada para permitir novo recebimento com outra conta, preservando o histórico original.

## [4.8.64] - 2026-09-13

- Conferência dos ciclos Proesc acontece automaticamente para todos os alunos, pelo worker e ao abrir o financeiro da turma, sem botão separado.
- Ciclos já emitidos no Proesc ou Banese continuam protegidos; matrículas trancadas e transferidas não podem gerar novas cobranças.
- A elegibilidade exibida acompanha o histórico confirmado, com nova consulta automática antes da prévia e da emissão.
- Cobertura comprovada apenas do segundo ciclo Proesc preserva o bloqueio e sua identificação, mesmo quando as parcelas do primeiro ciclo não foram importadas.

## [4.8.63] - 2026-09-13

- Restaura a legenda integral dos instrumentos avaliativos em cada página de notas dos diários, inclusive importados e em branco.
- Preserva as colunas dos originais, incluindo P/P em Anatomia e P/TG/CQ em Microbiologia, com espaço para a legenda abaixo da tabela.
- Validação: 45 testes focados, extração vetorial e revisão visual dos PDFs de Anatomia e Microbiologia.

## [4.8.61] - 2026-09-13

- Turmas importadas recebem as regras financeiras confirmadas e voltam a carregar o resumo, com matrícula, rematrícula e mensalidades discriminadas.
- Segundo ciclo confere cobranças na API Proesc por aluno antes da prévia e da geração, preservando ciclos externos e títulos já emitidos.
- Caixa, Contas a Receber, conciliação, extrato e Outros Créditos distinguem desconto, juros e multa da API ou calculados pelas regras informadas, mantendo o valor efetivamente recebido e as diferenças a conferir.
- PDFs usam a mesma composição financeira e preservam os modelos institucionais configurados.

## [4.8.60] - 2026-09-13

- Diário apresenta Instrumentos Avaliativos em um cabeçalho agrupado, com as siglas utilizadas na linha abaixo, no PDF preenchido e em branco.
- Siglas originais são preservadas: duas colunas P continuam P e P, sem numeração criada pelo sistema e sem alteração das notas.
- Frequência agrupa Falta e % conforme o modelo do diário; testes conferem a posição e a estrutura dos cabeçalhos.

## [4.8.59] - 2026-09-13

- Notas e PDF do diário mostram somente os instrumentos usados ou selecionados, com uma avaliação por coluna e cabeçalho único.
- Provas repetidas aparecem como P1/P2; categorias combinadas e a precisão das notas e médias são preservadas.
- Testes automáticos protegem as colunas, as seleções e a apresentação do diário em futuras publicações.

## [4.8.58] - 2026-09-13

- Proesc preserva pagamentos comprovados fora da competência consultada e continua bloqueando conjuntos repetidos entre períodos.
- Receitas futuras do Caixa considera somente obrigações abertas comprovadas e informa a quantidade em conferência.
- Diagnóstico interno guarda motivos específicos de revisão de forma sanitizada, sem alterar a decisão financeira nem o histórico.

## [4.8.57] - 2026-09-13

- Diários importados da T41 e T42 passam a preencher aulas, conteúdo, notas e frequência no fluxo normal, refletindo a carga na grade.
- Datas e resultados escritos são preservados. A carga das aulas é ajustada à exigência oficial da disciplina, com estágio separado.
- Instrumentos repetidos e símbolos documentais continuam identificados na consulta e na prévia do diário.

## [4.8.56] - 2026-09-13

- Posição total do Caixa reconhece os movimentos históricos confirmados da conta Proesc, mantendo as proteções de saldo-base das contas bancárias.
- Inadimplência e margem identificam apuração parcial e exibem quantidade e valor nominal das cobranças em conferência.

## [4.8.54] - 2026-09-13

- Diários técnicos importados exibem aulas, conteúdos, notas e frequência com evidência por célula e pendências de conferência.
- Médias documentadas são preservadas pelo servidor, com proteção contra mistura de lançamentos regulares, mudança de matrícula ou alteração financeira pela importação.
- Consulta histórica mantém fechamento e PDF preenchido protegidos enquanto os registros aguardam conferência acadêmica.

## [4.8.53] - 2026-09-13

- Conciliação Banese, cancelamento Banese e dispatcher Push recuperam uma falha temporária de leitura da configuração com uma única nova tentativa, prazo total e interrupção antes da fila em caso de falha persistente.
- Diagnóstico sanitizado distingue timeout, erro HTTP e recuperação da leitura; o mecanismo não repete operações bancárias, baixas ou envios.

## [4.8.52] - 2026-09-12

### Melhorado

- Configurações inclui Consulta API Proesc com execuções, consultas, baixas e
  erros, filtros por polo e período e histórico fornecido por RPC.
- Consultas Banese distinguem falhas históricas, recuperação comprovada e
  situação atual do título, preservando os eventos originais.
- Diagnóstico CNAB informa configuração pendente e carrega somente nas abas
  que utilizam os arquivos bancários.

### Corrigido

- O painel Proesc suspende atualizações após falha e permite uma nova tentativa
  explícita, sem repetir requisições por refoco ou reconexão.

- Consultas do painel Proesc usam índices de projeção para evitar carregar
  os dados completos das cobranças ao contar os registros.

## [4.8.51] - 2026-09-12

### Corrigido

- Inadimplência e margem do Caixa usam as obrigações com vencimento no mês e
  no polo selecionados, considerando a posição de pagamento no corte do período.
- Obrigações Proesc ainda em conferência ficam fora das bases do indicador e
  são identificadas na tela e no relatório, com cálculo fornecido pelo backend.
- O gráfico Movimentação apresenta uma linha laranja de inadimplência nos
  últimos três meses, usando a mesma regra mensal do indicador.

## [4.8.50] - 2026-09-12

### Melhorado

- Conciliação permite filtrar a origem Proesc ou Banese ao lado da busca,
  com seleção, paginação e totais fornecidos pelo backend.
- A tela remove a ação Atualizar Dados e os textos indevidos de Mercado Pago,
  apresentando a identificação coerente com a origem da conciliação.

## [4.8.49] - 2026-09-12

### Corrigido

- O resumo financeiro técnico inclui o histórico Proesc vinculado e apresenta
  os totais conferidos pelo sistema, preservando valores e datas de pagamento.
- Cobranças importadas usam a classificação comprovada pela origem, sem
  apresentar mensalidade quando o tipo da obrigação ainda está em conferência.

### Melhorado

- As cinco turmas semanais de Aquidabã e Porto da Folha recebem o turno INTEGRAL
  confirmado, com aulas aos sábados e preservação das datas e polos informados.

## [4.8.48] - 2026-09-12

### Melhorado

- Cadastros e matrículas importados do Proesc preservam a identidade por CPF,
  o polo e a situação acadêmica registrada na origem.
- Histórico financeiro das turmas importadas mantém cobranças, valores recebidos
  e datas de pagamento conferidos, sem emitir novos boletos.
- A cobertura de ciclos é conferida por aluno antes de permitir nova geração;
  pendências de turno ou identidade permanecem identificadas para conclusão.
- Turmas com histórico importado distinguem condições financeiras ainda em
  conferência e permitem ajustes acadêmicos sem inventar um plano de cobrança.

## [4.8.47] - 2026-09-12

### Corrigido

- A conciliação Banese reconhece pagamentos no primeiro dia útil bancário após
  vencimento sem expediente, preservando os termos originais da cobrança.
- Caixa e financeiro exibem a composição comprovada de recebimentos Proesc;
  valores sem comprovação continuam identificados como não discriminados.
- Consulta interna isolada permite diagnosticar títulos Banese sem alterar
  cobranças ou executar outras rotinas de manutenção.

## [4.8.46] - 2026-09-12

### Melhorado

- Histórico Proesc da T42 vinculado à Conta Proesc, com recebimentos e datas
  conciliados individualmente e títulos Banese preservados.
- Consulta automática acompanha obrigações confirmadas e registra pagamentos
  comprovados, com proteção contra duplicação e revisão de casos ambíguos.
- Testar token reconhece o contrato V1 e verifica acesso às cobranças, sem
  inferir descontos ou encargos quando a composição não estiver comprovada.

## [4.8.45] - 2026-09-12

### Corrigido

- Contrato completo já emitido no Proesc protege o segundo ciclo da matrícula
  contra geração ou emissão duplicada no Banese.
- Importação interna vincula as cobranças existentes e inclui apenas os registros
  faltantes comprovados, preservando pagamentos e outros alunos.
- A situação financeira identifica emissão Proesc; cobranças do sistema anterior
  sem gateway deixam de oferecer envio de novo boleto ao banco.

## [4.8.44] - 2026-09-12

### Melhorado

- Proesc permite testar o token salvo e apresenta o resultado de acesso a pessoas
  e parcelas, com visual alinhado às outras configurações do sistema.
- Polos recebem Caixa individual automaticamente; a Conta Proesc é compartilhada.
- A lista de contas das unidades inclui as contas compartilhadas e distingue
  corretamente Caixa, Banese e Proesc.

## [4.8.43] - 2026-09-12

### Corrigido

- Proesc apresenta as abas Configuração do token e Histórico por turma.
- O acesso do gestor permite configurar a credencial e acompanhar registros;
  consultas, importações e ajustes ficam restritos à operação interna.
- A descrição da integração é genérica e o histórico distingue importações,
  consultas e atualizações, agrupadas por turma.

## [4.8.42] - 2026-09-12

### Adicionado

- Configurações recebe o submódulo Proesc, com cadastro protegido de token e
  consultas de pessoas e cobranças por período para conferência de histórico.
- Consultas permitem pausa, retomada e navegação pelos registros recebidos,
  sem alterar cobranças ou pagamentos durante a conferência.

## [4.8.41] - 2026-09-12

### Corrigido

- Enfermagem T42 permite gerar manualmente o segundo ciclo sem bloqueio pelo
  histórico financeiro importado do sistema anterior.
- Matrículas trancadas e segundos ciclos já emitidos continuam protegidos.
  Valores, pagamentos, boletos existentes e Radiologia são preservados.

## [4.8.40] - 2026-09-12

### Corrigido

- Recebidos passa a considerar a data do pagamento no período selecionado,
  alinhando indicador, grupos, parcelas e exportação ao critério do Caixa.
- Pendentes, vencidos, cancelados e Todos mantêm o filtro por vencimento.
- Os filtros e o PDF indicam a data usada; o cache anterior é renovado.

## [4.8.39] - 2026-09-12

### Corrigido

- Recebimentos do sistema anterior mostram sua origem histórica e deixam de
  apresentar uma baixa manual sem auditoria registrada.
- O card Parcelas recebidas esclarece o filtro por vencimento e informa que o
  Caixa considera o mês da data do pagamento, inclusive em antecipações.

## [4.8.38] - 2026-09-09

### Corrigido

- A verificação de segurança oferece nova tentativa quando o desafio não responde
  ou apresenta erros repetidos, evitando espera indefinida no acesso.
- Respostas válidas tardias continuam aceitas; tentativas antigas não alteram
  o estado da nova verificação. O login permanece condicionado ao token validado.
- Idioma do Turnstile web normalizado para português do Brasil.

## [4.8.37] - 2026-09-08

### Corrigido

- A escolha de turma técnica sem novas cobranças descarta valores financeiros
  inválidos de um rascunho anterior, evitando erro ao salvar campos já ocultos.
- Dados acadêmicos e bloqueios financeiros são preservados; turmas novas e
  segundo ciclo mantêm seus parâmetros quando selecionados diretamente.

## [4.8.36] - 2026-09-08

### Adicionado

- Cadastro de turma técnica em andamento com opção de gerar apenas o 2º ciclo
  ou manter todas as cobranças no sistema anterior.
- Matrícula antiga e geração automática bloqueadas; histórico externo não
  registra quitação nem recria boletos anteriores.
- Valores, desconto, juros e multa ficam disponíveis somente para novas
  emissões permitidas, com conferência do histórico antes de gerar o 2º ciclo.
- Turmas novas mantêm suas regras; cadastro e vínculo de aluno não emitem cobranças.

## [4.8.35] - 2026-09-08

### Corrigido

- A Receber limita a espera das consultas e oferece nova tentativa em falhas,
  preservando período, turma, busca e página, inclusive nos grupos expandidos.
- Erros não aparecem como lista vazia; filtros cancelam consultas anteriores.
- Timeout do banco não inicia repetição automática prolongada.

## [4.8.34] - 2026-09-07

### Alterado

- Baixas manuais em A Receber mostram o usuário responsável e a data e hora
  da conclusão, com segundos, na lista e nos cartões.
- A data do pagamento permanece separada da auditoria; informações históricas
  ausentes são identificadas, sem inferência de horário ou operador.
- Os dados vêm da consulta autorizada do servidor, preservando os cálculos financeiros.

## [4.8.33] - 2026-09-07

### Alterado

- A Receber abre no mês atual e oferece mês anterior, últimos 30 dias,
  todo o período e intervalo personalizado por vencimento.
- Recebido, A vencer e Em atraso acompanham aluno, turma e período;
  clicar em um indicador filtra a lista e seu total contextual.
- Valores e quantidades permanecem calculados no backend. Datas inválidas,
  carregamento e falhas de consulta não aparecem como saldo zero.

## [4.8.32] - 2026-09-06

### Corrigido

- A Conciliação mostra a data efetiva do pagamento usada no Caixa separada
  da data e hora em que a confirmação foi registrada pelo sistema.
- Recebimentos antigos e futuros usam a mesma apresentação em desktop e celular;
  a ausência de registro não é preenchida com a data do pagamento.
- Datas bancárias, valores e competências financeiras permanecem preservados.

## [4.8.31] - 2026-09-04

### Alterado

- A emissão manual do ciclo técnico passa a mostrar percentual e contagem reais
  dos títulos BolePix já validados e persistidos, começando em `0/total`.
- A situação financeira da turma reúne CPF e matrícula abaixo do aluno, remove
  a coluna redundante e alterna as faixas visuais entre estudantes.
- O carnê dos títulos Banese já emitidos pode ser aberto diretamente na tabela
  financeira da turma pelo compositor oficial existente.

### Segurança e qualidade

- O progresso é acordado apenas nas transições bancárias confirmada ou de
  revisão, sem estimativa temporal, novo POST ou reemissão de título.
- O botão de carnê exige matrícula exata e emissão completa, falha fechado para
  grupos ambíguos e mantém RBAC e escopo de polo.
- Três revisões independentes, 83 contratos, TypeScript, lint, formatação, teto
  de linhas e build de produção foram aprovados.

## [4.8.30] - 2026-09-03

### Alterado

- A emissão do ciclo técnico passa a ocupar a tela com barra animada, tempo decorrido e as etapas de preparação, registro Banese e conferência do retorno.
- Aluno, matrícula, ciclo, quantidade e total permanecem visíveis a partir da prévia revisada, mesmo quando a lista financeira é atualizada durante a requisição.

### Segurança e qualidade

- A barra é explicitamente indeterminada, sem inventar percentual bancário; uma trava síncrona impede clique duplo e mantém o pedido idempotente.
- O contrato Banese não foi alterado, e testes focados cobrem progresso, acessibilidade, snapshot e feedback de interrupção.

## [4.8.29] - 2026-09-02

### Corrigido

- O ciclo técnico aceita o GUI Pix oficial do Banese sem depender de caixa
  alta e persiste o retorno bancário completo de forma atômica.
- Uma emissão interrompida pode ser recuperada internamente por consulta,
  cancelamento confirmado e substituição única, sem recriar os recebíveis e
  sem repetir uma mutação bancária ambígua.

### Segurança e integridade

- Leases, CAS, cooldown e fingerprints cercam cancelamento e reemissão; o
  título antigo é arquivado e não pode voltar a uma cobrança ativa.
- A recuperação real concluiu 13/13 títulos da matrícula afetada com Nosso
  Número distinto, Pix, linha digitável, código de barras, termos confirmados
  e exatamente uma transação por recebível.

### Qualidade

- A correção passou por 40 testes focados, checagem/formatação Deno e revisão
  independente antes da migration e da retomada em produção.

## [4.8.28] - 2026-09-02

### Corrigido

- A emissão integrada do ciclo técnico carrega o estado do pagador pela coluna
  canônica `uf`, eliminando a falha que interrompia o fluxo antes do Banese.
- Erros estruturados do PostgREST passam a apresentar mensagem e código
  legíveis, inclusive quando o objeto não contém uma mensagem conhecida.

### Segurança e integridade

- A retomada reutiliza os 13 recebíveis já preparados e mantém intactas as
  guardas de autorização, idempotência, conciliação por GET e bloqueio de POST
  duplicado.
- A perícia confirmou zero identidade bancária, transação, Pix ou Nosso Número
  na tentativa interrompida; nenhum título remoto foi criado por ela.

### Qualidade

- Os 24 testes focados, o `deno check`, a validação dos termos canônicos e duas
  revisões independentes foram aprovados antes do deploy da Edge versão 3.

## [4.8.27] - 2026-09-02

### Corrigido

- A emissão integrada do ciclo técnico passa a aceitar identificadores legados
  de polo que já são válidos e persistidos como `uuid` pelo PostgreSQL.
- O carregamento inicial, o contexto retomável, os recebíveis e a confirmação
  do emissor Banese usam a mesma validação estrutural de IDs do banco.

### Segurança e integridade

- O identificador idempotente da requisição continua sujeito à validação RFC
  estrita; autorização por polo, fingerprints e contrato BolePix não mudaram.
- As tentativas bloqueadas antes do hotfix não criaram ciclo, recebível, Nosso
  Número, transação ou título remoto e podem ser repetidas sem duplicação.

### Qualidade

- Os 22 testes do fluxo técnico, o `deno check` da Edge Function e uma revisão
  independente sem achados críticos ou importantes foram aprovados.
