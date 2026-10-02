# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [16/09/2026 a 25/09/2026 — versões 4.8.65 a 4.8.90](./changelog/2026-09-16-a-2026-09-25-versoes-4-8-65-a-4-8-90.md), [13/09/2026 — versões 4.8.53 a 4.8.64](./changelog/2026-09-13-versoes-4-8-53-a-4-8-64.md), [08/09/2026 a 12/09/2026 — versões 4.8.37 a 4.8.52](./changelog/2026-09-08-a-2026-09-12-versoes-4-8-37-a-4-8-52.md), [03/09/2026 a 08/09/2026 — versões 4.8.30 a 4.8.36](./changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md), [02/09/2026 — versões 4.8.27 a 4.8.29](./changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md), [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

## [4.8.151] - 2026-10-02

- Atividades extra-classe aceitam prazos retroativos para registrar a implantação de turmas já iniciadas, preservando os limites operacionais e o prazo de novas entregas dos alunos.
- Planejamento da grade passa a permitir editar título, prazo e carga das atividades sem respostas; alterações concorrentes exigem revisar os dados atuais.
- Exclusão na grade arquiva de forma recuperável, informa o impacto nos totais e no portal e preserva respostas e notas. Restauração mantém o estado original, sem publicar rascunhos; arquivos antigos sem origem registrada permanecem protegidos.
- Regressões SQL isoladas e de interação verificam permissões, cargas horárias, datas, recuperação, concorrência otimista e preservação dos dados.

## [4.8.150] - 2026-10-02

- Caixa separa o aberto da competência da carteira geral, com valores confirmados vencidos e a vencer calculados no servidor.
- Avisos abrem registros locais em conferência, com valor nominal cadastrado, motivos e paginação por polo/competência, sem apresentá-los como dívida comprovada.
- Atualização automática pelo sistema, sem botão manual na lista; tentativa manual permanece no erro. Registros não confirmados ficam fora dos indicadores, preservando pagamentos e histórico.
- Retirada autorizada de 22 registros contestados com arquivo privado recuperável; confirmação pontual de quitação exige prova do portal, preservando o retorno original da V2 e as datas reais do pagamento.

## [4.8.149] - 2026-10-01

- Proesc passa a consultar exclusivamente a V2, com paginação completa, identidade validada e histórico V1 preservado sem novas chamadas.
- Outubro começa com abertura operacional zero nos quatro polos; o encerramento de setembro discrimina o histórico sem incorporá-lo ao saldo novo.
- Caixa e PDF mostram subtotais financeiros identificados mesmo com composição parcial. Pagamentos pontuais compatíveis com as três regras homologadas têm desconto calculado automaticamente.
- Ausências, pagamentos parciais e composição atrasada sem prova permanecem em conferência; nenhuma tarifa ou baixa é inventada.

## [4.8.148] - 2026-10-01

- A metade inferior do Caixa passa a usar uma leitura contínua e imersiva, sem esconder os antigos cards dentro de gavetas visualmente idênticas.
- Pulso operacional, contas e conciliação formam um único painel; posição, patrimônio, convênios, financiamento e linha de corte ganham mapas e fluxos próprios.
- Valores, percentuais e estados continuam vindos das RPCs canônicas; o frontend limita-se à composição visual e não recalcula finanças.

## [4.8.147] - 2026-10-01

- Caixa reorganizado em uma jornada imersiva que separa fluxo realizado, compromissos, composição financeira, distribuição, conciliação e posição estrutural sem remover leituras existentes.
- Novos cards de composição dos recebimentos e das despesas usam a mesma fonte canônica do PDF; gráficos de rosca, barras e linhas preservam percentuais e valores calculados pelo backend.
- Contas a receber, contas a pagar, obrigações futuras e vencidas, patrimônio, convênios, financiamento e linha de corte permanecem disponíveis com estados parciais e indisponíveis explícitos.

## [4.8.146] - 2026-10-01

- Corrige a autorização de emissão do segundo ciclo criado neste sistema após primeiro ciclo confirmado no Proesc, sem recriar recebíveis ou liberar histórico protegido.
- Esclarece que a situação dos ciclos importados é conferida por aluno e inclui regressão da retomada e das três guardas bancárias.

## [4.8.145] - 2026-10-01

- Documenta a passagem durável por matrícula e ciclo, a separação entre histórico Proesc e operação Banese e o cancelamento confirmado após trancamento.
- Inclui skill financeira versionada, orientação sob demanda e auditoria da validação e publicação de 4.8.144, sem alterar as regras de execução dessa versão.

## [4.8.144] - 2026-09-30

- Continuidade individual dos ciclos importados com prova durável, sem depender de renovação de cache Proesc.
- Proteção contra duplicidade de ciclo e preservação de históricos Proesc somente para consulta.
- Trancamento com prévia, cancelamento Banese confirmado e preservação de pagamentos e vencimentos anteriores ao corte.
- Ações financeiras autorizadas pela origem canônica da cobrança; cancelados permanecem no histórico e saem do saldo em aberto.

## [4.8.143] - 2026-09-30

- Financeiro da turma ganha painel, regras e listagem mais compactos, preservando dados, cálculos e funcionalidades existentes.
- Valores iniciam ocultos no painel, cronograma e lista; controle acessível permite exibir ou ocultar em conjunto, com proteção durante a edição.
- Ações por aluno são organizadas em próximo passo e acessos identificados; cobrança usa painel expansível acessível sem corte na última linha.

## [4.8.142] - 2026-09-30

- A confirmação do ciclo técnico envia os itens da prévia revisada, eliminando a revisão vazia que bloqueava a emissão mesmo após a composição correta.
- Os três modos de matrícula mantêm seus destinos: boleto, registro local sem boleto e omissão; matrícula local retroativa não é enviada ao banco.
- O teste integrado atravessa o handler real, a validação da Edge Function e o orquestrador com banco simulado, incluindo as 12 mensalidades, clique repetido e recuperação de erro.

## [4.8.140] - 2026-09-30

- Alunos da T42 com primeiro ciclo importado e confirmado localmente seguem para o segundo ciclo sem depender de nova consulta online ao Proesc; cobranças futuras permanecem no sistema local e são emitidas pelo Banese.
- No primeiro ciclo da T46, a escolha de registrar matrícula sem boleto ocorre antes da primeira prévia e permite vencimento retroativo controlado sem emitir título bancário para a matrícula.
- Alterar a data da matrícula local recalcula a Mensalidade 1 para o mês seguinte e mantém as demais em sequência por mês-calendário; os modos boleto, omitir e o segundo ciclo permanecem protegidos.

## [4.8.139] - 2026-09-30

- A conferência Proesc do 2º ciclo da T42 retoma com lease distribuído e prazo limitado, sem transformar processamento concorrente em erro permanente.
- A T46 aceita matrícula local sem boleto com data retroativa controlada; a primeira mensalidade fica independente e recalcula as seguintes por mês-calendário.
- A prévia da regra financeira deixa de permanecer em “Aguardando cálculo” quando o servidor já confirmou a composição.
- O último título histórico incorreto da T46 foi substituído com vencimento em 15/10/2026, preservando o recebível, as outras onze cobranças e o run paralelo.

## [4.8.138] - 2026-09-30

- O cadastro de aluno bloqueia clique, Enter, cancelamento e troca de etapa enquanto o salvamento está em andamento.
- O botão exibe “Salvando...” com indicador de progresso e impede que a mesma solicitação seja disparada novamente antes da resposta.
- Falhas liberam a trava para nova tentativa, preservando a mensagem canônica da mutation e evitando o falso retorno “Aluno já cadastrado” causado por replay.

## [4.8.137] - 2026-09-30

- Cadastro de professor exige somente polo, nome e CPF; os demais dados permanecem opcionais e falhas aparecem na própria etapa.
- Polos são exibidos verticalmente, com nome e cidade/UF em duas linhas, e o polo real selecionado é persistido sem substituição pela matriz.
- Chave Pix ganha tipo controlado (CPF, CNPJ, telefone, e-mail ou aleatória), máscara e validação correspondentes; conta corrente/poupança passa a respeitar o contrato aceito pelo banco.

## [4.8.136] - 2026-09-30

- Matrículas da Turma exibem a mesma foto já cadastrada no perfil do aluno, sem consulta paralela no navegador.
- Alunos sem foto ou com arquivo indisponível continuam identificados pela inicial, sem imagem quebrada.
- A RPC acadêmica preserva autorização por turma, grants mínimos e a ordem dos dez campos já existentes.

## [4.8.135] - 2026-09-30

- Juros, multa, desconto e outros acréscimos da baixa manual formatam cada dígito imediatamente como centavos: `1` vira `R$ 0,01`, `19` vira `R$ 0,19` e `190` vira `R$ 1,90`.
- Milhares e centavos seguem o padrão brasileiro durante a digitação, a colagem e a exclusão, com teclado numérico em dispositivos compatíveis.
- Cálculo, parser do payload, idempotência e validação financeira do servidor permanecem inalterados.

## [4.8.134] - 2026-09-30

- Cadastro e acesso do aluno aceitam e-mail vazio; nesse caso o login usa a matrícula e o primeiro acesso é entregue por link seguro, sem validação de caixa postal.
- E-mails reais continuam validados e confirmados antes do acesso assistido, preservando o contrato de segurança existente.
- Busca global exibe a foto autorizada do cadastro e reduz proporcionalmente sua tipografia; o nome no card do aluno também fica mais compacto.

## [4.8.133] - 2026-09-30

- Corrige a tela branca do Portal do Gestor para perfis globais ao gerar a chave segura da busca com escopo de polos nulo.
- Adiciona regressão para o escopo global e preserva a ordenação dos polos restritos sem alterar o perfil em memória.

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

