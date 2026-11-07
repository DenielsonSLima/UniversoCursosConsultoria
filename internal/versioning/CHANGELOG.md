# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [27/09/2026 — versões 4.8.117 a 4.8.127](./changelog/2026-09-27-versoes-4-8-117-a-4-8-127.md), [16/09/2026 a 25/09/2026 — versões 4.8.65 a 4.8.90](./changelog/2026-09-16-a-2026-09-25-versoes-4-8-65-a-4-8-90.md), [13/09/2026 — versões 4.8.53 a 4.8.64](./changelog/2026-09-13-versoes-4-8-53-a-4-8-64.md), [08/09/2026 a 12/09/2026 — versões 4.8.37 a 4.8.52](./changelog/2026-09-08-a-2026-09-12-versoes-4-8-37-a-4-8-52.md), [03/09/2026 a 08/09/2026 — versões 4.8.30 a 4.8.36](./changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md), [02/09/2026 — versões 4.8.27 a 4.8.29](./changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md), [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

Histórico arquivado: [28/09/2026 a 30/09/2026 — versões 4.8.128 a 4.8.137](./changelog/2026-09-28-a-2026-09-30-versoes-4-8-128-a-4-8-137.md), [27/09/2026 — versões 4.8.115 a 4.8.116](./changelog/2026-09-27-versoes-4-8-115-a-4-8-116.md), [27/09/2026 — versão 4.8.114](./changelog/2026-09-27-versao-4-8-114.md), [27/09/2026 — versão 4.8.113](./changelog/2026-09-27-versao-4-8-113.md), [27/09/2026 — versão 4.8.112](./changelog/2026-09-27-versao-4-8-112.md), [27/09/2026 — versão 4.8.111](./changelog/2026-09-27-versao-4-8-111.md), [25/09/2026 a 26/09/2026 — versões 4.8.91 a 4.8.110](./changelog/2026-09-25-a-2026-09-26-versoes-4-8-91-a-4-8-110.md).

Histórico arquivado: [30/09/2026 — versões 4.8.138 a 4.8.144](./changelog/2026-09-30-versoes-4-8-138-a-4-8-144.md).

Histórico arquivado: [01/10/2026 a 04/10/2026 — versões 4.8.145 a 4.8.168](./changelog/2026-10-01-a-04-versoes-4-8-145-a-168.md).

Histórico arquivado: [05/10/2026 — versões 4.8.169 a 4.8.170](./changelog/2026-10-05-versoes-4-8-169-a-170.md).

Histórico arquivado: [05/10/2026 — versões 4.8.171 a 4.8.174](./changelog/2026-10-05-versoes-4-8-171-a-174.md).

Histórico arquivado: [06/10/2026 a 09/10/2026 — versões 4.8.175 a 4.8.195](./changelog/2026-10-06-a-09-versoes-4-8-175-a-195.md).

## [4.8.259] - 2026-11-07

### Corrigido
- Histórico de Emissões aplica a busca ao digitar e permite combinar modalidade, curso, turma e tipo de documento.
- Filtros são aplicados no servidor antes da contagem e paginação, com pesquisa de nome/CPF do snapshot ou cadastro e preservação da segunda via.

## [4.8.258] - 2026-11-07

### Corrigido
- Fotos privadas do cadastro individual usam o mesmo resolvedor da lista em respostas de objeto do PostgREST.
- Avatares locais usam iniciais até a foto completa; uma recuperação privada e a revalidação da lista ao voltar/focar tratam URLs expiradas sem polling.
- Assinatura temporária, permissões, origem e caminhos autorizados permanecem preservados; fotos negadas continuam ocultas.

## [4.8.257] - 2026-11-07

### Corrigido
- Submódulos internos da Secretaria seguem a interface compacta, com cabeçalhos leves, campos brancos e abas com linha inferior.
- Seletores de turmas, modalidades, documentos, filtros e recebimentos usam listas pesquisáveis do sistema, preservando IDs e bloqueios.
- Apresentação responsiva e estilos de tela isolados dos documentos e da impressão.

## [4.8.256] - 2026-11-07

### Adicionado
- Emissor NFS-e após Financeiro, com Preparar emissão, Pendentes, Emitidas, Erros e Modelos.
- NFS-e Portal Contribuinte na matriz, organizado pelos estabelecimentos de Polos e Filiais.
- Liberação inicial individual, confirmada no servidor e isolada dos perfis compartilhados.
- Contratos RPC, TanStack Query, Realtime e API interna separados; cálculo financeiro reservado ao backend.
- Emissão, gravações fiscais e cadastro de credenciais permanecem indisponíveis nesta etapa.

## [4.8.255] - 2026-11-07

### Corrigido
- Carteirinhas em ordem alfabética pelo nome do aluno em lotes completos, por turma e personalizados, nos dois layouts A4.
- Ordenação canônica na RPC preserva elegibilidade, matrícula primária, modelos e códigos de validação.

## [4.8.254] - 2026-11-07

### Alterado
- Configurações: cadastros compactos, campos brancos e navegação com linha inferior.
- Seletores pesquisáveis preservam IDs, escolhas múltiplas, herança de acesso e bloqueios existentes.
- Mensageria e integração bancária divididas por responsabilidade, mantendo operações, documentos e modelos.
- CI focado cobre IDs dos seletores, limites de acesso e impressoras, sem serviços remotos.

## [4.8.253] - 2026-11-07

### Alterado
- Caixa prioriza a prestação mensal na fila de leitura, preservando consultas, valores canônicos, escopo e cancelamento.
- Linha de corte acompanha a invalidação Realtime do polo e consolidado; diagnóstico distingue métricas históricas e ensaio sintético de ganho real em produção.

## [4.8.252] - 2026-11-07

### Alterado
- Cadastros Aluno, Professor, Pessoa Física e Pessoa Jurídica com campos, etapas e seções compactos; seletores próprios pesquisáveis preservam valores e validações.
- Cartões e Responsáveis seguem o padrão compacto, mantendo informações, permissões e quatro colunas no desktop amplo; análise de carregamento separada de alterações de dados.

## [4.8.251] - 2026-11-07

### Alterado
- Tabelas e modais das dez abas financeiras seguem um padrão compacto de fonte, contraste, espaçamento e alinhamento; documentos, dados e regras preservados.
- Abas com linha inferior, buscas brancas e seletores próprios pesquisáveis; cabeçalhos repetidos removidos e ações alinhadas às abas/filtros, preservando permissões e operações.

## [4.8.250] - 2026-11-06

### Alterado
- Formações com entrada e oito submódulos mais compactos, preservando cursos, grades, modelos e permissões.
- Patrimônio e Relatórios com navegação, filtros, cartões e catálogos refinados.
- Calendário e Comunicação com cabeçalhos e áreas de trabalho compactos, mantendo datas, exportações, atendimento e operações existentes.

## [4.8.249] - 2026-11-06

### Alterado
- Financeiro com resumo, tesouraria, abas e cabeçalhos mais compactos.
- Caixa com indicadores, trilhas e análises leves; valores extensos sem truncamento e navegação de capítulos ajustada ao cabeçalho móvel.
- Configurações com catálogo compacto, ícones centralizados e retorno das seções refinado. Dados, regras financeiras, permissões, consultas e operações preservados.

## [4.8.248] - 2026-11-05

### Alterado
- Secretaria com operações agrupadas, fontes menores e ícones centralizados nas linhas.
- Parceiros com quatro cartões por linha no desktop amplo e ficha interna do aluno mais compacta.
- Gestão com entrada, filtros, cartões e cabeçalho/resumo das turmas refinados nas quatro modalidades. Dados, permissões, consultas e operações preservados.

## [4.8.247] - 2026-11-05

### Alterado
- Início do Gestor com tipografia e espaçamento compactos, indicadores integrados, agenda e movimentação em composição mais leve.
- Menu lateral e cabeçalho menores; dados, permissões, consultas e destinos dos atalhos preservados. Redesenho em prévia para aceite visual.

## [4.8.246] - 2026-11-05

### Corrigido
- Categoria, Agrupamento e Ordenação do catálogo público EAD usam rótulos e campos com altura e alinhamento uniformes.
- Seletores pesquisáveis preservam opções e valores, com navegação por teclado e fechamento por Escape, Tab e clique externo.

## [4.8.245] - 2026-11-05

### Corrigido
- Matrícula EAD exige acesso ao módulo Financeiro e confirmação entre adicionar sem financeiro, com liberação imediata auditada, ou gerar cobrança e aguardar pagamento.
- Outros créditos recebidos localmente permitem estorno auditado com motivo e preservação do histórico financeiro; liquidações de gateway exigem tratamento próprio.
- Créditos avulsos sem classificação legada são reconhecidos para seleção e cancelamento com as mesmas guardas dos demais títulos.
- Resumo e painel EAD usam fatos financeiros, sem inferir pagamento ou receita a partir do acesso acadêmico. Produção autorizada; implantação e conferência registradas no lote.

## [4.8.244] - 2026-11-01

### Corrigido
- Fotos pessoais passam a referências privadas, assinatura em lote por sessão e capability documental válida; migração administrativa com SHA-256, retomada e quarentena.
- Início deixa de autorizar cadastro completo; vacinas exigem atribuição explícita e polo, inclusive em acesso global.
- Chat e anexos aplicam identidade, polo e setor; diretório e categorias usam projeções mínimas autorizadas.
- Transcrição por IA bloqueada por padrão, com aprovação documentada, aviso e texto efêmero; política pública descreve saúde, operadores e conservação.
- Conferência de três agentes corrigiu N+1 das assinaturas e seleção de categoria fora do setor. Migrations, Edges e migração operacional continuam pendentes de aplicação autorizada em produção.

## [4.8.243] - 2026-10-28

### Corrigido
- Portal do Aluno consulta somente o modelo EAD do próprio certificado finalizado, com identidade ativa verificada no servidor e sem liberar o registro administrativo de modelos.
- Erro de carregamento deixa de aparecer como geração permanente de PDF; repetição explícita e troca de conta/curso descartam respostas antigas.
- Certificados, códigos, datas, notas, progresso e modelos administrativos permanecem inalterados. Testes isolados cobrem autorização e recuperação da interface; smoke autenticado permanece pendente.

## [4.8.242] - 2026-10-27

### Corrigido
- Revisão dos 61 cursos EAD restantes: 58 percursos com ensino, prática, atividades e provas próprias; três cursos adequados preservados com sete vínculos de atividades corrigidos.
- Novos materiais e gabaritos passam por revisão independente e mantêm versões, progresso, notas e certificados anteriores; a troca de versão permanece explícita.
- Cursos de NR-10, máquinas e transporte escolar delimitados como cursos livres teóricos, sem comprovação de prática ou habilitação profissional.
- Explicações antecipadas de Serviços Gerais e Vigia reservadas no snapshot privado, sem trocar currículo, gabaritos ou histórico.
- Área nativa de foco das alternativas vinculada ao retângulo visível; tela branca relatada no Android segue dependente de reteste após atualização.

## [4.8.241] - 2026-10-27

- Retomada de rematrícula aprovada pelo serviço consulta a mesma tentativa sem alterar o consentimento histórico.
- Substituição individual autorizada confirma baixa e ausência de pagamento antes de reservar um único título novo; resposta Pix da criação fica preservada e retries consultam a mesma identidade.
- Operação desta entrega concluiu 13/13 títulos, mantendo valor, vencimento e as doze mensalidades. Dois QR Codes do PDF nativo foram conferidos contra o Pix oficial.

## [4.8.240] - 2026-10-27

- Matemática Básica e Matemática para Enem recebem aulas próprias, exercícios resolvidos, atividades por habilidade e provas matemáticas revisadas com fontes INEP e OBMEP/IMPA.
- A sala mantém avaliações anteriores por versão e oferece início explícito da revisão, preservando tentativas, notas e certificados; resoluções seguem somente no feedback após resposta.

## [4.8.239] - 2026-10-27

- Acompanhamento da emissão consulta a mesma operação por matrícula e ciclo, independentemente da lista da turma; apresenta dados confirmados, revisão e erro de leitura sem inventar progresso zero.
- Uma única solicitação de emissão é observada por consultas independentes; conclusão integral pode ser confirmada mesmo quando a resposta inicial atrasa. Recarga e saída do acompanhamento não reenviam cobranças.
- Reduz o custo repetido da projeção financeira, preservando contagens, proveniência, permissões e regras de emissão. Nenhum título, valor, pagamento ou vencimento é alterado por esta atualização.

- Adiciona preparação estrita de rematrícula rejeitada por vencimento anterior à emissão, condicionada à consulta oficial da mesma identidade bancária, com prazo, comparação de estado e arquivo imutável da tentativa anterior.
- A correção preserva mensalidades, composição e histórico do ciclo. Nova tentativa exige consentimento do gestor autenticado e mantém retomada da mesma identidade sem duplicar título após resposta perdida.
- Nenhuma taxa é modificada automaticamente pela implantação; ausência genérica, conflito, pagamento e falha de consulta impedem o preparo.

## [4.8.237] - 2026-10-27

- Alinha os nomes das três migrations financeiras aos identificadores efetivamente aplicados em produção, preservando integralmente o SQL revisado e sem reaplicação.
- Atualiza caminhos dos testes e evidências de implantação; comportamento financeiro, interface funcional, valores, datas e permissões permanecem iguais à versão4.8.236.

## [4.8.236] - 2026-10-27

- Módulo financeiro central por matrícula distingue Proesc, Banese importado, emissão própria e registro local, sem confundir mensalidades lançadas com títulos efetivamente emitidos.
- Gestor escolhe primeiro ciclo, segundo ciclo ou não emitir; consulta Proesc não impede a decisão. Histórico, continuidade de transferência e operações existentes permanecem protegidos.
- Intenção auditada acompanha geração, autorização e primeiro claim após COMMIT; retomada por ciclo preserva request, valores, datas, pagamentos e identidade bancária. Compatibilidade legada exige prova histórica estrita, sem backfill.
- Diagnóstico individual impede que uma matrícula inválida derrube a lista; regressões de UI e PostgreSQL isolado cobrem origens mistas, composição, concorrência simulada e recuperação ambígua.

## [4.8.235] - 2026-10-27

- Retomada da mesma emissão por gestor autorizado preserva autorização original, chave e dados financeiros, com auditoria idempotente; divergências de conteúdo ou vínculo exigem revisão.
- Catálogo individual explica motivos de indisponibilidade documental e permite preparar um ou dois boletos pelo fluxo existente; validações bancárias preservadas.
- Regressão SQL isolada cobre papéis reais e primeiro claim, com testes do serviço, orquestração e catálogo. Implantação do backend e validação autenticada são etapas separadas da preparação desta versão.

## [4.8.234] - 2026-10-24

- Caixa preserva status HTTP e interrompe tentativas após negação de acesso, sem trocar para versão anterior da consulta.
- Composição do Caixa agrega totais e classificação na mesma leitura de cada relatório, preservando valores e permissões; conexões antecipadas Cloudflare removidas e captcha sob demanda.

## [4.8.233] - 2026-10-23

- Consulta financeira passa a negar identidade ausente e restringir resultados aos polos autorizados; calculadora mantém resultados com search_path fixo.
- Dependências de segurança atualizadas, prévias adaptadas ao PDF.js 6 e conferência do runtime Node separada do build. Aplicação das migrations, produção e distribuição móvel ainda pendentes.

## [4.8.232] - 2026-10-22

- Build exige Node estável 24.22.1 ou posterior na linha 24.x antes de gerar o site; CI seleciona esse piso e testa o gate, sem reutilizar Node antigo em cache.
- Função de prévia social registra apenas a versão Node em log privado, uma vez por instância, sem alterar respostas ou expor dados.
- A versão efetiva em produção deve ser confirmada nos logs após a publicação; a configuração 24.x não comprova o patch.

## [4.8.231] - 2026-10-21

### Caixa: conferência da composição
- Adicionado botão Ver registros no aviso dos recebimentos, com lista completa paginada e filtro separado para ausência de detalhamento sem diferença.
- Modal somente leitura exibe aluno, parcela, recebido, base, componentes identificados, diferença e origem da composição. Valores ausentes não são presumidos zero.
- Reutilizada RPC segura do relatório mensal sob demanda, sem alteração de cobranças, saldos, banco ou permissões.

## [4.8.230] - 2026-10-21

- Parceiros: nomes dos cards de pessoas jurídicas menores em aproximadamente15%.
- Prévia ao passar o mouse ou focar pelo teclado com nome completo, razão social, CNPJ e demais dados disponíveis, sem abrir o cadastro.


## [4.8.229] - 2026-10-21

- Caixa: consultas pesadas com concorrência controlada e prioridade para a conferência aberta pelo usuário.
- Banco: busca da última evidência e validação histórica de composição com índices específicos, preservando regras e valores.
- Proesc: confirmação individual auditável de quatro pagamentos comprovados, sem duplicar recebimentos ou presumir composição de encargos.


## [4.8.228] - 2026-10-20

- Corrige o timeout ao listar registros em conferência do mês e da carteira no Caixa.
- Busca de evidências indexada preserva registros, valores, motivos, permissões e histórico.

## [4.8.227] - 2026-10-19

- Corrige timeout na prestação de contas do Caixa com busca limitada ao vínculo financeiro da parcela, preservando evidências e cálculos.
- Cancela consultas de relatório ao fechar e impede repetição automática de timeout PostgreSQL.

## [4.8.226] - 2026-10-14

- Rótulo e campo de data alinhados à forma de pagamento no modal financeiro.

## [4.8.225] - 2026-10-14

- Em uma única forma de pagamento, o valor sugerido acompanha automaticamente descontos, juros, multa e acréscimos calculados no servidor.
- Valores parciais informados manualmente e múltiplas formas continuam preservados.

## [4.8.224] - 2026-10-14

- Campos de pagamento, juros, multa, desconto e acréscimos formatam reais automaticamente com duas casas decimais durante a digitação.
- Preservados o visual aprovado e os cálculos no servidor.

## [4.8.223] - 2026-10-14

- O modal financeiro recupera o cabeçalho, os campos organizados e o resumo lateral do visual aprovado.
- As formas de pagamento adicionais permanecem integradas ao formulário, com recebimentos e pagamentos parciais preservados.
- Saldo, encargos, desconto e valor da baixa continuam exibindo os resultados canônicos do servidor; as regras de confirmação e retomada permanecem intactas.

## [4.8.221] - 2026-10-14

- Contas a Receber, Outros Créditos e Contas a Pagar permitem registrar pagamentos parciais e combinar formas e contas na mesma baixa.
- Saldo restante, ajustes, prévia e histórico são calculados no servidor, com proteção contra confirmação repetida e valores desatualizados.
- Caixa e relatórios contabilizam cada pagamento na data e conta corretas; despesas permitem estornar um pagamento específico preservando o histórico.
- Recebimento manual Banese exige cancelamento bancário confirmado; o saldo aberto não gera boleto automaticamente. Fluxos importados e especializados preservam suas regras anteriores.

## [4.8.220] - 2026-10-14

- Outros Créditos permite selecionar parcelas, grupos ou a página para cancelar até 25 lançamentos por operação.
- Cancelamento Banese confirma a situação no banco antes da baixa interna, preserva o histórico e informa o resultado de cada crédito.
- Operações interrompidas retomam a mesma intenção; pagamentos e cobranças fora do escopo impedem o cancelamento.
- Listagem recupera alterações ao reconectar; consulta manual repetida por boleto removida.

## [4.8.219] - 2026-10-14

- Corrigida a projeção do vencimento individual de transferências para carregar o financeiro sem alterar o histórico da turma.
- A Secretaria permite continuar para o financeiro individual após registrar a transferência, reutilizando a conferência, emissão BolePix e carnê existentes.
- Plano, aproveitamentos e cobranças anteriores preservados; a emissão exige confirmação individual.

## [4.8.218] - 2026-10-14

- Contratos: matrícula recebida presencialmente pode integrar o valor contratual por aluno, sem gerar boleto ou lançamento de caixa.
- Leitura contratual de cancelamentos históricos compatível com novos campos vazios; financeiro e histórico emitido preservados.

## [4.8.217] - 2026-10-13

- Carnê avulso organizado em dados, financeiro editável e revisão final antes da criação.
- Vencimentos mensais ou a cada 30 dias corridos, com valor e data próprios por parcela e taxas separadas.
- Matrícula, rematrícula e parcelas recebem juros, multa e desconto próprios, refletidos nos totais, boletos e PDF.

## [4.8.216] - 2026-10-13

- Outros Créditos permite criar carnê sem turma, com 1–60 parcelas mensais e taxas opcionais de matrícula/rematrícula.
- Prévia calcula valores no banco; juros/multa de atraso e desconto de pontualidade seguem o snapshot de cada boleto.
- Emissão e recuperação preservam o mesmo pedido e os boletos confirmados; download privado utiliza o PDF Banese vetorial.

## [4.8.215] - 2026-10-13

- Revisão 8 do contrato técnico disponibilizada no cadastro para aprovação própria, com plano financeiro individual completo e identificação corrigida.
- Prévia estrutural do editor passa a respeitar a tipografia V4 e a informar que a paginação é estimada; valores reais continuam vindo da matrícula na emissão.
- Segunda via conserva o documento original; a versão corrigida requer nova emissão após aprovação da revisão.

## [4.8.214] - 2026-10-13

- Captura financeira do novo contrato interrompe com orientação de nova tentativa quando há atualização concorrente, sem esperar pelos bloqueios financeiros.
- Plano individual completo é reservado ao modelo V4; revisões anteriores mantêm sua emissão até a aprovação própria do novo texto.

## [4.8.213] - 2026-10-13

- Nova revisão do contrato técnico discrimina o plano individual completo, ciclos, matrícula, rematrículas, total, descontos e encargos com unidade e incidência explícitas.
- Emissão usa as condições efetivas da matrícula, planos de transferência e ciclos revisados com prova de omissões e dispensas; configurações incompletas impedem documento inexato.
- Contratante identificado conforme maioridade; modelo V4 com corpo de 12 pontos, paginação no servidor e código/validade do QR integrais.
- Revisão institucional permanece obrigatória; documentos emitidos, condições bancárias e aprovações históricas são preservados.

## [4.8.212] - 2026-10-11

- Cadastro do aluno aguarda a leitura completa antes de editar ou salvar, com nova tentativa em caso de falha.
- Atualizações da consulta preservam o rascunho; salvar um aluno e abrir outro mantém os dados e caches separados.

## [4.8.211] - 2026-10-11

- Convite e recuperação revalidam a permissão do gestor e o estado do aluno no banco antes de concluir; revogação bloqueia escrita e entrega posterior do link.

- Link manual de recuperação confere a identidade retornada pelo Auth antes de entregá-lo ao gestor.
- Identidade divergente ou link ausente interrompe a operação com resposta sanitizada e preserva a credencial atual.

## [4.8.210] - 2026-10-11

- Portal do aluno emite o boletim oficial em PDF do módulo iniciado, com prévia, download e impressão do mesmo arquivo.
- Boletins exibem matrícula humana e documentos pessoais adaptáveis por CPF, RG e CIN, conforme os dados presentes.
- Modelo institucional completo, assinatura, QR e marca d’água acompanham novas emissões e seus snapshots.
- Novas notas geram outro código; o histórico do gestor preserva o mesmo conteúdo do aluno e a impressão pode ser cancelada antes de iniciar.
- Identificação por CIN preserva nome e matrícula dos modelos personalizados; datas do boletim seguem o dia local congelado na emissão.

## [4.8.209] - 2026-10-11

- Aba Acesso relê cadastro completo e confirmação do e-mail, inclusive ao abrir o aluno pela busca global.
- Reenvio de acesso recusa estados alterados durante a operação e preserva a senha recém-criada pelo aluno.
- Confirmação de e-mail e reserva de senha temporária revalidam a permissão vigente do gestor antes de concluir a operação.

## [4.8.208] - 2026-10-10

- Validação administrativa confirma o e-mail para login sem substituir a senha existente.
- Acesso do aluno apresenta e-mail, senha e termos separadamente; termos pendentes não exigem criar outra senha.
- Recuperação preserva a credencial criada, e assistência temporária recusa esse estado mesmo com termos pendentes.
- Confirmação inicial exige prova persistida de senha ou cadastro público canônico para dispensar sua criação.

## [4.8.207] - 2026-10-10

- Reemissão do boletim atualiza a prévia quando o modelo muda e preserva snapshots documentais existentes.
- PDF respeita a mesclagem, a opacidade e a ordem da assinatura do editor, mantendo linha e cargo legíveis.
- Falha ao buscar o modelo salvo do boletim é exibida, sem substituir silenciosamente o documento pelo padrão.

## [4.8.206] - 2026-10-10

- Atividade em painéis internos e controles que interrompem eventos renova corretamente o prazo da sessão.
- Abas sincronizam a atividade mais recente antes do logout, preservando os 30 minutos de inatividade.

## [4.8.205] - 2026-10-10

- Frequência acomoda seis encontros de manhã/tarde no mesmo bloco, com larguras fixas para identificação do aluno e faltas.
- Diário soma no backend apenas as notas preenchidas em qualquer instrumento ativo; campos vazios não impedem a soma.
- Zero continua exigindo lançamento explícito e ausência total de notas mantém média vazia; fechamento e validação documental acompanham a regra.

## [4.8.204] - 2026-10-10

- Diário permite O opcional por aluno e mantém campos vazios sem nota; zero exige lançamento explícito.
- Médias calculadas no backend preservam duas casas decimais, com fechamento e validação documental coerentes.

## [4.8.203] - 2026-10-10

- Seleção de docentes passa a listar os professores ativos vinculados ao polo da turma, incluindo professores com mais de uma unidade.
- Novas atribuições técnicas validam esse vínculo no banco, preservando docentes já atribuídos e sua remoção.

## [4.8.202] - 2026-10-10

- Revisão financeira reconhece o mesmo cronograma retornado pelo banco, sem exigir nova conferência por diferença na ordem dos campos da resposta.
- Reselecionar o mesmo aluno no recebimento de transferência preserva origem, notas, plano financeiro e revisão, mantendo as cinco etapas disponíveis.
- Desligar e religar opções financeiras antes de aplicá-las preserva as condições individuais das parcelas.

## [4.8.201] - 2026-10-10

- Turmas técnicas aceitam novas matrículas diretas até 365 dias após a data de início, inclusive; após o prazo, o ingresso exige transferência.
- Gestor e inscrição pública mostram o prazo e o motivo do bloqueio, usando a mesma elegibilidade do banco.
- Matrículas existentes, ativações, replays e recebimentos oficiais de transferência mantêm seus fluxos.
- Recebimento usa a grade completa do curso e organiza aluno, notas, configuração financeira, edição das parcelas e revisão geral em cinco etapas.
- Matrícula e mensalidades têm vencimentos independentes; o cronograma permite intervalo de 30 dias e confere os ajustes ao avançar.

## [4.8.200] - 2026-10-10

- Configurações, Financeiro e Parceiros carregam módulos sob demanda, reduzindo os chunks JavaScript abaixo de 500 kB.
- Fontes Inter passam a assets TTF com bytes preservados, cache e nova tentativa de carregamento; certificados mantêm texto e fontes embutidas.
- Build corrige importação mista da Secretaria, separa dependências sem ciclos e registra decisões explícitas sobre scripts npm.

## [4.8.199] - 2026-10-10

- Recebimento seleciona nosso curso técnico antes da turma e usa suas disciplinas, sem campo de curso de origem.
- Financeiro apresenta cobranças em lista, com ciclos independentes, valores formatados, edição, inclusão, remoção e movimentação de mensalidades.
- Cronograma conserva datas e condições por item na emissão posterior; o segundo ciclo dispensa justificativa adicional de continuidade.

## [4.8.198] - 2026-10-10

- Secretaria recebe aluno de outra escola a partir do cadastro, com escolha da turma de destino e registro de notas aproveitadas por disciplina.
- Condições individuais começam com o padrão da turma e permitem ajustar parcelas, valores, desconto, multa, juros, matrícula e rematrícula, com cobranças opcionais.
- Conferência registra a entrada e o plano financeiro; a emissão continua no fluxo próprio, incluindo taxa isolada ou ausência de cobranças.

## [4.8.197] - 2026-10-10

- Extrato financeiro do aluno na turma ganha Receber com a mesma janela e baixa manual do Financeiro.
- Confirmação atualiza extrato, totais da turma, Contas a Receber e saldos, respeitando permissões, origem e conta do polo.
- Parcela paga após cancelamento bancário deixa de sugerir retomar emissão e mostra a forma registrada na baixa manual.

## [4.8.196] - 2026-10-10

- Extrato financeiro da turma reconhece boletos Banese já emitidos e permite abrir o documento existente.
- Emissão e recebimento aparecem separados; boleto pendente conserva o status até a confirmação do pagamento.
- Descontos seguem a leitura de Contas a Receber, e alterações financeiras atualizam o extrato da matrícula.

