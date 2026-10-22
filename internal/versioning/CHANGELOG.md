# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [27/09/2026 — versões 4.8.117 a 4.8.127](./changelog/2026-09-27-versoes-4-8-117-a-4-8-127.md), [16/09/2026 a 25/09/2026 — versões 4.8.65 a 4.8.90](./changelog/2026-09-16-a-2026-09-25-versoes-4-8-65-a-4-8-90.md), [13/09/2026 — versões 4.8.53 a 4.8.64](./changelog/2026-09-13-versoes-4-8-53-a-4-8-64.md), [08/09/2026 a 12/09/2026 — versões 4.8.37 a 4.8.52](./changelog/2026-09-08-a-2026-09-12-versoes-4-8-37-a-4-8-52.md), [03/09/2026 a 08/09/2026 — versões 4.8.30 a 4.8.36](./changelog/2026-09-03-a-2026-09-08-versoes-4-8-30-a-4-8-36.md), [02/09/2026 — versões 4.8.27 a 4.8.29](./changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md), [01/09/2026 — versões 4.8.23 a 4.8.26](./changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md), [01/09/2026 — versões 4.8.20 a 4.8.22](./changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md), [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

Histórico arquivado: [28/09/2026 a 30/09/2026 — versões 4.8.128 a 4.8.137](./changelog/2026-09-28-a-2026-09-30-versoes-4-8-128-a-4-8-137.md), [27/09/2026 — versões 4.8.115 a 4.8.116](./changelog/2026-09-27-versoes-4-8-115-a-4-8-116.md), [27/09/2026 — versão 4.8.114](./changelog/2026-09-27-versao-4-8-114.md), [27/09/2026 — versão 4.8.113](./changelog/2026-09-27-versao-4-8-113.md), [27/09/2026 — versão 4.8.112](./changelog/2026-09-27-versao-4-8-112.md), [27/09/2026 — versão 4.8.111](./changelog/2026-09-27-versao-4-8-111.md), [25/09/2026 a 26/09/2026 — versões 4.8.91 a 4.8.110](./changelog/2026-09-25-a-2026-09-26-versoes-4-8-91-a-4-8-110.md).

Histórico arquivado: [30/09/2026 — versões 4.8.138 a 4.8.144](./changelog/2026-09-30-versoes-4-8-138-a-4-8-144.md).

Histórico arquivado: [01/10/2026 a 04/10/2026 — versões 4.8.145 a 4.8.168](./changelog/2026-10-01-a-04-versoes-4-8-145-a-168.md).

## [4.8.232] - 2026-10-22

- Build exige Node estável 24.22.1 ou posterior na linha 24.x antes de gerar o site.
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
