# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

## [4.8.24] - 2026-09-01

### Alterado

- Uma única confirmação passa a criar os 13 recebíveis do ciclo técnico,
  emitir seus BolePix Banese e atualizar o Financeiro sem segunda ação.
- Falha parcial apresenta o progresso e retoma somente os itens incompletos.

### Corrigido

- A Turma 42 passa a usar multa única de 2%, preservando juros de 2% ao mês,
  rematrícula sem desconto e desconto de R$ 19,90 nas mensalidades.

### Segurança e integridade

- Resposta ambígua é retomada exclusivamente por GET e nunca libera novo POST.
- Snapshot, identidade bancária, Pix oficial e transação são validados e
  persistidos atomicamente; evidência de liquidação bloqueia qualquer mutação.

## [4.8.23] - 2026-09-01

### Corrigido

- O modal de geração manual ocupa a viewport real, sem ficar preso ao layout
  da página ou deixar uma folga superior.
- A elegibilidade deixa de expor códigos internos e o fluxo passa a separar
  vencimento, composição das cobranças e revisão final em três etapas.
- A composição lista rematrícula, parcelas, vencimentos, valores e a aplicação
  de desconto, multa e juros antes da confirmação.
- A ação final passa a se chamar `Gerar cobranças`.

### Segurança e integridade

- Dados, valores e cronograma vêm exclusivamente da prévia canônica do backend;
  nenhuma cobrança é criada antes da confirmação final.
- O hotfix não emite boleto Banese e não altera banco, Edge Function, Turma 42,
  Adenize ou recebíveis existentes.

### Qualidade

- Contratos do wizard, parser e prévia, TypeScript, ESLint, teto de 500 linhas
  e build de produção foram aprovados.
- O smoke visual autenticado permaneceu pendente porque não havia navegador
  conectado à sessão de validação.

## [4.8.22] - 2026-09-01

### Alterado

- Toda nova turma técnica passa a declarar um de três estados financeiros:
  nova, importada com o primeiro ciclo histórico ou importada concluída.
- Adicionar aluno a uma turma técnica manual apenas salva o vínculo e a regra
  financeira como pendentes; nenhum recebível, boleto ou agendamento é criado.
- A aba Financeiro mostra a prévia e gera, por confirmação individual, no
  máximo dois ciclos com os valores, encargos e quantidade configurados.
- O primeiro vencimento do segundo ciclo é individual; com rematrícula, as
  mensalidades começam no mês seguinte, e sem rematrícula a primeira parcela
  usa a própria data informada.

### Segurança e integridade

- A Turma 42 inicia no segundo ciclo, e a matrícula que já possui rematrícula
  mais 12 parcelas fica protegida estruturalmente contra duplicação ou reemissão.
- Inadimplência, ciclo anterior incompleto e status `TRANCADO` bloqueiam a nova
  geração no backend; o pagamento não dispara ciclo futuro automaticamente.
- A geração cria apenas recebíveis locais. A emissão Banese continua posterior,
  explícita por recebível e sem webhook.

### Corrigido

- O bundle das APIs financeiras voltou a exportar o helper de leitura Banese,
  eliminando o erro de inicialização que zerava a tela de conciliação.

### Qualidade

- O lote adiciona contratos para os três estados de turma, dois ciclos, prévia,
  idempotência, RBAC, Turma 42, alunos trancados e guardas Asaas/Banese/CNAB.

## [4.8.21] - 2026-09-01

### Segurança e qualidade

- O CI passa a executar 71 contratos BolePix/Banese, incluindo o claim durável
  exigido antes de qualquer POST e as guardas CAS da recuperação auditada.
- O fixture de emissão simula a intenção persistida e impede que regressões do
  contrato bancário permaneçam ocultas por uma suíte não exercitada no gate.

### Escopo

- A versão não altera runtime financeiro, banco, Edge Functions, PDFs ou
  cobranças; o avanço registra exclusivamente o reforço de testes e CI.

## [4.8.20] - 2026-09-01

### Corrigido

- O BolePix EAD passa a preservar atomicamente o retorno oficial do POST,
  inclusive o payload e a imagem Pix, sem descartar a resposta bancária por
  diferença de formatação local do CPF.
- Títulos EAD já emitidos sem Pix ganham recuperação GET-only e uma substituição
  excepcional cercada por identidade bancária, ausência de pagamento, baixa
  remota confirmada, novo Nosso Número e proibição de segundo POST ambíguo.

### Segurança e qualidade

- O fluxo de substituição é exclusivo para EAD, usa lease/CAS, arquiva a
  identidade antiga e nunca copia Pix, linha digitável ou código de barras de
  outro título; cobranças Técnicas permanecem fora da rota.
- A imagem QR é gerada apenas a partir do EMV oficial validado, com CRC e valor
  compatíveis, e a primeira persistência do par Pix ocorre de forma atômica.

## [4.8.19] - 2026-08-31

### Corrigido

- A consulta de recuperação Banese passa a inspecionar, sem cache, tanto o
  boleto quanto o envelope de pagamentos efetivados e aproveita o Pix oficial
  quando ele estiver presente, sempre no mesmo convênio e Nosso Número.
- O retorno original da emissão continua sendo a fonte canônica do BolePix; a
  recuperação usa somente GET e nunca cria, cancela ou duplica cobrança.

### Segurança e qualidade

- Os diagnósticos registram apenas formato e tipo dos campos encontrados, sem
  persistir payload bancário bruto, CPF, linha digitável ou conteúdo Pix.
- A auditoria real confirmou que o GET atual não repetiu o Pix nem para um
  título Técnico que já possuía QR oficial; 63 testes focados e o `deno check`
  dos adaptadores afetados foram aprovados.

## [4.8.18] - 2026-08-31

### Corrigido

- O checkout EAD passa a reconhecer o Pix oficial quando a consulta Banese
  devolve o BolePix em objetos ou listas aninhadas com nomes de folha
  diferentes do retorno original de emissão.
- A recuperação continua vinculada ao mesmo convênio e Nosso Número e não
  envia novo POST, não reemite e não duplica o boleto.

### Segurança e qualidade

- Somente um EMV oficial com CRC e valor válidos é aceito; a imagem do QR Code
  é montada exclusivamente a partir desse payload bancário confirmado.
- A regressão aprovou 247 testes de Banese, EAD e Técnico e o `deno check` dos
  seis entrypoints afetados.

## [4.8.17] - 2026-08-31

### Corrigido

- Contas a Receber reserva espaço próprio para o valor, desconto e ações na
  tabela desktop, impedindo que as informações do boleto avancem sobre os
  botões.
- A tipografia auxiliar fica mais compacta somente na tabela; os cards
  responsivos preservam o tamanho e o espaçamento anteriores.

### Qualidade

- Um contrato de apresentação protege as proporções da grade e diferencia o
  resumo compacto do desktop da apresentação regular em cards.

## [4.8.16] - 2026-08-31

### Alterado

- A Conciliação & Baixas mostra banco, agência e conta completos para gestores
  autorizados e remove a repetição de empresa/polo do detalhe de cada baixa.
- Contas a Receber mostra abaixo do valor nominal o desconto confirmado dos
  boletos Banese com nosso número, distinguindo oferta vigente, expirada e
  desconto efetivamente aplicado.

### Segurança e qualidade

- A conta integral exige Financeiro > Receber, polo autorizado, vínculo entre
  conta e polo e, nas baixas manuais, vínculo entre a baixa e o recebível.
- O desconto exige snapshot Banese íntegro e nosso número canônico; títulos
  pagos sem essa identidade não expõem desconto, e chamadas sem RBAC recebem
  `42501`.

## [4.8.15] - 2026-08-31

### Alterado

- Contas a Receber substitui o seletor de agrupamento pelo filtro de turmas em andamento da modalidade aberta; a listagem permanece organizada por aluno.
- Página, grupos, indicadores e extrato/PDF aplicam a mesma turma selecionada, sem misturar Técnico, EAD, Livre ou Especialização.

### Segurança e qualidade

- As RPCs verificam polo autorizado e aplicam a turma no servidor; funções novas usam `search_path` vazio e execução somente para usuários autenticados ou serviço.
- O serviço financeiro foi dividido por responsabilidade para manter todos os arquivos manuais dentro do teto de 500 linhas.

## [4.8.14] - 2026-08-30

### Adicionado

- A Conciliação & Baixas passa a reunir recebimentos Banese, baixas manuais e
  histórico migrado em duas faixas por cobrança, com filtros por data, origem,
  empresa, polo e busca aplicados no servidor.
- Cada baixa mostra origem, responsável, conta mascarada, valor recebido e
  ajustes comprovados, sem inventar hora ou composição do histórico.

### Segurança e qualidade

- A RPC paginada exige Financeiro/A Receber e polo autorizado, mascara CPF/CNPJ
  e conta no banco e não expõe payloads bancários brutos.
- Produção confirmou 263 recebimentos: 48 Banese, 26 manuais e 189 históricos.

## [4.8.13] - 2026-08-30

### Corrigido

- Os filtros Todos, Pago, Pendente e Vencido da conciliação Banese passam a
  carregar somente o estado selecionado, sem manter linhas da consulta anterior.
- Lista, indicadores e diagnósticos pesados usam consultas independentes; o
  histórico completo só executa na aba correspondente e falhas parciais não
  apagam os títulos visíveis.
- Invalidações Realtime são agrupadas e direcionadas, reduzindo leituras
  repetidas no Supabase.

### Segurança e qualidade

- O piloto automático Banese fica limitado à escada P3–P6; produção preserva o
  perfil efetivo P3 e só avança pelas condições existentes de amostra real e
  estabilidade.
- A migration preserva títulos, pagamentos, baixas, filas, tentativas,
  estabilidade e cooldown, mantendo P7–P20 disponíveis somente no modo manual.
- A validação aprovou 20 contratos Node, 25 testes Deno, 11 testes do controle
  Banese, ESLint, TypeScript, build e o teto global de 500 linhas.

## [4.8.12] - 2026-08-28

### Corrigido

- O carnê Banese da Adenize passa a reunir a rematrícula de R$ 100,00 e as 12 mensalidades de R$ 279,90, totalizando 13 títulos e R$ 3.458,80, todos da mesma matrícula e com identidade bancária confirmada.
- A rematrícula mantém seu tipo próprio e deixa de receber o desconto de pontualidade reservado às mensalidades; o boleto existente foi corrigido no banco sem cancelamento, reemissão ou novo POST.
- Os títulos históricos importados de Radiologia continuam válidos, sem exigência retroativa de Pix e fora do reparo da T42.
- O carnê volta ao modelo fixo de três títulos por página A4 mesmo com Pix oficial; os 13 títulos ocupam cinco páginas, com QR compacto e legível, sem alterar o layout separado do boleto individual.
- O recibo lateral do carnê passa a usar fundo branco, preservando bordas e conteúdo e reduzindo a cobertura de tinta na impressão.
- O resumo da Secretaria passa a informar uma rematrícula e 12 mensalidades, 13 títulos, um arquivo de carnê e cinco páginas, em vez de expor contadores internos de requisições.

### Segurança e qualidade

- O reparo de desconto aceita somente o marcador exato da rematrícula T42, valida título, transação, Pix, valor, vencimento e estado pendente, executa GET → PUT → GET e persiste o resultado por RPC auditada.
- Catálogo e carnê aceitam apenas `REMATRICULA` e `PARCELA` Banese registradas do mesmo pagador, matrícula, polo, ambiente, emissor, convênio e agência; títulos pagos, Asaas, legados sem registro e identidades divergentes permanecem excluídos.
- As cinco migrations do reparo foram auditadas; a validação final aprovou 112/112 testes, 10/10 `deno check`, 36/36 arquivos no `deno fmt --check`, todos os arquivos manuais no limite de 500 linhas e mais 17/17 testes depois da formatação.
- O smoke específico gerou 3+3+3+3+1 títulos em cinco páginas A4 e decodificou os 13 QRs rasterizados com correspondência exata aos 13 payloads.

## [4.8.11] - 2026-08-28

### Corrigido

- Os 13 títulos da Adenize — 12 mensalidades e uma rematrícula — foram recuperados automaticamente com Nosso Número exclusivo, linha digitável, código de barras e Pix oficial do Banese.
- Os 312 títulos históricos importados de Radiologia continuam válidos sem Pix e voltam a oferecer somente `Abrir`, sem `Enviar/Reenviar ao banco`.
- O catálogo da Secretaria volta a montar o carnê a partir dos títulos Banese já registrados, mantendo a rematrícula identificada separadamente.

### Segurança e qualidade

- A emissão consulta o Nosso Número antes do POST, avança a sequência sem colisão e nunca associa linha, barras ou Pix de outro título.
- Recuperação, emissão e persistência foram validadas por 257 testes focados, checagem de tipos, documentos bancários e auditoria dos 325 títulos envolvidos.

## [4.8.10] - 2026-08-28

- Os 13 recebíveis atuais foram preservados e suas identidades Banese sem prova foram quarentenadas após o GET revelar títulos de 2018/R$ 200; emissão e reconciliação seguem pausadas até o banco confirmar uma faixa exclusiva, com preflight e proveniência reforçados para impedir nova colisão.

## [4.8.9] - 2026-08-27

### Corrigido

- A consulta oficial pelo Nosso Número passa a extrair e persistir o `QrCode` antes da conciliação de juros e pagamentos, sem criar nem reemitir boleto.
- `TipoJuroMora = 3` passa a ser reconhecido como juros isentos, conforme os manuais API Cobrança e CNAB240 do Banese.
- Uma divergência de juros ou uma indisponibilidade de `PagamentosEfetivados` continua bloqueando baixa e status financeiro, mas não descarta o Pix validado do mesmo título.
- A retomada de matrícula ou rematrícula após uma baixa confirmada deixa de depender de novo token OAuth ou GET bancário.

### Segurança e qualidade

- O par Pix é gravado atomicamente no recebível e na transação somente após validar Nosso Número, banco 047, linha, código de barras, valor, fator de vencimento, dígitos verificadores e EMV oficial.
- Os 13 registros foram reclassificados corretamente: 12 títulos vinculados/importados e uma rematrícula, não 13 retornos POST perdidos.
- A conciliação usa locks e CAS do recebível e da transação; mudanças concorrentes são preservadas e fazem a tentativa falhar fechada.
- Uma pós-baixa incompleta volta à fila somente pelo marcador servidor `BANESE_POST_SETTLEMENT_PENDING:`, removido após concluir as projeções internas.

## [4.8.8] - 2026-08-27

### Corrigido

- A emissão Banese preserva o `QrCode` exato do retorno oficial antes da persistência; uma consulta só completa o Pix quando o próprio banco devolver o campo e o mesmo código de barras, valor e vencimento forem confirmados.
- Uma divergência bancária específica fica isolada para revisão sem interromper as demais cobranças do lote.
- Rematrícula, matrícula e dependência voltam a usar seus nomes próprios na tela e no relatório, sem aparecer como `Parcela 0`.
- Falhas na sincronização e na montagem segura do boleto passam a permanecer visíveis ao operador.

### Segurança e qualidade

- Nenhum QR Code, payload EMV ou número bancário é fabricado; divergências válidas continuam bloqueadas e o exemplo bancário não é associado a títulos com valor ou vencimento diferente.
- O automático Banese foi restaurado à faixa P3–P9 com RPCs e permissões endurecidos; o worker e o gateway publicados foram validados com testes focados, checagem de tipos e limite de 500 linhas.
- Títulos históricos sem o retorno POST permanecem isolados: o sistema não reconstrói QR Code e não aceita tipo de juros remoto fora do contrato financeiro confirmado.

## [4.8.7] - 2026-08-26

### Alterado

- O fechamento operacional registra reunião, correções, migrations, Edge Functions, CI, Vercel, smokes e limitações da entrega funcional 4.8.6 sem mudar seu contrato.

## [4.8.6] - 2026-08-26

### Corrigido

- Avisos financeiros Push, inbox e WhatsApp passam a revalidar o recebível antes do efeito externo; títulos suspensos, cancelados, estornados, devolvidos ou pagos não recebem lembretes de cobrança.
- O checkout EAD e o checkout legado reutilizam somente o mesmo título `PENDENTE` ou `VENCIDO`, sem pagamento, e repetem a validação entre reparos assíncronos e imediatamente antes de devolver a URL.
- O BolePix continua sendo emitido como `BOLETO` Banese. Quando o banco não devolve QR ou payload Pix oficial, backend e portais rebaixam a apresentação para o PDF do boleto sem fabricar nem exibir um Pix vazio.

### Segurança e qualidade

- A guarda compartilhada bloqueia `banese_card + PIX` direto antes de consultar configuração, em sandbox e produção, sem bloquear o Pix oficial retornado dentro de uma cobrança `BOLETO`.
- A ordem de locks financeiros foi normalizada para `contas_receber → job → delivery`, com revalidação de identidade e testes de corrida para impedir reapresentação ou envio após trancamento e pagamento.

## [4.8.5] - 2026-08-25

### Alterado

- O fechamento operacional registra migration, revisão cruzada, PR/merge, CI, Vercel Preview/Production, smoke público e limitações sem alterar o contrato funcional publicado em 4.8.4.

## [4.8.4] - 2026-08-25

### Corrigido

- A remoção ou troca de matrícula do Aluno passa a sincronizar por uma outbox autorizada, sem depender de DELETE filtrado do Postgres Changes, com refetch canônico ao reconectar ou retomar o aplicativo.
- O card financeiro usa somente status, elegibilidade de recibo e resumo calculados pelo backend; a página deixa de manter uma segunda assinatura Realtime para o mesmo evento financeiro.

### Segurança e qualidade

- A audiência `ALUNO` é autorizada pela identidade corrente, preservando o OID do autorizador, a policy RLS, os grants mínimos e os tópicos sem payload acadêmico sensível.
- Os quatro perfis continuam disponíveis na mesma identidade, separados entre os logins público e institucional, com seletor apenas quando há mais de um acesso compatível na audiência.

## [4.8.3] - 2026-08-25

### Alterado

- O fechamento operacional registra ledgers e hashes das 11 migrations, PR/merge, CI, Vercel Preview/Production, smoke HTTP e limitações de autenticação sem criar usuários, pagamentos ou lançamentos artificiais; o contrato funcional publicado em 4.8.2 permanece inalterado.

## [4.8.2] - 2026-08-25

### Corrigido

- Os Financeiros do Professor e do Aluno passam a receber do backend valores pagos, saldos, atraso, filtros, totais e paginação, sem tratar valor previsto como pagamento nem mascarar falha de consulta como saldo zerado.
- Recibos manuais usam snapshot autorizado e PDF vetorial institucional; prévia, download e impressão compartilham o mesmo arquivo, enquanto comprovantes oficiais de gateway permanecem preservados.
- O portal do Professor revalida os polos em toda montagem, mantém a sessão em falha transitória e nunca libera módulos com autorização apenas em cache.
- Realtime e TanStack refazem as leituras canônicas na assinatura e reconexão, com debounce, limpeza e invalidações direcionadas para matrícula, vacinas, calendário, comunicação e financeiro.

### Segurança e qualidade

- As novas RPCs confirmam a identidade e o escopo no banco, usam grants mínimos e preservam pagamento zero ou parcial, data civil de Maceió e exclusão de títulos cancelados ou estornados.
- Os acessos multiperfil continuam separados por audiência: Aluno/Responsável no login público e Gestor/Professor no institucional, com seleção somente quando houver mais de um perfil compatível.
- Contratos de Auth, SQL, PDF, Banese, Realtime e chaves TanStack foram incorporados ao gate obrigatório de CI.

## [4.8.1] - 2026-08-24

### Alterado

- O fechamento da identidade multiperfil registra os ledgers reais, a Edge Function v35, o merge, o deploy web e os smokes de Produção no lote ativo, no histórico operacional e no índice RAG.

### Segurança e qualidade

- O patch não altera o contrato funcional 4.8.0; apenas preserva evidências imutáveis de CI, rollout e limitações do smoke autenticado sem criar usuário artificial.

## [4.8.0] - 2026-08-24

### Adicionado

- Uma mesma identidade autenticada pode reunir, de forma controlada, os perfis Gestor, Professor, Aluno e Responsável.
- O login público oferece somente Aluno e Responsável; o login institucional oferece somente Gestor e Professor. Quando há um único perfil na audiência, o acesso é automático; quando há dois, a pessoa escolhe o contexto.

### Segurança e qualidade

- O compartilhamento exige CPF válido e e-mail canônico iguais em todos os perfis, preserva a senha existente e rejeita colisões ou divergências antes do vínculo.
- Travas transacionais, constraints diferíveis e limpeza conservadora de Auth protegem vínculos e exclusões concorrentes.
- Recuperação de senha, primeiro acesso, checkout, convites assinados e Edge Function foram revisados em conjunto, com contratos multiperfil incorporados ao gate do GitHub.

## [4.7.7] - 2026-08-24

### Corrigido

- O card do aluno agora reconhece a validação administrativa do e-mail com check verde e rótulo próprio, sem confundi-la com a confirmação independente do Supabase Auth.

## [4.7.6] - 2026-08-24

### Corrigido

- A Caixa de Assinaturas da Secretaria volta a consultar os documentos da Matriz, cujo UUID legado é válido no PostgreSQL, sem falhar antes da chamada remota.

### Segurança e qualidade

- A fronteira das RPCs continua rejeitando identificadores malformados; autorização, escopo, banco e funções remotas permanecem inalterados.
- A PR #87 foi integrada na `main`, a Vercel Production ficou pronta e o smoke autenticado da Caixa da Matriz concluiu sem erro.

## [4.7.5] - 2026-08-24

### Corrigido

- A emissão do Diário volta a respeitar a capa visual configurada em Modelos de Documentos, sem reconstruir uma capa genérica nem duplicar logo, título, marca d'água ou slogan.
- Capa e contracapa possuem destinos independentes, e o gerador relê o modelo autoritativo antes de compor o PDF para não reutilizar a arte antiga em cache.
- Professor e Coordenador voltam a ter slots digitais explícitos e posicionáveis na página de validação.

### Segurança e qualidade

- Novas emissões congelam a capa no manifesto V3 por URL, MIME, dimensões, tamanho e SHA-256, mantendo a finalização dos manifestos V1/V2 históricos.
- A migration V3, a Edge Function v14 e a aplicação web foram publicadas em Produção pela PR #85; o contrato remoto preserva V1/V2 históricos, exige V3 para novas emissões e mantém JWT/ACLs restritivos.

## [4.7.4] - 2026-08-23

### Alterado

- O fechamento operacional da entrega 4.7.3 foi sincronizado no lote ativo, no registro de alterações e no índice RAG versionado.

### Segurança e qualidade

- A publicação funcional permanece inalterada; esta revisão registra CI, Vercel Produção, rotas públicas e a versão estável exibida pelos portais.

## [4.7.3] - 2026-08-23

### Corrigido

- As turmas técnicas e livres temporárias voltaram a aparecer no Gestor pelo contrato acadêmico canônico, sem coerção incorreta dos indicadores numéricos.
- O portal do Professor passou a reutilizar o mesmo Diário do Gestor, com frequência, conteúdo, notas, fechamento, prévia oficial e assinatura eletrônica.
- Capa, contracapa, campos, marca d’água e posições de assinatura do Diário agora são consumidos diretamente de Modelos de Documentos e Configurações, com falha explícita para capa raster legada incompatível.

### Adicionado

- Professores com atribuição de coordenação recebem, no próprio portal, a caixa de revisão e a segunda assinatura do Diário; o papel de acesso continua sendo Professor.
- O Gestor recebeu o módulo Assinaturas com cards de Diários, Contratos e Matrículas, filtros, caixa/acervo, documentos finais, comprovantes e atalhos para o Diário assinado dentro da turma; categorias sem pipeline próprio permanecem explicitamente indisponíveis.
- O Diário assinado termina automaticamente com duas páginas vetoriais de evidências, além do comprovante independente para validação.
- Uma skill operacional permanente obriga novos geradores de PDF a reutilizarem os modelos e a marca d’água configurados antes de qualquer fallback.

### Segurança e qualidade

- O fluxo continua Professor → Coordenador, exige reautenticação e preserva provas individuais, manifesto semântico, hashes e compatibilidade histórica; divergências de papel, posição ou geometria do modelo falham antes da emissão.
- Os testes temporários cobrem Professor, Professor coordenador, Aluno e Responsável; nenhuma cobrança, boleto ou operação Banese é criada.

## [4.7.2] - 2026-08-23

### Corrigido

- Logout, retorno dos seletores de perfil e primeiro acesso agora limpam a sessão local com segurança, preservando outros dispositivos apenas nos encerramentos automáticos.
- A grade técnica ganhou rótulos explícitos, horários sugeridos coerentes e remoção da sugestão ao trocar para outra carga; a Ficha de Matrícula repara a grade eleitoral sem danificar estruturas externas.

### Adicionado

- O atalho “Novo Registro” do Dashboard passa a oferecer Responsável pelo fluxo canônico existente.

### Segurança e qualidade

- O escopo RLS de Parceiros falha fechado para polo nulo, a reconciliação de convites foi reforçada e os contratos críticos passaram a integrar o gate do GitHub.

## [4.7.1] - 2026-08-22

### Alterado

- O fechamento operacional da entrega 4.7.0 foi sincronizado no lote ativo, no histórico de alterações e no índice RAG versionado.

### Segurança e qualidade

- A publicação funcional já validada permanece inalterada; esta revisão atualiza somente os registros operacionais e a versão exibida pelos portais.

## [4.7.0] - 2026-08-22

### Adicionado

- Cursos Livres passam a usar uma jornada presencial completa, com turma, professor responsável único, grade, aulas e diário integrados.
- A Gestão pode preparar e publicar uma avaliação final com banco mínimo de 50 questões; cada tentativa recebe dez questões únicas sorteadas no servidor.
- O Portal do Aluno reúne resumo acadêmico, diário, atividades, notas, prova final e certificado do Curso Livre.
- Cada aluno pode herdar o plano financeiro padrão da turma ou receber uma condição individual de 1 a 60 parcelas, com descontos, juros e multa autorizados.
- As avaliações EAD passam a preservar rascunhos, confirmar respostas pelo servidor e exibir o retorno correto somente no momento autorizado.
- Os cards de Cursos Técnicos mostram a quantidade de disciplinas e o progresso acadêmico canônico de cada turma.

### Alterado

- A conclusão de Curso Livre, o resultado da prova e a solicitação do certificado passam a ocorrer atomicamente no backend.
- A Gestão pode vincular o aluno sem títulos ou gerar os títulos locais no vínculo; a emissão bancária permanece uma ação posterior e separada no Financeiro.
- O Curso Livre de Informática Básica recebeu nove matérias, resumos e conteúdos, carga total de 80 horas e avaliação publicada com 50 questões válidas.
- Os gabaritos dos 63 cursos EAD foram removidos do JSON público e armazenados em cofre privado, com reconstituição exclusiva pelas RPCs autorizadas da Gestão.

### Segurança e qualidade

- Sorteio, correção, elegibilidade, cálculo financeiro, rateio de centavos e conclusão permanecem exclusivamente em RPCs autorizadas, idempotentes e auditáveis.
- Novas tabelas usam RLS e menor privilégio; RPCs críticas usam `SECURITY DEFINER`, `search_path` vazio, locks determinísticos e grants explícitos.
- A revisão final fechou a máscara do primeiro retorno financeiro, serializou início e entrega da prova por matrícula e passou a exigir soma exata da grade antes de concluir o salvamento.
- Mutações e conclusão EAD foram serializadas, e os indicadores dos cards técnicos passaram a falhar de modo explícito diante de payload incompleto.
- Fotografias parciais de prova e contagens acadêmicas vazias ou apenas coercíveis também passam a falhar fechadas no cliente.
- Contratos acadêmicos, financeiros e de interface, TypeScript, ESLint, limite de linhas e build de produção foram validados antes da publicação.
