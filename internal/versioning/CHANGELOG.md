# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [27/09/2026 — versões 4.8.117 a 4.8.127](./changelog/2026-09-27-versoes-4-8-117-a-4-8-127.md), [16/09/2026 a 25/09/2026 — versões 4.8.65 a 4.8.90](./changelog/2026-09-16-a-2026-09-25-versoes-4-8-65-a-4-8-90.md), [13/09/2026 — versões 4.8.53 a 4.8.64](./changelog/2026-09-13-versoes-4-8-53-a-4-8-64.md), [08/09/2026 a 12/09/2026 — versões 4.8.37 a 4.8.52](./changelog/2026-09-08-a-2026-09-12-versoes-4-8-37-a-4-8-52.md), [03/09/2026 a 08/09/2026 — versões 4.8.30 a 4.8.36](./changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md), [02/09/2026 — versões 4.8.27 a 4.8.29](./changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md), [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

Histórico arquivado: [27/09/2026 — versões 4.8.115 a 4.8.116](./changelog/2026-09-27-versoes-4-8-115-a-4-8-116.md), [27/09/2026 — versão 4.8.114](./changelog/2026-09-27-versao-4-8-114.md), [27/09/2026 — versão 4.8.113](./changelog/2026-09-27-versao-4-8-113.md), [27/09/2026 — versão 4.8.112](./changelog/2026-09-27-versao-4-8-112.md), [27/09/2026 — versão 4.8.111](./changelog/2026-09-27-versao-4-8-111.md), [25/09/2026 a 26/09/2026 — versões 4.8.91 a 4.8.110](./changelog/2026-09-25-a-2026-09-26-versoes-4-8-91-a-4-8-110.md).

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

## [4.8.195] - 2026-10-09

- Card, cadastro e área de acesso exibem a mesma matrícula acadêmica principal do aluno.
- A matrícula principal serve para login; o identificador antigo continua aceito por compatibilidade.
- Alterações de matrícula atualizam a lista e o cadastro sem criar códigos a partir do cadastro pessoal.

## [4.8.194] - 2026-10-09

- Declaração de matrícula no portal do aluno utiliza o modelo salvo, incluindo parágrafos, assinatura, QR e marca institucional.
- Data de nascimento e identificação vêm da emissão autorizada, sem variáveis literais ou substituição por modelo genérico.
- Prévia, Baixar PDF e Imprimir usam o mesmo arquivo; reabrir consulta a configuração atual e preserva a identidade da emissão.

## [4.8.193] - 2026-10-09

- Contratos identificam CIN ou CPF e RG conforme o cadastro, com formatação e omissão de campos ausentes.
- Reabertura de contratos antigos corrige a apresentação da identidade, preservando condições, registros e arquivos de assinatura.
- Segunda via de matrícula e cursando usa PDF vetorial do modelo configurado, sem falha na preparação da camada de texto.

## [4.8.192] - 2026-10-09

- Crachá de identificação tem download em PDF separado da impressão e preserva o fundo do modelo cadastrado.
- Consulta pública da carteirinha respeita a configuração de campos salva, inclusive em códigos já emitidos.
- Grade curricular permite expandir disciplinas para consultar os dias de aula cadastrados.

## [4.8.191] - 2026-10-09

- Declarações de matrícula e cursando exibem a identificação cadastrada, formatam CPF/CIN e omitem campos ausentes sem inserir “Não informado”.
- Histórico recebe tipo, órgão e UF corretos; novas declarações preservam a identidade da emissão.
- Segunda via do certificado EAD usa o mesmo PDF na prévia, download e impressão, com linha do diretor e duas páginas completas.

## [4.8.190] - 2026-10-09

- Login do aluno reconhece a matrícula acadêmica exibida no cadastro, mesmo sem e-mail pessoal.
- Preserva a matrícula de acesso anterior e resolve a mesma conta no backend, recusando identificadores ambíguos.
- Testes cobrem senha sem transformação, Turnstile, acesso restrito à RPC e colisões entre matrículas.

## [4.8.189] - 2026-10-09

- Carteirinha do aluno mantém no PDF o modelo cadastrado, com fontes, quebras de linha, fotos, fundos e posições da prévia.
- Prévia, download e impressão reutilizam o mesmo arquivo por formato; Secretaria preserva os lotes A4 em dobra e espelhado.
- Aguarda fundos, assinatura e QR Code, apresenta falhas com nova tentativa e elimina consultas repetidas de assinatura no lote.
- A validade exibida ao aluno vem da emissão no backend, sem cálculo de prazo no frontend.

## [4.8.188] - 2026-10-08

- Certificados EAD identificam CPF/RG ou CIN conforme o cadastro individual, formatam CPF/CIN e preservam a identidade congelada da emissão.
- Prévia, Baixar PDF e Imprimir reutilizam o mesmo arquivo, com fundo do modelo incorporado e texto/tabela vetoriais.
- Corrigida a omissão do tipo de documento nos acessos do aluno e do histórico, sem reclassificar cadastros legados nem alterar outras modalidades.

## [4.8.187] - 2026-10-08

- Certificado EAD reutiliza o renderizador do editor, preservando tabela, fontes, imagens e coordenadas do modelo salvo.
- Backend fornece linhas de componente, carga coerente e status de conclusão sem inventar notas por módulo; certificados existentes preservam sua identidade.
- Validação compara editor e emissão com os mesmos dados e modelo, incluindo o fluxo de prévia e PDF renderizado.

## [4.8.186] - 2026-10-08

- Inclui no verso do certificado EAD os módulos cadastrados, com conteúdo, ordem e paginação fornecidos pelo backend.
- Unifica a grade da Secretaria, do aluno e da reimpressão pelo snapshot da emissão, preservando o modelo configurado.
- Completa a grade ausente dos certificados EAD já emitidos sem trocar códigos, datas ou contadores de emissão.

## [4.8.185] - 2026-10-08

- Libera automaticamente o certificado EAD após aprovação acadêmica validada no backend, com código de validação e proteção contra emissão duplicada.
- Retira do EAD a preparação manual de número, livro e página, preservando o fluxo das demais modalidades.
- Abre a prévia EAD no nível da tela, sem ficar presa ao contêiner da Secretaria.
- Inclui revisão e regularização controlada dos certificados EAD pendentes elegíveis.

## [4.8.184] - 2026-10-08

- Corrige a identificação do aluno por conta autenticada na abertura do BolePix, PDF do boleto e carnê, preservando titularidade e autorização do gestor.
- Exibe no financeiro do aluno o desconto bancário confirmado e o valor pagável dentro da validade, calculados exclusivamente no backend/RPC.
- Acrescenta testes de identidade, isolamento de cobranças e condições financeiras bancárias.

## [4.8.183] - 2026-10-07

- Permite arrastar e ajustar posição e tamanho do QR Code e largura dos campos de assinatura na última página do contrato.
- Salva as coordenadas no modelo e preserva o mesmo posicionamento na prévia, no PDF nativo e na reimpressão do histórico.
- Corrige os números sobre as linhas das testemunhas e impede sobreposição entre campos e textos do encerramento.

## [4.8.182] - 2026-10-07

- Registra a restauração já aplicada do primeiro ciclo das três matrículas da turma 46 e a reversão do lançamento local incorreto, sem repetir a operação financeira.

- O botão de gerar o segundo ciclo abre primeiro o aviso com as parcelas em aberto, antes da tela de datas e valores.
- Continuar abre a revisão padrão; Cancelar fecha o aviso. A emissão permanece na confirmação final do fluxo existente.
- Mantém a releitura das parcelas, bloqueio por erro e proteção contra clique duplo; o primeiro ciclo conserva seu fluxo normal.

## [4.8.181] - 2026-10-07

- Prepara correção financeira limitada, mantendo recebíveis e ciclos históricos com confirmação bancária antes do ajuste interno.
- Exige revisão dos termos e novo consentimento do usuário para retomar a emissão, sem reemissão automática.
- Distingue matrícula local dispensada, histórico pago preservado e totais ativos; registra as 14 migrations e os sete grants aprovados já instalados, com cópias canônicas imutáveis e sem confundir instalação com conclusão financeira.

## [4.8.180] - 2026-10-07

- Adiciona aviso antes de emitir o segundo ciclo, mostrando as cobranças em aberto da matrícula.
- Exige confirmação explícita e nova consulta das parcelas; alterações, erros e revisões invalidam a confirmação anterior.
- Preserva a elegibilidade do segundo ciclo, permissões, idempotência e recuperação existentes, sem cancelar ou substituir títulos.

## [4.8.179] - 2026-10-07

- O Portal do Gestor passa a ter um único contêiner de rolagem, evitando a segunda barra e o deslocamento para uma área vazia no financeiro da turma.
- Reset de navegação, cabeçalho fixo mobile e foco por teclado acompanham o contêiner correto, sem alterar regras financeiras.
- Seis contratos de fonte e revisão independente; smoke interativo autenticado permanece pendente.

## [4.8.178] - 2026-10-07

- Boleto e carnê preservam a logo oficial Banese quando o carregamento remoto falha, usando os mesmos bytes do recurso oficial já existente no projeto.
- Removida a marca genérica de contingência; logo Universo, três títulos por A4, valores, linha digitável, código de barras e QR Pix permanecem inalterados.

## [4.8.177] - 2026-10-07

- Contrato técnico: paginação canônica considera linhas, largura e área reservada para assinaturas e QR.
- Prévia de emissão preparada e histórico usam projeção segura do conteúdo congelado, sem nova emissão, mudança de aprovação ou reescrita de registros.
- Regressões sintéticas cobrem idempotência, autorização, texto integral, quebras de linha e limites do PDF vetorial.

## [4.8.176] - 2026-10-07

- Índices ordenados para consultar a evidência mais recente da composição do Caixa e a última execução completa do histórico.
- Aplicação concorrente preserva registros financeiros, cálculos, permissões e evidências; testes sintéticos protegem prioridade e desempates.
- Definições e planos de acesso verificados; smoke autenticado completo do Caixa permanece pendente.

## [4.8.175] - 2026-10-06

- Filiação exige somente nome da mãe para matrícula técnica; nome do pai passa a opcional no cadastro e no perfil do aluno.
- Ausência do pai deixa de gerar pendência ou bloquear o ingresso técnico; mãe, dados pessoais e endereço mantêm as exigências existentes.
- Regra alinhada entre frontend e RPC canônica, com regressões sintéticas; CI, Preview e publicação acompanham o registro do lote. Smoke autenticado Safari pendente.

## [4.8.174] - 2026-10-05

### Calendário de aulas

- Novo calendário cronológico da turma técnica com todos os módulos ou seleção de módulos em um PDF.
- Período inclusivo opcional, independente do mês aberto na agenda, mantendo aulas passadas e futuras.
- Módulo identificado em cada aula, ordem canônica de data/horário e encontros simultâneos preservados.
- Modo de módulo completo mantido; compositor vetorial usa cabeçalho institucional compartilhado e marca configurada.

## [4.8.173] - 2026-10-05

- Confirmação auditada do primeiro ciclo importado de uma matrícula T42 com 12 mensalidades pagas; segundo ciclo elegível sem emissão de cobrança.
- O assistente de geração posiciona o conteúdo no topo ao avançar ou voltar entre etapas.
- Operação individual aplicada via MCP Supabase e contrato de leitura aprovado; smoke visual autenticado da interface pendente.

## [4.8.172] - 2026-10-05

- Início e Calendário com rótulos de pelo menos 12px, contraste reforçado e espaçamento mais legível.
- Secretaria com títulos de navegação em 16px/peso 600, descrições em 14px e renderização automática localizada.
- Animações das telas revisadas terminam sem camadas transformadas; campos do Calendário usam no mínimo 16px em celulares.
- Validação técnica sem navegador por orientação expressa; conferência visual/autenticada permanece pendente.

## [4.8.171] - 2026-10-05

- Abas dos polos do Caixa com nomes em 16px, peso médio e maior contraste; selo Matriz ampliado de 9px para 12px.
- Renderização de fontes automática localizada nas abas; animação do Caixa termina sem manter texto em camada transformada.
- Validação técnica sem navegador, conforme orientação mantida do responsável; conferência visual permanece pendente.

## [4.8.170] - 2026-10-05

- Campos do aluno em celulares usam no mínimo 16px para evitar ampliação automática ao digitar.
- Login e portal usam renderização tipográfica da plataforma, sem suavização forçada ou animações que conservem camadas transformadas.
- Zoom manual continua acessível e não é confundido com o teclado na altura das telas do aplicativo.
- Revisão e reunião com três agentes; validação técnica sem navegador por solicitação expressa do responsável. Conferência visual permanece pendente.

## [4.8.169] - 2026-10-05

- Consultas de pagamentos tardios têm espaço garantido mesmo com uma fila contínua de cancelamentos em análise.
- Gestores financeiros podem consultar as revisões dos seus polos autorizados, preservando as permissões e a restrição de acesso aos demais polos.

## [4.8.168] - 2026-10-04

- Compras opcionais EAD vencidas aguardam três dias bancários completos e confirmação Banese antes do cancelamento.
- Nova compra preserva a matrícula e o boleto anterior; pagamento tardio recupera o recebimento original e protege tentativas concorrentes.
- Pagamentos duplicados permanecem na receita e entram em revisão com vínculo auditado de devolução já paga e comprovada.
- Worker dedicado e calendário verificado por polo; estados pendentes e falhas bancárias continuam fora da inadimplência.
- Prestação mensal e seleção de expiração reutilizam consultas e evitam replanejar a prova EAD para cobranças comuns.
- Intenções e pagamentos em processamento continuam em consulta após falhas repetidas, mesmo com novas baixas desligadas.

## [4.8.167] - 2026-10-04

- Compras iniciais EAD opcionais deixam de compor inadimplência, carteira exigível e listas de atraso.
- Sinais de pagamento aguardando conciliação preservam a exclusão; receita confirmada e obrigações existentes mantêm seus critérios.
- Classificação corrigida sem cancelar boletos, inscrições ou matrículas; regressão SQL incluída no CI.

## [4.8.166] - 2026-10-04

- Revisão independente com três agentes, realizada internamente e sem navegador conforme solicitação do responsável.
- Históricos e anexos atrasados não atravessam a troca de conversa; ações em lote antigas não limpam uma seleção nova.
- Busca WhatsApp por telefone restaurada; filtro de categoria continua recuperável após falha/perda de acesso e reabre por clique.
- Regressões determinísticas exercitam o código real com serviços simulados, sem envios, exclusões ou mudanças no banco.

## [4.8.165] - 2026-10-04

- Central de Atendimento com uma única fila para Portal, App e WhatsApp, ordenada pela última atividade e identificada por ícone de origem.
- Busca/status compartilhados, categorias internas e ações WhatsApp em lote preservados; respostas continuam no canal e na linha corretos.
- Início de conversa explícito por canal, cancelamento com restauração da seleção e falhas auxiliares sem ocultar conversas carregadas.
- Testes focados adicionados à CI. Entrega interna autorizada, sem navegador por solicitação do responsável; smoke visual final não executado.

## [4.8.164] - 2026-10-03

- Revisão da renegociação permite editar vencimento e valor de cada parcela, com validação canônica da soma e preservação da entrada.
- Cronograma alterado precisa ser validado antes de salvar; proposta e nova tentativa preservam datas, valores e identificação do cálculo.
- Motivos de aprovação em português; desconto comercial concedido fica destacado e separado da pontualidade futura.
- Esta entrega não ativa emissão ou cancelamento bancário.

## [4.8.163] - 2026-10-03

- Renegociações mantém o resumo canônico da seleção no topo da etapa Condições, antes dos campos do acordo.
- Quantidade, valor normal, desconto, juros, multa e total acompanham a seleção sem cálculos duplicados no cliente; teste cobre voltar, alterar parcelas e avançar novamente.

## [4.8.162] - 2026-10-03

- Convênios oferece Excluir nos cards, na tabela e no detalhe, com confirmação explícita e proteção ao trocar de polo.
- Exclusão lógica autorizada e auditável somente para cadastro inicial sem movimentações ou fechamento; parceiro e histórico são preservados.
- Convênios excluídos deixam as listas e o resumo do Caixa, e não aceitam novos lançamentos. Não há alteração na efetivação bancária de renegociações.

## [4.8.161] - 2026-10-03

- Transferências usa seletores pesquisáveis do sistema; empresas mostram nome, CNPJ formatado e cidade/UF em duas linhas.
- Origem e destino consultam o saldo gerencial de cada polo, sem repetir o saldo global de contas compartilhadas; falhas e carregamentos não apresentam valores antigos.
- Estorno preserva centavos e seleções são protegidas durante atualização; autorização de replay e permissões da tabela de transferências foram reforçadas.

## [4.8.160] - 2026-10-03

- Financeiro posiciona Renegociações imediatamente após A Pagar, preservando Resumo, A Receber, as demais abas e Conciliação ao final.
- Mantidos a rolagem horizontal, o visual existente e os controles de acesso. Esta entrega não inclui a efetivação bancária pendente de publicação.

## [4.8.159] - 2026-10-03

- Resumo da renegociação aparece ao selecionar a primeira parcela e acompanha a rolagem em uma faixa flutuante compacta.
- Totais canônicos, identificação do aluno/turma e ações Limpar/Continuar permanecem acessíveis; detalhes financeiros podem ser expandidos.
- Preservados seleção exclusiva, cálculos existentes e modal; nenhum ajuste de banco ou cobrança.

## [4.8.158] - 2026-10-03

- Renegociação bloqueia seleção simultânea de alunos ou matrículas diferentes, com limpeza explícita e proteção ao trocar filtros/polo.
- Resumo automático dos títulos selecionados: valor normal, com desconto de pontualidade vigente e com multa/juros, calculados no servidor sem conceder desconto à proposta.
- Critério da listagem visível; respostas antigas são ocultadas e dados não comprovados ficam a conferir.

## [4.8.157] - 2026-10-03

- Corrigido timeout da listagem de renegociações com consulta paginada por aluno e conferência de elegibilidade apenas ao abrir a matrícula.
- Abas internas seguem o padrão sublinhado do Financeiro; busca combinada com filtros pesquisáveis por tipo de curso e turma.
- Alunos e matrículas expansíveis, seleção individual ou múltipla de parcelas elegíveis e transferência da seleção ao modal em tela cheia.
- Falhas de consulta encerram o carregamento e oferecem nova tentativa; simulação e salvamento continuam sem efeitos bancários.

## [4.8.156] - 2026-10-03

- Pagamentos Proesc confirmados como quitados e inferiores ao nominal recebem desconto líquido calculado pela regra expressamente informada pelo responsável.
- Evidências documentais e componentes explícitos prevalecem; parciais, renegociações, cancelamentos e títulos locais ou bancários continuam protegidos.
- Preservados os valores recebidos, datas, saldos iniciais e histórico anterior ao corte operacional de outubro.

## [4.8.154] - 2026-10-03

- Financeiro recebe submódulo de propostas de renegociação para parcelas vencidas ou futuras elegíveis da mesma matrícula.
- Simulação e cronograma calculados no servidor, com padrões da matrícula/turma, concessões explícitas, histórico e repetição segura.
- Formulário e histórico em tela cheia; abas lado a lado com rolagem horizontal visível e Conciliação por último, sem atalho duplicado em A Receber.
- Salvar ou descartar proposta não altera títulos originais, não registra pagamento nem ativa acordo ou emite/cancela cobrança bancária.

## [4.8.153] - 2026-10-03

- Caixa distingue movimentos sem detalhamento da origem, mas sem diferença líquida, daqueles com valor ou diferença a conferir.
- Componentes não informados continuam desconhecidos; totais, pagamentos, datas e saldos operacionais são preservados.
- Avisos deixam de repetir o mesmo texto e o relatório usa a expressão composição a conferir.
- Contrato V2 somente leitura mantém permissões e compatibilidade estrita com a RPC anterior durante a implantação.

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

