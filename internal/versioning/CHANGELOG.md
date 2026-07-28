# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

## [2.2.3-beta.8] - 2026-07-27

### Adicionado

- A primeira página do PDF do Caixa apresenta as receitas recebidas de EAD, especialização, cursos técnicos e cursos livres.
- O resumo financeiro por turma informa o valor previsto na competência, o valor recebido no mês e o saldo vencido ainda não liquidado.
- Quando há mais de cinco turmas com movimento, as demais aparecem consolidadas em uma linha calculada pelo backend.

### Alterado

- O cabeçalho institucional do relatório foi alinhado ao mesmo eixo de títulos, tabelas e rodapé.

### Segurança

- Todos os valores do novo resumo são agregados pela RPC segura e respeitam o polo autorizado; o frontend apenas exibe o contrato canônico.

## [2.2.3-beta.7] - 2026-07-27

### Corrigido

- Títulos, descrições, cards, tabelas e rodapé da prestação de contas foram recuados para não sobrepor a faixa azul do fundo institucional.
- A marca d’água e os demais elementos do modelo institucional permanecem inalterados.

## [2.2.3-beta.6] - 2026-07-27

### Alterado

- O botão da prestação em PDF fica ao lado do seletor de competência, com explicação acessível por foco ou ao passar o mouse.
- Resultado geral e navegação entre todas as unidades aparecem somente quando a matriz está selecionada e o gestor possui escopo global.
- Ao acessar Aquidabã ou Porto da Folha, o módulo Caixa permanece restrito visualmente à unidade selecionada.

### Segurança

- A interface acompanha o escopo da unidade ativa, enquanto as RPCs continuam bloqueando consultas fora dos polos autorizados do usuário.

## [2.2.3-beta.5] - 2026-07-27

### Adicionado

- Prestação mensal do Caixa com visão consolidada e individual por polo, saldo contábil registrado, superávit ou déficit, inadimplência e obrigações vencidas.
- Pré-visualização e exportação em PDF com cabeçalho institucional, marca d’água, resumo executivo e tabelas completas de recebimentos e despesas.
- Conta Caixa individual para cada unidade e posição gerencial por polo na conta Banese compartilhada.

### Alterado

- A conta Banese da matriz pode ser utilizada pelos três polos sem duplicar o saldo físico no Resultado geral.
- A seleção de contas nas baixas exibe banco, agência, conta, titular, cidade/UF e saldo contábil canônico.
- Indicadores, composições financeiras e totais do relatório são calculados integralmente pelo backend.

### Corrigido

- A cobrança EAD de teste permanece registrada pelo valor bruto confirmado de R$ 14,90, sem tarifa bancária presumida.
- Contas excluídas ou inativas deixam de aparecer como disponíveis, preservando apenas o histórico necessário.
- Despesas espelhadas entre lançamentos e contas a pagar não são contadas duas vezes.

### Segurança

- O relatório detalhado exige permissão explícita do módulo Caixa e respeita o escopo autorizado de cada polo.
- CPF, contato, anexos e dados internos do gateway não são incluídos no PDF; o documento é identificado como confidencial e de uso interno.

## [2.2.3-beta.4] - 2026-07-27

### Adicionado

- Progresso explícito da promoção automática, mostrando tempo estável, títulos válidos exigidos e o próximo perfil.
- Quatro perfis temporários gerais e quatro perfis temporários com prioridade para EAD e vencimentos entre D−2 e D+2.
- Quatro capacidades de 300, 450, 600 e 750 requisições por minuto visíveis como “aguardando retorno”, sem possibilidade de ativação.

### Alterado

- O perfil fica bloqueado para edição no modo automático; o próprio autopiloto evolui até P10 após uma hora e a amostra real exigida para cada capacidade.
- P11–P16 permanecem testes manuais de 30 minutos; erro, HTTP 429, timeout ou lote incompleto nos perfis altos retorna diretamente ao P8.
- EAD passa à frente de toda a fila; títulos não-EAD distantes do vencimento deixam de ser consultados a cada cinco minutos.

### Corrigido

- Uma execução antiga não pode mais sobrescrever uma alteração recente do seletor; cada lote carrega a versão da configuração que iniciou.
- A abertura do submódulo retorna ao título da página e a tipografia usa a fonte nativa do sistema, peso máximo 700 e tamanho mínimo legível.
- O worker ganhou timeout, cancelamento compartilhado, validação das gravações de auditoria e contagem de lote incompleto como falha.
- Falha de autenticação agora recua o perfil efetivo antes de suspender o circuito.
- Uma baixa concluída após o prazo-alvo permanece registrada como paga ou pendente; o atraso vira alerta e nunca é convertido em erro financeiro.

### Segurança

- O worker continua restrito à consulta e baixa de títulos existentes; os testes realizados não emitiram, reemitiram ou cancelaram cobranças.
- HTTP 429 interrompe o lote imediatamente, recua ao fallback seguro e aplica resfriamento de uma hora.
- Um ensaio local cronometrado aceitou 60 chamadas em uma janela de um minuto e classificou a 61ª como HTTP 429, sem acessar o Banese.

## [2.2.3-beta.3] - 2026-07-27

### Adicionado

- Submódulo Consulta API Banese com 12 perfis operacionais, prioridade EAD, exemplos de capacidade e visão clara do perfil anterior, efetivo e teto selecionado.
- Histórico de execuções paginado por hora, agrupado em janelas de 10 minutos, com pesquisa, período e filtro exclusivo de erros.
- Painel de saúde com resumo dos erros e das limitações HTTP 429 ocorridas na última hora.

### Alterado

- O modo automático evolui gradualmente até o teto conservador escolhido, reutiliza OAuth válido e recua ao detectar limitação ou taxa elevada de falhas.
- Os ciclos de cobrança passam a obedecer à quantidade de parcelas configurada no curso ou na turma, sem assumir doze parcelas fixas.

### Corrigido

- A seleção visual de perfil agora diferencia o teto configurado do perfil realmente executado pelo automático.
- Promoções automáticas exigem execução válida e amostra real; falhas reiniciam a estabilidade antes de qualquer avanço.

### Segurança

- Os quatro perfis avançados de 30, 60, 90 e 150 títulos por minuto permanecem bloqueados até autorização formal do Banese.
- O módulo consulta apenas títulos já emitidos e não cria, reemite, cancela nem gera cobranças.

## [2.2.3-beta.2] - 2026-07-26

### Adicionado

- Componente compartilhado de abas financeiras com navegação por teclado, rolagem responsiva e indicador ativo por linha inferior.
- Rastreabilidade da data de emissão e dos ajustes aplicados aos recebíveis financeiros.

### Alterado

- Todas as abas e subabas do módulo Financeiro passaram a usar o mesmo padrão visual de texto com linha inferior, preservando as cores semânticas de cada área.
- Consultas, listas e relatórios financeiros passaram a exibir os valores canônicos enriquecidos devolvidos pelo backend.

### Corrigido

- O fluxo Banese/BolePix passou a preservar melhor snapshots financeiros, valores ajustados e a origem dos dados exibidos.
- Registros financeiros de teste foram removidos sem afetar o título Banese de homologação preservado.

### Segurança

- Validações financeiras e snapshots de cobrança permanecem centralizados no backend, sem confiar em cálculos do frontend.
- Planilhas operacionais com dados de turmas e bundles locais de diagnóstico permanecem fora do repositório público.

## [2.2.3-beta.1] - 2026-07-26

### Adicionado

- Transição em tela cheia na troca de polo, com estados de carregamento, sucesso, falha, nova tentativa e retorno seguro ao polo anterior.

### Alterado

- O carregamento inicial e a troca de contexto passam a buscar somente os polos e dados autorizados necessários ao módulo ativo.
- O portal do professor passou a carregar seus módulos sob demanda, reduzindo o pacote e o processamento iniciais.
- A transição de polo segue o mesmo padrão visual claro usado na validação inicial de acesso.

### Corrigido

- O seletor de polo permanece acima dos cards e indicadores da página, sem sobreposição indevida do conteúdo “Professores”.
- Calendário, financeiro do professor e caixa respeitam explicitamente o polo selecionado.
- O calendário da Gestão cancela respostas antigas e só conclui a transição após preparar os dados do novo polo.

### Segurança

- O cache de consultas é separado por polo e limpo no logout ou na troca de identidade autenticada.
- Usuários restritos deixam de consultar a lista completa de polos no frontend.

## [0.7.0-beta.2] - 2026-07-26

### Adicionado

- Seleção de módulo no boletim técnico do portal do aluno, com escolha automática do módulo em andamento ou do último módulo fechado.

### Alterado

- O carregamento de módulos e resultados acadêmicos do boletim passa a ocorrer somente ao abrir o documento, com cache, estado de carregamento e tentativa de recuperação.

### Corrigido

- Módulos ainda planejados e suas disciplinas deixam de aparecer como páginas ou resultados vazios no boletim do aluno.

### Segurança

- A consulta aceita exclusivamente períodos `ABERTO`, `EM_FECHAMENTO` ou `FECHADO`, preservando a regra existente de matrícula técnica ativa em turma em andamento.

## [0.7.0-beta.1] - 2026-07-26

### Adicionado

- Encontros de aula com sessões independentes por turno, permitindo registrar manhã e tarde no mesmo dia sem duplicar a carga horária da disciplina.
- Fluxo de revisão e fechamento do diário com travas distintas para professor e Gestão, confirmação auditável e reabertura controlada.
- Registro de falta justificada e reflexo das aulas técnicas nos calendários da Gestão, do professor e do aluno.

### Alterado

- Diários de 8 horas passam a exibir sessões de 4 horas para manhã e tarde; encontros de 6 horas permanecem como aula única.
- Cards acadêmicos passam a usar o progresso canônico da carga horária e a indicar módulo, disciplina atual e situação de revisão.
- Navegação dos detalhes da turma e das abas do diário foi ajustada para telas menores com rolagem horizontal acessível.

### Corrigido

- Cabeçalhos, cores, quebras de texto, matrículas, cargas horárias e legenda da exportação PDF dos diários.
- Frequência, totais de faltas e pendências do fechamento passaram a considerar corretamente cada sessão lançada.
- Conteúdo programático, datas, notas, presenças e situação dos alunos dos diários importados da turma ENF T-40 INT.

### Segurança

- Cálculos acadêmicos, validações de carga horária e regras de fechamento permanecem centralizados no backend.
- Alterações em diários fechados respeitam as travas e permissões da Gestão, preservando auditoria e atualização canônica.

## [0.6.0-beta.3] - 2026-07-25

### Adicionado

- Atendimento WhatsApp com envio e recebimento de áudios e documentos, gravação pelo navegador e player com progresso, duração, busca e velocidade.
- Transferência de conversas por setor e polo, respeitando o escopo de comunicação configurado para cada usuário.
- Pesquisa de satisfação de 0 a 5 no encerramento, com finalização automática depois da resposta ou após uma hora sem retorno.
- Fluxo comercial guiado por modalidade, área, curso e polo, evitando listas extensas de cursos para o possível aluno.

### Alterado

- A prontidão da Cloud API para envio passou a ser independente das credenciais de webhook exigidas para recebimento e coexistência.
- O início de conversa passou a ocupar corretamente a área disponível e a preservar a visualização dos dados do aluno.
- O robô passa a pausar quando a conversa é assumida ou transferida para atendimento humano.

### Corrigido

- Respostas de mídia da Meta agora identificam token temporário expirado em vez de mostrar somente erro genérico da Edge Function.
- Mensagens de mídia recebidas deixaram de ser tratadas como respostas de texto pelo fluxo automático.
- O webhook passou a preservar falhas de processamento e só marca o evento como processado depois da execução do fluxo.

### Segurança

- Operações humanas no WhatsApp falham de forma fechada quando o usuário restrito não possui polo ou tenta acessar outro polo ou setor.
- Credenciais da Meta permanecem protegidas no Vault e não são expostas no frontend nem no histórico de mensagens.

## [0.6.0-beta.2] - 2026-07-25

### Alterado

- O portal do aluno passou a centralizar as consultas afetadas pela liberação de curso e a atualizá-las por Realtime com invalidação direcionada do TanStack Query.
- O Nosso Número Banese passou a ser persistido no formato canônico de nove dígitos em recebíveis, transações e inscrições online.

### Corrigido

- Pagamentos Banese confirmados pelo banco agora ativam automaticamente matrículas de EAD, curso livre e especialização, sem depender da projeção auxiliar da inscrição online.
- Inscrições antigas com Nosso Número sem zeros à esquerda são recuperadas automaticamente sem serem confundidas com uma segunda cobrança.
- A confirmação exibida ao aluno só informa curso liberado depois que a matrícula realmente está ativa.

### Segurança

- A identidade remota continua imutável; somente representações numéricas equivalentes do mesmo Nosso Número Banese podem ser promovidas ao formato canônico.
- Cursos técnicos continuam aguardando análise documental mesmo após a confirmação financeira.

## [0.6.0-beta.1] - 2026-07-24

### Adicionado

- Integração Banese por ambiente para emissão de boleto, consulta, cancelamento seguro e montagem privada de boleto e carnê.
- Secretaria Financeira modular com operações individual, em lote e personalizada, agrupadas por aluno, matrícula e curso.
- Instrumentos avaliativos persistentes, resultados acadêmicos canônicos e exportação modular dos diários.
- Atendimento WhatsApp com múltiplas linhas, roteamento, editor de fluxo e agente de suporte a cursos.
- Prévia acadêmica compartilhada para documentos emitidos pela Secretaria.

### Alterado

- Novas cobranças passam a usar Banese para boleto/Pix e Mercado Pago para cartão; Asaas e Banco Inter ficam restritos ao histórico.
- Abertura do boleto pelo gestor ocorre em nova aba e utiliza o PDF montado pelo sistema.
- Financeiro, Caixa, Secretaria e Gestão compartilham consultas protegidas, invalidação TanStack Query e atualização Realtime.
- A página de recebimentos da Secretaria e os diários foram divididos em componentes, hooks, tipos, serviços e utilitários menores.

### Corrigido

- Baixa manual Banese passou a validar conta canônica, idempotência, identidade do título e confirmação do cancelamento remoto antes da baixa local.
- Secretaria e Financeiro deixaram de divergir sobre cobranças em aberto.
- Notas não lançadas permanecem nulas e o fechamento considera somente instrumentos ativos.
- Webhooks legados preservam ownership, estados terminais e causa original de falhas para auditoria.

### Segurança

- Cálculos financeiros e validações de recebimento permanecem exclusivamente no backend.
- Consultas financeiras, documentos, resultados acadêmicos e linhas do WhatsApp respeitam permissões e escopo de empresa/polo.
- Pix Banese permanece bloqueado em homologação e CNAB240 exige código EDI7 real.
- PDFs bancários são entregues por rota privada e credenciais não são expostas no frontend ou no repositório.

## [0.5.0-beta.1] - 2026-07-19

### Adicionado

- Atendimento integrado à WhatsApp Cloud API com caixa de entrada em tempo real, envio e recebimento de mensagens e visualização de imagens no próprio chat.
- Automações de aviso de vencimento, confirmação de pagamento, atraso, múltiplas parcelas vencidas e aniversário com imagem aprovada pela Meta.
- Fluxo automático de autoatendimento com menu inicial, validação segura de CPF, consulta financeira e transferência opcional para atendente.
- Ciclo de atendimento com assumir, encerrar, retomar, finalização automática por inatividade e separação entre conversas abertas e finalizadas.
- Perfil público do WhatsApp Business e configuração de enquadramento da foto antes do envio para a Meta.
- Controle mensal de orçamento calculado no backend, com avisos em 50%, 75% e nível crítico em 90%.

### Alterado

- Cabeçalho, navegação e organização da tela de comunicação foram compactados para aproveitar melhor a área do atendimento.
- Indicadores de entrega, horário da última mensagem, notificações sonoras e estado das conversas foram aproximados da experiência do WhatsApp.
- Mensagens de cobrança e aniversário passaram a utilizar dados reais de alunos, matrículas e parcelas elegíveis.

### Corrigido

- Webhook da Meta passou a registrar corretamente respostas, mídias e atualizações monotônicas de status sem duplicar mensagens.
- Conversas externas passaram a localizar um único aluno pelo telefone e a manter a associação correta durante os testes de automação.
- Cálculos de consumo e alertas deixaram de depender do navegador e agora são devolvidos prontos pela RPC protegida.

### Segurança

- Tokens da Meta permanecem no Vault e fora do frontend e das tabelas expostas ao navegador.
- Webhooks, anexos, consultas financeiras e execução dos agentes foram protegidos por validações internas e permissões específicas.
- Telefones de alunos passaram a ter unicidade normalizada para evitar dois cadastros usando o mesmo número no atendimento.

## [0.4.0-beta.2] - 2026-07-15

### Corrigido

- Calendário do aluno passou a normalizar identificadores e nomes de disciplinas sem perder eventos existentes.
- Configurações antigas de vídeo EAD continuam reconhecidas junto ao formato atual.
- Modelos de carteirinha e transferência agora preservam e tipam corretamente seus campos de layout e paginação.
- Histórico de emissões aceita relações de turma e curso retornadas pelo banco como objeto ou lista.
- Presença de digitação do WhatsApp passou a descartar estados expirados de forma tipada.
- Monitor de pagamento EAD passou a tratar com segurança o formato dos eventos em tempo real.
- Verificações globais de TypeScript e lint foram regularizadas, incluindo os ambientes web e Edge Functions.

### Segurança

- A consulta de mensageria não tenta mais devolver a senha SMTP, mantendo o segredo fora da leitura do painel.
- Nenhuma migration, cobrança ou alteração de dados cadastrais foi necessária nesta correção.

## [0.4.0-beta.1] - 2026-07-15

### Adicionado

- Landing pages modulares por tipo de curso técnico, com formulário próprio e reaproveitamento seguro das regras comuns.
- Seção pública de matrículas técnicas abertas logo abaixo do banner, limitada a três turmas reais e com vagas calculadas no banco.
- Cadastro da situação do ensino médio, escola e ano de conclusão ou previsão, incluindo alunos da segunda e terceira séries.
- Configurações da turma para aceitar matrícula concomitante ou subsequente e definir a série mínima do ensino médio.
- Fluxo de análise documental com aprovação ou recusa pelo gestor e arquivos novos armazenados de forma privada.

### Corrigido

- Turmas técnicas com inscrições abertas passaram a aparecer no site e aceitar checkout dentro da janela configurada.
- Confirmação de e-mail e login preservam a turma escolhida e devolvem o aluno à landing page correta.
- Pagamentos técnicos confirmados mantêm a matrícula e a documentação pendentes até a conferência da instituição.
- Após o pagamento, o aluno é direcionado à área de documentos do próprio perfil.
- Formas de pagamento exibidas na landing page agora acompanham a configuração real do curso.

### Segurança

- A consulta pública de turmas expõe somente informações comerciais e quantidade agregada de vagas, sem dados de alunos.
- Regras de escolaridade são validadas novamente no checkout e registradas como fotografia da inscrição.
- Redirecionamentos do fluxo de autenticação aceitam somente caminhos internos seguros.
- Reserva de vagas técnicas usa trava transacional para impedir duplicidade e superlotação em checkouts simultâneos.
- Alunos podem enviar ou substituir documentos, mas somente gestores autorizados podem aprovar ou recusar.
- A matrícula técnica só pode ser ativada pelo gestor após pagamento confirmado e aprovação dos documentos enviados.

## [0.3.0-beta.2] - 2026-07-15

### Adicionado

- Frequência mínima e média mínima configuráveis por turma técnica, preservando 75% e nota 6 como padrões.
- Retorno de aluno cancelado, trancado ou desistente em uma nova turma do mesmo curso, sem apagar a matrícula anterior.
- Registro de equivalências no recebimento de transferência externa e resumo dos aproveitamentos no histórico do aluno.

### Corrigido

- Transferências deixaram de falhar por leitura da coluna de data do tipo errado de registro acadêmico.
- Frequência passou a considerar a carga horária de cada aula, evitando que uma falta de quatro horas tenha o mesmo peso de uma falta de uma hora.
- Transferências internas e retornos agora preservam disciplinas aprovadas e aproveitamentos anteriores, inclusive em continuidades sucessivas.
- A seleção de turma de destino foi limitada às turmas em andamento do mesmo curso.
- A guia de transferência pode ser preparada para matrícula ativa ou já transferida.

### Segurança

- Novas operações acadêmicas validam turma, curso, status, aluno e escopo do gestor no banco.
- Funções auxiliares de cálculo e cópia de créditos permanecem internas, sem execução por usuários anônimos ou autenticados.
- Regras acadêmicas ficam bloqueadas depois do primeiro lançamento de nota, frequência ou estágio.

## [0.3.0-beta.1] - 2026-07-15

### Adicionado

- Configuração única do polo matriz que atua como emissor e recebedor bancário de todos os polos.
- Identificação separada do polo de origem e do polo emissor nas cobranças e transações de gateway.
- Painel de conferência do CNPJ emissor e da quantidade de polos que herdam a configuração da matriz.

### Alterado

- Mercado Pago ficou reservado à futura operação de cartão de crédito.
- Banese ficou reservado a Pix e boleto, permanecendo bloqueado até a homologação bancária.
- O nome operacional exibido na integração passou de `Banese Card` para `Banese`, preservando o código interno por compatibilidade.

### Segurança

- Apenas gestor global pode alterar o emissor financeiro, que obrigatoriamente precisa ser um polo matriz ativo.
- Cada cobrança preserva o emissor aplicado no momento da criação para impedir perda de rastreabilidade após mudanças futuras.

## [0.2.2-beta.4] - 2026-07-14

### Corrigido

- Gestão de turmas, Secretaria e relatórios agora acompanham o polo selecionado no cabeçalho, inclusive ao trocar de polo sem recarregar a página.
- Contas a receber, despesas, outros créditos, outros débitos e transferências passaram a consultar somente o polo ativo.
- Relatórios deixaram de combinar polos de empresas diferentes e não usam mais dados fictícios quando uma consulta retorna vazia.
- Novos polos passam a ser vinculados obrigatoriamente à empresa matriz, e os polos existentes sem empresa foram regularizados.

### Segurança

- Contas bancárias agora respeitam o vínculo do gestor com o polo também em consultas diretas ao banco.
- Transferências entre contas só ficam visíveis quando o gestor tem acesso simultâneo aos polos de origem e destino.
- Gestores restritos não recebem autorização para registros sem polo definido.

## [0.2.2-beta.3] - 2026-07-14

### Adicionado

- Conclusões EAD passam a entrar em `Secretaria > Certificações` como pendentes para registro de número, livro e página.
- Portal do aluno passou a gerar o PDF real da carteirinha estudantil, com frente e verso no formato do cartão.
- Fechamento de período técnico passou a exibir avaliações de estágio pendentes e reprovações de estágio.

### Corrigido

- Certificado EAD deixou de ser liberado automaticamente ao concluir a prova; o aluno só recebe o PDF após a emissão da Secretaria.
- Avaliação e reprovação no estágio agora participam do encerramento do período e do resultado final da matrícula.
- Ações de progresso e prova EAD agora validam o próprio aluno, os itens reais do curso e os pré-requisitos antes da conclusão.

### Segurança

- Alunos não conseguem consultar certificados pendentes nem finalizar certificados por chamada direta.
- Emissão do certificado valida o gestor e o polo, ignora responsável forjado e reconfirma a conclusão EAD no banco.
- Emissão, revogação e leitura dos códigos documentais passaram a respeitar aluno, matrícula e escopo de polo no banco.

## [0.2.1-beta.2] - 2026-07-14

### Corrigido

- Acesso do professor limitado às próprias disciplinas, com diário, presença e estágio bloqueados fora do período operacional.
- Portal do professor limitado ao polo ativo autorizado e às turmas de cursos técnicos.
- Consultas acadêmicas deixaram de expor CPF e data de nascimento ao diário do professor.
- Disciplinas de estágio passaram a ser identificadas pela carga horária configurada, inclusive em Enfermagem.
- Portal do aluno passou a exibir as disciplinas e a situação do estágio antes da primeira avaliação.

### Segurança

- RPCs acadêmicas e de estágio passaram a validar vínculo, turma e disciplina no banco antes de retornar dados.
- Situação vacinal do estágio é fornecida ao professor apenas de forma agregada, sem acesso a comprovantes.
- Notas, frequência, práticas e avaliações de estágio agora validam matrícula ativa e coerência entre aluno, aula, turma e disciplina.

## [0.2.0-beta.1] - 2026-07-14

### Adicionado

- Ciclo autoritativo de turmas técnicas, com planejamento, inscrições, períodos, fechamento e finalização.
- Atividades extraclasse vinculadas ao período, com entrega, correção e integração ao resultado acadêmico.
- Visão acadêmica do aluno adequada à fase da turma, preservando o histórico após conclusão ou reprovação.
- Comprovantes vacinais em armazenamento privado e validação exclusiva da secretaria.

### Corrigido

- Proteções de matrícula, grade, diário, estágio, vacinas e auditoria contra alterações diretas ou fora do período.
- Estados de carregamento e erro agora bloqueiam operações quando os dados acadêmicos não puderem ser confirmados.
- Datas do ciclo técnico e financeiro normalizadas para o fuso de Maceió.

### Alterado

- Telas extensas do módulo técnico e cadastro acadêmico foram divididas em componentes menores.

## [0.1.0-beta.1] - 2026-07-14

### Adicionado

- Identificação discreta `BETA · v0.1.0` nos portais do gestor, aluno e professor.
- Fonte única para a versão atual do sistema.
- Validação automática entre a versão atual e este histórico.
- Verificação em pull requests para exigir a atualização deste registro em toda alteração do produto.
