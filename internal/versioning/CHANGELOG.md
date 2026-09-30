# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [08/09/2026 a 12/09/2026 — versões 4.8.37 a 4.8.52](./changelog/2026-09-08-a-2026-09-12-versoes-4-8-37-a-4-8-52.md), [03/09/2026 a 08/09/2026 — versões 4.8.30 a 4.8.36](./changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md), [02/09/2026 — versões 4.8.27 a 4.8.29](./changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md), [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

## [4.8.132] - 2026-09-30

- Busca global passa a localizar alunos, professores, pessoas físicas e jurídicas em todos os polos autorizados ao usuário, sem depender do polo selecionado.
- Resultados mostram nome, CPF/CNPJ formatado, cidade/UF e turma; ao escolher outro polo, o portal conclui a troca antes de abrir o cadastro.
- Cards de alunos ganham foto maior, CPF legível, nascimento antes da filiação e removem repetições de polo e turma.
- Busca e filtros de parceiros tornam-se controlados, com botão de limpar e restauração correta dos resultados após trocar status, aba ou filtro.

## [4.8.131] - 2026-09-30

- Juros, multa, desconto e acréscimos da baixa manual passam a normalizar automaticamente valores como `19` para `R$ 19,00`, com agrupamento brasileiro e duas casas decimais.
- Novo crédito em Outros Créditos abre como workspace de tela cheia fora do PDV, com rolagem interna, bloqueio da página e navegação de foco contida.
- Órgão expedidor volta a aparecer para CIN e CNH no cadastro, na edição e na consulta do aluno, sempre pelo catálogo controlado e sem texto livre.

## [4.8.130] - 2026-09-29

- Confirmação de recebimento destaca o valor da cobrança, cada ajuste e o valor final recebido em uma composição profissional e responsiva.
- Desconto reduz automaticamente o valor recebido; juros, multa e outros acréscimos o atualizam em centavos, com bloqueio de composições inválidas.
- Conta bancária e forma de pagamento passam a usar comboboxes pesquisáveis próprios, acessíveis por teclado e sem menus genéricos do navegador.

## [4.8.129] - 2026-09-29

- Usuários da aba Alunos sem acesso ao Financeiro passam diretamente da seleção do aluno para a confirmação do vínculo acadêmico.
- O fluxo simplificado não exibe valores, vencimentos ou condições financeiras e mantém toda cobrança pendente para um usuário autorizado.
- Falhas ao carregar o contexto mínimo bloqueiam a confirmação e oferecem nova tentativa, enquanto o assistente financeiro completo permanece inalterado.

## [4.8.128] - 2026-09-28

- Checklist do aluno oferece confirmação direta de entrega sem anexo, correção do registro e ações de visualizar e excluir arquivos.
- Órgão emissor usa catálogo pesquisável no cadastro e na edição, com bloqueio de novos textos livres no banco e preservação dos dados históricos.
- Exclusão protege arquivos compartilhados e versões atuais; histórico não arquiva a versão ativa, e falhas parciais informam como retomar.

## [4.8.127] - 2026-09-27

- Pasta e Ficha passam a registrar a matrícula canônica; emissões antigas com correspondência comprovada recuperam o número sem trocar código ou datas.
- CIN aparece uma única vez nos modelos acadêmicos e na carteirinha, preservando RG e CPF separados quando esse é o tipo cadastrado.
- Histórico oferece atualização explícita da identificação com nova versão, preservando a emissão original e a repetição segura da solicitação.

## [4.8.126] - 2026-09-27

- Consulta pública restaura os campos autorizados para carteirinhas e documentos acadêmicos, preservando máscaras e dados registrados na emissão.
- Bloqueio de consulta e campos desmarcados voltam a ser respeitados pelo backend, incluindo o Diário assinado.
- Quantidade de emissões habilitada aparece também na primeira emissão; testes verificam a definição final da consulta e a renderização dos campos.

## [4.8.124] - 2026-09-27

- Caixa volta a abrir diretamente a análise mensal com consolidado, Matriz, Aquidabã, Propriá e Porto da Folha.
- O cockpit de compromissos e vencimentos passa ao topo do Resumo do Financeiro, escopado pelo polo selecionado e sem cálculo financeiro no frontend.
- Início remove o Radar financeiro duplicado e mantém somente um atalho compacto autorizado; o cockpit adota superfícies claras e deixa de exibir camadas ainda indisponíveis.

## [4.8.123] - 2026-09-27

- Workspace v2 do Caixa passa a exigir empresa e autorizar identidade, perfil, módulo e escopo antes de ler o snapshot financeiro.
- Caixa abre um cockpit responsivo com competência, pagamentos, valores a vencer, atraso e agenda D0–D+7; os KPIs abrem o drill-down paginado canônico.
- Cockpit e análise mensal funcionam em modos exclusivos no mesmo polo, preservando gráficos, patrimônio e relatórios sem misturar snapshots ou calcular valores no frontend.
- Realtime invalida empresa e polo atingidos e relê o snapshot; o consolidado legado fica desabilitado neste cutover para impedir cruzamento entre empresas.

## [4.8.122] - 2026-09-27

- Caixa recebe o núcleo privado e canônico do Workspace v2, com um único snapshot por polo, competência e corte institucional.
- Compromissos abertos usam apenas o saldo remanescente e não reduzem o realizado; somente pagamentos com valor efetivamente confirmado afetam a posição registrada.
- Contrato v2 expõe origem, completude e limitações de cada seção, mantendo cálculos, classificação e reconciliação exclusivamente na RPC.

## [4.8.121] - 2026-09-27

- Caixa passa a separar contas da competência, pagamentos efetivos, valores a vencer e contas em atraso sem reduzir o realizado por compromissos ainda abertos.
- Início adota presets Acadêmico, Financeiro e Misto e mostra atraso, vencimentos de hoje e próximos sete dias em um Radar separado do calendário oficial.
- Rateios parciais, escopo por polo, fuso de Maceió e permissões de Caixa ou Financeiro/Despesas são calculados e autorizados pela RPC canônica.

## [4.8.120] - 2026-09-27

- Acesso remoto à interface, smoke autenticado e automação CUA do projeto passam a usar exclusivamente o Safari.
- Se não houver sessão útil no Safari, a pendência é registrada sem abrir ou automatizar o Google Chrome.

## [4.8.119] - 2026-09-27

- Nacionalidade e naturalidade passam a aceitar digitação livre com sugestões padronizadas de países e municípios, preservando localidades históricas.
- Nome social continua opcional; quando vazio, telas e documentos usam o nome completo sem duplicá-lo no cadastro.
- CIN passa a usar oficialmente o CPF como número único, sem presumir ou apagar RGs antigos; documentos legados ambíguos ficam sinalizados para revisão.
- Ensino Médio, EJA e documentos continuam informativos e não bloqueiam a ativação acadêmica em turma iniciada.

## [4.8.118] - 2026-09-27

- Despesas Fixas ganha tabela compacta sem rolagem horizontal, descrição integral, linhas alternadas e ações sempre visíveis.
- Pendentes e vencidas podem ser selecionadas e excluídas individualmente ou em lote, sem justificativa manual e com trilha de auditoria preservada.
- Modais de edição, baixa, cancelamento e exclusão passam a ocupar corretamente o viewport, sem ficar presos ao conteúdo da página.

## [4.8.117] - 2026-09-27

- Faculdade parceira passa a usar um combobox próprio do sistema, sem o seletor nativo do navegador.
- Clique ou foco com a busca vazia lista todas as faculdades; a digitação filtra por nome ou CNPJ.
- O painel mantém seleção canônica, estados vazios e navegação por teclado sem alterar as regras financeiras do convênio.

## [4.8.116] - 2026-09-27

- Novo Convênio deixa de aceitar nome digitado e passa a exigir uma PJ cadastrada como `FACULDADE PARCEIRA / AFILIADO`.
- O seletor mostra somente as faculdades globais ou vinculadas ao polo, incluindo Anhanguera e Unopar na Matriz.
- O nome é derivado do cadastro também no backend, e o texto informativo sobre polo e primeiro aporte foi removido.

## [4.8.115] - 2026-09-27

- O cadastro inicial passa a informar explicitamente que os dados do Ensino Médio são opcionais e não bloqueiam a ativação da matrícula técnica.

## [4.8.114] - 2026-09-27

- Matrícula regular em turma técnica iniciada passa a confirmar `ATIVO` na própria transação, sem aguardar documentos, pagamento ou emissão de boleto.
- Novo ingresso exige cadastro pessoal, filiação e endereço completos; Ensino Médio é informativo, aceita `EJA` e não bloqueia a matrícula. O financeiro permanece pendente para conclusão posterior.
- Gestão e Secretaria distinguem status cadastral, pendências acadêmicas e estados de saída, atualizando os cards imediatamente após o vínculo.

## [4.8.113] - 2026-09-27

- Convênios volta a aparecer para usuários que já possuíam acesso financeiro completo, sem ampliar perfis restritos.
- O modal de Convênios ocupa a viewport e o aviso “Polo responsável...” foi removido.
- Competências passam a usar `MM/AAAA`; datas das carteirinhas usam `DD/MM/AAAA` em emissão, portal e segunda via.
- O relatório financeiro mensal adota `MM/AAAA` e respeita o mês civil de Maceió.

## [4.8.112] - 2026-09-27

- A ficha detalhada do aluno remove o atalho “Imprimir ficha”.
- As abas Cadastro, Cursos, Matrículas e demais áreas ganham peso visual maior, preservando o layout compacto e a navegação responsiva.

## [4.8.111] - 2026-09-27

- Financeiro ganha o submódulo Convênios, com competências mensais, créditos, despesas vinculadas e fechamento manual com transporte de saldo.
- Contas a Pagar permite vincular uma despesa ao convênio do mesmo polo sem duplicar a saída; Caixa e relatório v7 mostram a posição separada sem recompor os totais físicos.
- Permissões granulares, RLS, idempotência, Realtime e índices de integridade protegem o fluxo em produção.

## [4.8.110] - 2026-09-26

- Cupom do PDV apresenta CPF/CNPJ com pontuação e preserva a máscara dos dois primeiros e três últimos dígitos.
- Recibo identifica a matrícula canônica do aluno quando disponível.

## [4.8.109] - 2026-09-26

- Recibo do PDV ganha formato de cupom compacto em 58/80 mm, com cabeçalho reduzido, dados alinhados, total em destaque e fundo branco sem marca d’água.

## [4.8.108] - 2026-09-26

- PDV consulta a confirmação bancária com prioridade temporária, orçamento compartilhado e pausa após pagamento, saída da tela ou indisponibilidade.
- Comprovante usa pagamento confirmado, PDF vetorial e envio auditado; reimpressão exige decisão explícita e motivo.
- Configurações reúne estações, impressoras e modelo de recibo; impressão pelo navegador preserva a escolha do operador e automático aguarda homologação.

## [4.8.107] - 2026-09-26

- Novo recebimento ganha jornada imersiva com etapas visuais, formulário hierarquizado e resumo financeiro atualizado em tempo real.
- Busca e seleção de pagador recebem estados mais claros; emissão, valores, elegibilidade e contrato BolePix permanecem inalterados.

## [4.8.106] - 2026-09-26

- PDV usa logo Universo, azul institucional e detalhe vermelho, com formulário e resumo compactos.
- Tela de pagamento destaca QR e valor canônico; estados de pagamento e guardas de cobrança são preservados.

## [4.8.105] - 2026-09-26

- Painel Banese agrupa eventos Realtime e reutiliza consultas em andamento; saída da tela cancela leituras e falhas respeitam espera limitada.
- Compactação Proesc evita reconstruir o histórico quando o lote não tem candidatos, preservando as provas e permissões dos lotes com trabalho.

## [4.8.104] - 2026-09-26

- Recuperação de BolePix avulso consulta o banco antes de cancelar e exige confirmação bancária antes da substituição autorizada.
- Substituição usa tentativa única persistida, preserva dados do atendimento e salva o Pix oficial retornado na criação.

## [4.8.103] - 2026-09-26

- Banese aceita multa isenta oficial (tipo 3) com valor nulo/zero, preservando bloqueio de valores incompatíveis e recuperação GET-only.
- PDV acompanha eventos da própria cobrança em Realtime, inclusive durante conferência, sem depender de botão de sincronização.
- Valor recebe máscara durante a digitação; vencimento inicia com a data local de hoje e permanece editável.
- Cadastro de categoria abre no PDV sem perder o atendimento; CPF/CNPJ exibe somente dois primeiros e três últimos dígitos.

## [4.8.102] - 2026-09-26

- Leitura do PDV rejeita cobranças vinculadas a cronograma e lançamentos de matrícula, parcela, rematrícula ou dependência, mesmo sem matrícula/turma preenchidas.
- Revisão do PDV registra publicação e smoke de produção da 4.8.100, preservando os demais fluxos financeiros.

## [4.8.101] - 2026-09-26

- Pasta de Identificação e Ficha de Matrícula ampliam dados para até 8,5 pt, rótulos para 6 pt e títulos das seções para 7 pt.
- Campos extensos ajustam a fonte dentro das caixas existentes, preservando o conteúdo completo, as margens e a paginação.
- Foto, QR, assinaturas, cabeçalho institucional e marca d'água mantêm suas dimensões e posições; demais documentos conservam a tipografia anterior.

## [4.8.100] - 2026-09-26

- Outros Créditos oferece PDV dedicado em tela cheia, com busca do pagador, valor e vencimento para gerar uma única cobrança BolePix.
- QR Pix oficial, boleto e acompanhamento ficam no atendimento; link bancário e lançamentos locais permanecem disponíveis.
- Lista e indicadores de Outros Créditos excluem cobranças acadêmicas, que permanecem em A Receber; nenhum título é alterado ou excluído.
- Identificadores legados de polo são aceitos com validação de cadastro e autorização; somente a rota BolePix de Outros Créditos em produção foi habilitada.
- Caixa consulta os três meses já exibidos e diferencia cancelamentos solicitados de falhas reais.

## [4.8.99] - 2026-09-26

- Matrícula técnica regular em turma iniciada ativa o vínculo acadêmico e libera carteirinha e ficha de matrícula sem aguardar pagamento ou conferência documental.
- Matrículas registradas antes do início são ativadas ao iniciar a turma; vínculos pendentes em turmas já iniciadas são regularizados.
- Financeiro e checklist permanecem acompanhados separadamente, preservando cobranças, permissões, implantação e situações de saída acadêmica.

## [4.8.97] - 2026-09-26

- Nova emissão da Ficha de Matrícula incorpora a foto cadastrada ou alterada após a primeira emissão.
- Ausência de foto mantém o espaço para colagem; Pasta de Identificação conserva seu comportamento.
- Versões anteriores, modelos, marca d’água e repetição segura da solicitação permanecem preservados.

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
