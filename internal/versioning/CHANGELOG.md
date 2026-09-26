# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [03/09/2026 a 08/09/2026 — versões 4.8.30 a 4.8.36](./changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md), [02/09/2026 — versões 4.8.27 a 4.8.29](./changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md), [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

## [4.8.97] - 2026-09-26

- Pasta de Identificação e Ficha de Matrícula ampliam dados para até 8,5 pt, rótulos para 6 pt e títulos das seções para 7 pt.
- Campos extensos ajustam a fonte dentro das caixas existentes, preservando o conteúdo completo, as margens e a paginação.
- Foto, QR, assinaturas, cabeçalho institucional e marca d'água mantêm suas dimensões e posições; demais documentos conservam a tipografia anterior.

## [4.8.96] - 2026-09-26

- Pasta de Identificação e Ficha de Matrícula em lote saem em ordem alfabética pelo nome do aluno.
- Os dois lotes incluem apenas matrículas ativas, excluindo trancados e outros vínculos inativos; a situação é revalidada no banco no momento da emissão.
- A associação aluno/documento e os modelos oficiais permanecem preservados.

## [4.8.94] - 2026-09-26

- Caixa preserva a última confirmação explícita válida quando a consulta mensal Proesc não traz informação nova.
- Pagamento, cancelamento, renegociação e divergência de identidade posteriores continuam impedindo a reutilização da prova.
- Data original, autorização e histórico permanecem preservados; a correção não altera cobranças nem confirma títulos sem evidência.

## [4.8.93] - 2026-09-26

- O prazo da consulta Proesc começa após a espera na fila, preservando o cancelamento global.
- Conferências longas retomam páginas completas já consultadas e só concluem com toda a janela válida.
- Identidade, autorização, hashes, prazo de cinco minutos e pausa após falha da fonte permanecem exigidos.

## [4.8.92] - 2026-09-25

- Sincronização Proesc limita cada lote a quatro períodos e compartilha a consulta à API com a revisão de ciclos, evitando rajadas concorrentes.
- Recusa da fonte interrompe novas consultas da execução; prazo, espera entre tentativas, autorizações e evidência completa permanecem exigidos.
- Cinco pagamentos comprovados na V1 foram conciliados; cobranças sem estado comprovado continuam identificadas como pendentes de conferência.

## [4.8.91] - 2026-09-25

- Dispatcher de notificações verifica trabalho elegível antes de chamar o serviço, reduzindo invocações ociosas.
- Avaliação continua a cada minuto e preserva entregas, retries, expiração, campanhas e limpeza de imagens.
- Diagnóstico registra a recuperação do login, a publicação 4.8.90 e os limites conhecidos da investigação de infraestrutura.

## [4.8.90] - 2026-09-25

- Login limita a espera e permite nova tentativa após indisponibilidade, sem continuar navegação de uma resposta antiga.
- Autenticação pública não depende de recuperar uma sessão anterior; servidor interrompe consultas sem resposta preservando a verificação de segurança.
- Validações financeiras permanentes restantes deixam de provocar repetição transacional, mantendo autorizações e cobranças existentes.

## [4.8.89] - 2026-09-25

- Busca de turmas é aplicada automaticamente após uma breve pausa na digitação e retorna à primeira página.
- Contador e cartões mostram carregamento durante a troca de consulta, evitando apresentar resultados anteriores como atuais.
- Enter e Filtrar continuam aplicando a busca e o período; ordenação e escopo são preservados.

## [4.8.88] - 2026-09-25

- Validação administrativa de e-mail consulta o vínculo do responsável pelo serviço autorizado, corrigindo falha de permissão.
- A mesma correção cobre verificações de identidade compartilhada de Aluno, Professor, Gestor e Responsável, preservando divergências de CPF/e-mail como bloqueio.
- Regressão com papéis reais mantém a tabela privada e limita a consulta ao UID solicitado, sem confirmar Auth ou alterar senhas.

## [4.8.87] - 2026-09-25

- Conflitos permanentes na marcação de falha BolePix devolvem HTTP 409, evitando repetição automática ilimitada no PostgREST 14.
- Emissor só marca falha quando possui a reserva da tentativa, preservando o erro original e cobranças concorrentes.
- Regressão SQL com papéis reais cobre falha sem reserva, titularidade divergente e liberação auditada da reserva própria, sem emitir boletos de teste.

## [4.8.86] - 2026-09-25

- Emissão e retomada dos ciclos técnicos corrigidas para executar com as permissões reais do serviço.
- Financeiro direciona ciclos incompletos à turma e não oferece envio bancário paralelo; matrícula sem boleto continua disponível para recebimento.
- Serviço bloqueia emissão genérica de parcelas do ciclo antes de qualquer chamada bancária.
- Regressão SQL com papéis reais valida reserva bancária e preserva estorno auditado, histórico importado e as cobranças existentes.

## [4.8.85] - 2026-09-25

- Retomada de transferência preserva a operação após resposta perdida, inclusive quando a nova consulta de destinos falha.
- Histórico financeiro vincula cada cancelamento à transferência correspondente; entrada respeita permissões financeiras na interface.
- Recuperação bancária verifica a situação acadêmica antes de substituir um título e impede saída durante cancelamento sem confirmação.
- Revisão cruzada mantém consultas, cobranças importadas, registros locais e pagamentos existentes.

## [4.8.84] - 2026-09-24

- Recebimento por transferência permite revisar disciplinas, aproveitamentos, ciclo inicial, quantidade de parcelas e vencimento, sem emissão automática.
- Saída apresenta as cobranças por origem e preserva pagamentos e vencimentos até a data da transferência; cancelamento bancário depende de confirmação.
- Transferência interna mantém os títulos na origem e protege a continuidade contra duplicação; o financeiro permite consultar as matrículas anteriores.
- Admissão regular em turma importada e fechamento acadêmico respeitam o histórico individual e os aproveitamentos válidos.

## [4.8.83] - 2026-09-24

- Consolida o contrato dos ciclos técnicos, matrícula sem boleto, baixa e estorno auditado na memória e na política financeira.
- Registra as provas da revisão e os testes que protegem as regras publicadas na 4.8.82.

## [4.8.82] - 2026-09-24

- Recebimento da matrícula local oferece contas compatíveis com o polo e bloqueia confirmação quando a consulta falha.
- Estorno local registra operador, motivo e baixa exata, preservando o ciclo e impedindo que uma repetição desfaça um pagamento posterior.
- Testes de recuperação protegem a matrícula sem boleto e mantêm as consultas e emissões bancárias existentes.

## [4.8.81] - 2026-09-24

- A primeira etapa do ciclo mostra a data inicial e o vencimento da primeira mensalidade.
- Matrícula pode ser emitida com boleto, registrada sem boleto para baixa manual ou omitida do ciclo.
- Registro sem boleto permite confirmar recebimento com data, conta, forma, valor e ajustes pelo fluxo financeiro existente.
- Retomada, progresso, carnê e segundo ciclo distinguem a matrícula local dos 12 títulos bancários, sem duplicação.

## [4.8.80] - 2026-09-24

- Pagamento bancário comprovado preserva o reconhecimento da emissão do ciclo, sem permitir nova emissão de parcela paga.
- Vencimentos revisados ficam protegidos contra alterações posteriores à preparação do ciclo.
- Modal permite voltar após falha na prévia e reinicia datas e revisão quando o ciclo muda, preservando uma emissão em andamento.

## [4.8.79] - 2026-09-24

- Corrige a regressão que impedia carregar todos os alunos da turma quando havia histórico financeiro protegido sem ciclo completo comprovado.
- Preserva os bloqueios de geração e apresenta histórico existente sem afirmar emissão ou pagamento.

## [4.8.78] - 2026-09-24

- Alunos técnicos novos podem iniciar o primeiro ciclo em turmas em andamento, com proteção individual contra cobranças Banese/Proesc já vinculadas e histórico da transferência.
- Carnê permite revisar valor, vencimento, desconto, juros e multa de cada cobrança e escolher se haverá boleto da matrícula, sem registrar pagamento automaticamente.
- Segundo ciclo pode ser solicitado após a emissão integral do primeiro; retomadas preservam os títulos existentes.
- Matrícula emitida pelo ciclo manual aparece no carnê, junto às mensalidades.

## [4.8.77] - 2026-09-22

- Caixa solicita somente os três meses apresentados no gráfico, preservando os valores e cálculos canônicos do período escolhido.
- Diagnóstico interno de parcelas Proesc V2 preparado para conferir situação explícita, com leitura limitada e sem alterar cobranças.
- Indicadores mantêm separadas as obrigações sem evidência suficiente; ausência de pagamento observado não é tratada como inadimplência confirmada.

## [4.8.76] - 2026-09-21

- A limpeza dos sinais internos vencidos passa a ter execução periódica, preservando o prazo existente de 24 horas.
- Telas de Gestão recebem apenas novos sinais; a expiração técnica não provoca recargas desnecessárias.
- Manutenção em lotes limitados, com privilégios mínimos, sem alterar registros financeiros ou logs de acesso.

## [4.8.75] - 2026-09-21

- Caixa mantém filtros e resumos independentes disponíveis durante consultas de competência e polo.
- Requisições obsoletas são canceladas; a troca de polo preserva o mês escolhido sem preparar outro período.
- Consultas mensais filtram fatos antes da classificação e reutilizam posições bancárias e evidências sem alterar os resultados financeiros.
- Previstas a vencer passa a ser um valor canônico do banco; o frontend somente exibe o resultado.

## [4.8.74] - 2026-09-21

- Arquivamento técnico Proesc ativado após verificação real de leitura e restauração.
- Rotina transfere detalhes antigos para Storage privado em lotes limitados, preservando fatos financeiros e referências.
- Ativação verifica integridade, permissões e agendamento antes de habilitar a operação automática.

## [4.8.73] - 2026-09-21

- Conferências Proesc sem mudança reutilizam evidência validada e preservam totais por execução.
- Histórico técnico antigo preparado para arquivo privado com integridade, leitura autorizada e restauração.
- Repetição de consultas após falhas transitórias passa a respeitar espera progressiva limitada.
- Ativação do arquivamento condicionada à validação integrada e ao piloto recuperável.

## [4.8.72] - 2026-09-19

- Histórico técnico Proesc arquivado e compactado com preservação dos dados financeiros e recuperação de recibos antigos.
- Consultas repetidas reduzidas para pagamentos comprovados e cobranças abertas elegíveis, com revalidação após alterações.
- Manutenção automática do armazenamento e proteção contra reaplicação de operações financeiras.

## [4.8.71] - 2026-09-19

- Ficha do aluno com navegação compacta, formulários alinhados e apresentação consistente em desktop e celular, preservando campos e ações.
- Edição protege o rascunho ao trocar de aba ou voltar; falhas de salvamento mantêm os dados digitados.
- Sexo e órgão/UF apresentam dados legados corretamente; consulta de CEP ocorre somente após alteração.

## [4.8.70] - 2026-09-19

- Pasta de identificação remove o quadro quando a foto está ausente ou indisponível e amplia os dados superiores; foto válida preserva o layout.
- Título eleitoral recebe formatação com espaços, órgão expedidor não exibe barra final e reservista feminino apresenta NÃO POSSUI.
- Prévia e PDF mantêm o modelo configurado, os dados congelados e a marca d’água.

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
