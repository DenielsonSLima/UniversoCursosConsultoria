# Relatório consolidado de produção — 24/07/2026

## Objetivo

Este documento consolida as alterações acumuladas desde a versão
`0.5.0-beta.1`, os testes realizados e as regras operacionais que devem ser
preservadas na publicação em produção.

Versão desta entrega: `0.6.0-beta.1`.

## Integrações financeiras

### Rotas válidas para novas cobranças

- Boleto e Pix: Banese.
- Cartão: Mercado Pago.
- Asaas e Banco Inter não podem ser selecionados em novas cobranças. O código
  legado permanece somente para auditoria, tratamento de cobranças históricas
  e encerramento seguro.
- Mercado Pago continua bloqueado para cobrança real até a homologação
  completa do cartão, webhook, idempotência e recuperação de criação ambígua.

### Banese

- O ambiente pode ser selecionado entre homologação e produção pelas
  configurações da integração.
- Em homologação, somente boleto é habilitado. O Pix permanece bloqueado
  porque o banco não devolve os dados necessários nesse ambiente.
- Em produção, boleto e Pix utilizam a resposta da API Banese. Quando o Pix for
  formalmente liberado pelo banco, os dados do Pix/BolePix poderão acompanhar
  os dados do código de barras.
- O Banese devolve os dados do título; o PDF do boleto e do carnê é montado
  pelo sistema e servido em rota privada e autenticada.
- A API é o fluxo principal. CNAB240 é contingência e somente pode operar com
  o código EDI7 real informado pelo banco.
- O painel de integração foi reorganizado em resumo, modalidade, ambiente,
  método e provedor, com controles explícitos de ativação e diagnóstico.
- A tela de contas a receber abre o boleto montado em uma nova aba, sem
  redirecionar o gestor ao portal do aluno.
- A consulta e a baixa são atualizadas automaticamente por API, Realtime e
  invalidação de cache. O botão manual “Atualizar” foi removido do fluxo
  normal.

### Teste de homologação

Foi emitido um boleto Banese de homologação para uma matrícula EAD de teste:

- Valor: R$ 99,90.
- Nosso Número: `000000120`.
- PDF: montado pelo sistema com linha digitável, código de barras, beneficiário,
  pagador, vencimento e indicação de homologação.
- Pix: corretamente identificado como indisponível em homologação.

Também foi validada a baixa manual segura:

1. o sistema solicitou conta bancária/caixa e composição do valor;
2. o backend validou idempotência, valor e identidade bancária;
3. o título deixou de aceitar pagamento no Banese;
4. a API confirmou a situação bancária de cancelamento;
5. somente depois dessa confirmação a baixa local foi consolidada;
6. o recebível passou para pago e a matrícula EAD foi ativada.

As primeiras tentativas revelaram e permitiram corrigir:

- identificador idempotente inválido;
- conta bancária selecionada no navegador sem ID canônico no envio;
- invocação desacoplada de método (`Illegal invocation`);
- divergência entre o identificador do pagamento e o Nosso Número;
- operação de baixa presa em processamento depois de falha segura.

O fluxo final mantém a baixa local bloqueada se o cancelamento remoto for
ambíguo ou não puder ser comprovado.

### Regras de ativação após pagamento

- EAD, curso livre e especialização: ativação automática após pagamento
  confirmado.
- Curso técnico: permanece aguardando análise documental mesmo após a
  confirmação financeira.
- Cálculos de principal, juros, multa, desconto, acréscimos e valor líquido
  pertencem ao backend. O frontend apenas coleta entradas e exibe o resultado
  canônico.

## Financeiro e caixa

- Contas a receber foram alinhadas às rotas Banese/Mercado Pago.
- Consultas financeiras passaram a expor o provedor bancário canônico.
- Busca, agrupamento por aluno, indicadores e payloads de Realtime foram
  otimizados.
- Resumos financeiros e pesquisas sensíveis exigem as permissões específicas
  do perfil.
- A conciliação Banese exibe evidência de execução, horário, situação e erro,
  sem interpretar ausência de registro como sucesso.
- O resumo de sincronização Banese passou a ser agregado no banco.
- A baixa manual usa estado seguro de processamento e recuperação após falha.
- O estorno da baixa permanece uma ação separada e auditável.

## Secretaria financeira

- “Recebimentos” foi reformulado como Secretaria Financeira.
- A interface possui três modos:
  - individual: pesquisa e financeiro completo de um aluno;
  - lote: agrupamento por curso e alunos vinculados;
  - personalizado: seleção combinada de alunos e cursos.
- As cobranças são agrupadas por aluno, matrícula e curso.
- A consulta usa a mesma fonte canônica do Financeiro, evitando a divergência
  em que o Financeiro mostrava uma dívida e a Secretaria mostrava saldo zero.
- A RPC de recebíveis abertos é protegida por escopo de empresa/polo e
  permissão de recebimento.
- A página originalmente extensa foi modularizada em componentes, hooks,
  tipos e utilitários menores.

## Secretaria digital e documentos

- Prévia acadêmica compartilhada para documentos da Secretaria.
- Histórico de emissões e reimpressão usam o mesmo componente de documento
  emitido.
- Declaração de matrícula, certificados e documentos correlatos passaram a
  consumir dados acadêmicos canônicos.
- A prévia inclui módulo/disciplina quando aplicável.

## Diários e resultados acadêmicos

- Configuração persistente de instrumentos avaliativos por diário.
- Instrumentos ativos determinam os campos de nota, os resultados canônicos e
  o fechamento do período.
- Notas sem lançamento permanecem nulas; não são convertidas silenciosamente
  em zero.
- Fechamento exige notas completas somente para instrumentos ativos.
- Frequência pode ser exibida mesmo quando ainda não há notas.
- Histórico acadêmico e visualizações legadas foram alinhados ao resultado
  canônico.
- A view de resultados usa segurança apropriada e a configuração é salva por
  RPC autorizada.
- Cards, rodapé e exportação PDF dos diários foram modularizados.
- Ordem curricular é persistida e respeitada na exibição.

## Comunicação e WhatsApp

- Suporte a múltiplas linhas, setores e roteamento por conexão.
- Configuração operacional de cada linha e estado de conexão persistidos.
- Alternância de linha no painel de atendimento.
- Fluxo visual de autoatendimento com definição validada e renderização segura.
- Agente de suporte a cursos com política, eventos, índices e regras de
  correspondência.
- Escopo de usuário falha de forma fechada quando não for possível comprovar a
  autorização.
- Testes cobrem tipos, definições de fluxo e comportamento do agente.

## Gestão, permissões e desempenho

- Busca da gestão recebeu ranking e prévia financeira otimizados.
- Consultas da gestão usam o escopo do chamador.
- Eventos Realtime foram reduzidos a payloads leves e continuam invalidando as
  consultas TanStack Query necessárias.
- Usuários e perfis de acesso receberam ajustes de escopo, identidade e
  permissões financeiras.
- Caixa, Financeiro, Secretaria e Gestão compartilham regras de empresa/polo
  sem expor dados de outra unidade.

## Banco de dados

As migrations acumuladas desta entrega cobrem:

- runtime e leitura Realtime das rotas financeiras;
- baixa manual com estado seguro;
- exposição do provedor e segurança dos recebíveis;
- otimizações de busca e eventos do Financeiro, Secretaria e Gestão;
- instrumentos e resultados canônicos dos diários;
- prévia acadêmica dos documentos;
- múltiplas linhas, setores, agente de cursos e segurança do WhatsApp;
- persistência da ordem curricular.

Todas as migrations locais desta entrega foram conferidas contra o histórico
remoto antes da publicação. Nenhum código EDI7 fictício foi criado.

## Edge Functions

O conjunto operacional inclui:

- `payment-gateway-api`;
- `payment-gateway-webhook`;
- `payment-checkout`;
- `checkout-api`;
- `banese-student-payment`;
- `banese-boleto-document`;
- `banese-carnet-document`;
- `banese-reconciliation-worker`;
- `banese-cnab240-api`;
- funções de configuração, webhook, automação e agente do WhatsApp;
- funções legadas do Asaas estritamente para histórico e encerramento seguro.

Secrets, tokens e chaves não são armazenados no repositório nem registrados
neste relatório.

## Validação da entrega

- ESLint do projeto completo: aprovado.
- Build Vite de produção com validação de versão: aprovado.
- Testes Deno das regras financeiras, Banese, WhatsApp e diário: executados
  antes da publicação.
- Migrations: conferidas pelo MCP Supabase.
- Edge Functions alteradas: conferidas e publicadas somente pelo MCP Supabase.
- Código remoto: publicado por commit atômico pelo MCP GitHub.
- Frontend: publicação de produção acionada pela integração da branch `main`.

## Itens deliberadamente não publicados

- `scratch/*.bundle.js`: artefatos locais usados somente para empacotamento de
  Edge Functions.
- arquivos `~$*.docx`: arquivos temporários de bloqueio criados pelo Word.
- credenciais, respostas sensíveis e dados pessoais completos usados nos
  testes.

## Procedimento de contingência

- Em falha de API Banese, não consolidar baixa local sem evidência bancária.
- CNAB240 só pode ser usado com EDI7 real e validação operacional.
- Em retorno ambíguo de criação ou cancelamento, manter o recebível em revisão
  e reutilizar a mesma chave idempotente.
- Não reativar Asaas ou Banco Inter como opção de novas cobranças.
- Reverter frontend pelo commit anterior e Edge Function pela versão anterior,
  sem apagar dados financeiros ou trilhas de auditoria.
