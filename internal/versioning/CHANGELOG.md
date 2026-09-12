# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [27/08/2026 a 31/08/2026 — versões 4.8.8 a 4.8.19](./changelog/2026-08-27-a-2026-08-31.md), [26/08/2026 — versões 4.8.6 a 4.8.7](./changelog/2026-08-26.md), [25/08/2026 — versões 4.8.2 a 4.8.5](./changelog/2026-08-25-parte-1.md), [24/08/2026 — versões 4.8.0 a 4.8.1](./changelog/2026-08-24-parte-2.md), [24/08/2026 — versões 4.7.5 a 4.7.7](./changelog/2026-08-24-parte-1.md), [22/08/2026 a 23/08/2026](./changelog/2026-08-22-a-2026-08-23.md), [21/08/2026 a 22/08/2026 — parte 2](./changelog/2026-08-21-a-2026-08-22-parte-2.md), [21/08/2026 — parte 1](./changelog/2026-08-21-parte-1.md), [11/08/2026 a 20/08/2026](./changelog/2026-08-11-a-2026-08-20.md), [09/08/2026 a 10/08/2026](./changelog/2026-08-09-a-2026-08-10.md), [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

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

## [4.8.26] - 2026-09-01

### Alterado

- O vencimento inicial do próximo ciclo técnico passa a sugerir um mês após a
  última parcela oficial do ciclo anterior, preservando o dia quando possível.
- A data permanece editável e a escolha do gestor continua soberana na prévia,
  na criação das cobranças e na emissão BolePix.

### Segurança e integridade

- Matrícula, rematrícula, avulsas e parcelas fora da estrutura oficial não
  participam da data-base; sem histórico confiável, o campo permanece vazio.

### Qualidade

- Migration `20260902024657`, contratos focados, TypeScript, lint, limite de
  linhas, build e duas revisões independentes foram aprovados.

## [4.8.25] - 2026-09-01

### Alterado

- Cada cobrança do ciclo técnico passa a aparecer em duas faixas nas etapas de
  composição e revisão, com valor nominal, valor em dia, desconto, multa em
  reais, juros por dia e as três mensagens acadêmicas do boleto.

### Segurança e integridade

- Os valores detalhados são calculados pelo backend canônico, integram o
  fingerprint da prévia e são rejeitados pelo frontend quando incompletos ou
  incoerentes; o React não replica fórmulas financeiras.

### Qualidade

- A migration `20260902013930`, contratos focados, TypeScript, lint, limite de
  linhas e build de produção foram aprovados antes da publicação.

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
