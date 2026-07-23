# Relatório da sessão — WhatsApp, Financeiro, Banese, CNAB240 e Mercado Pago

**Período:** 21–22/07/2026  
**Projeto:** Universo Cursos e Consultoria  
**Objetivo:** alinhar integrações oficiais, restringir provedores, tornar a
baixa manual segura, adicionar Conciliação/CNAB240 e preservar o fluxo acadêmico
sem quebrar as regras existentes.

Este relatório não contém números de telefone, tokens, certificados, chaves,
CPFs ou dados bancários sigilosos.

## 1. Resultado executivo

A entrega foi concluída com as seguintes decisões:

- WhatsApp oficial preparado para Coexistence com o número próprio, validando a
  identidade exata da WABA e do Phone Number ID, sem trocar silenciosamente a
  configuração existente;
- Banese limitado a boleto e Pix; Banese nunca recebe rota de cartão;
- Mercado Pago limitado a cartão;
- Asaas e Banco Inter removidos da seleção e das rotas de novas cobranças;
- API Banese definida como caminho principal e CNAB240 como contingência;
- nova aba **Financeiro > Conciliação** habilitada nos perfis autorizados;
- tela **Resumo** passou a mostrar evidência da última atualização/teste Banese;
- baixa manual em dinheiro passou a validar valores no backend, cancelar e
  confirmar o título remoto antes de marcar a parcela paga;
- regra de curso técnico preservada: pagamento não ignora análise documental;
- arquivos financeiros muito grandes foram modularizados nos pontos alterados;
- migrations e Edge Functions foram aplicadas via MCP;
- 400 testes automatizados passaram, além de TypeScript, ESLint, Deno check/fmt
  e build de produção;
- nenhum pagamento remoto fictício foi emitido e nenhum dado de teste persistiu.

## 2. Processo seguido

### Etapa 1 — leitura e mapeamento

Foram mapeados:

- entradas de matrícula por modalidade;
- regras de preço, parcelas, descontos, multa e juros;
- criação de recebíveis e transações de caixa;
- roteamento por provedor/método/ambiente;
- emissão e reconciliação Banese;
- webhooks e rotinas históricas Asaas;
- Checkout/webhook Mercado Pago;
- ativação acadêmica depois do pagamento;
- permissões do módulo Financeiro;
- documentação Banese, PDFs de boleto/carnê e CNAB240;
- configuração de Coexistence do WhatsApp oficial.

### Etapa 2 — contenção de risco

Antes de habilitar novas funções, foram eliminados fallbacks implícitos e rotas
incompatíveis. Provedor desconhecido, rota ausente, ambiente divergente ou título
remoto ambíguo agora falham de forma fechada.

O código antigo que ainda poderia criar nova cobrança Asaas por `/payments` ou
`/paymentLinks` foi removido do fluxo alcançável. Consultas históricas `GET` e o
cancelamento seguro de títulos legados foram preservados para auditoria.

### Etapa 3 — implementação modular

As funções foram divididas em serviços, hooks, componentes, validadores e
orquestradores. Não houve mudança deliberada do padrão visual do sistema.

### Etapa 4 — banco e deploy

As migrations passaram por dry-run com rollback e, só depois, foram aplicadas.
As Edge Functions foram verificadas e publicadas por MCP, mantendo JWT ou
autenticação própria conforme o tipo do endpoint.

### Etapa 5 — regressão e auditoria

Foram executadas suites financeiras, Banese, Asaas histórico, gateway, portal,
autorização, WhatsApp e utilitários do Financeiro. A revisão final incluiu
consulta do estado remoto, migrations, rotas, credenciais, perfis e ausência de
dados artificiais.

## 3. WhatsApp oficial e Coexistence

O sistema já enviava e recebia mensagens, conforme validação operacional
informada pelo responsável. O trabalho desta sessão fortaleceu o onboarding e o
estado operacional para usar o número próprio no modo Coexistence.

Validações implementadas:

- a WABA precisa ser exatamente a configurada;
- o Phone Number ID precisa corresponder ao número selecionado;
- o número precisa estar no estado compatível com WhatsApp Business App /
  Coexistence;
- a configuração do webhook e o estado da sessão são registrados;
- payloads incompatíveis não substituem silenciosamente a configuração válida;
- endpoints administrativos exigem JWT; webhook usa autenticação própria.

Migration aplicada: `whatsapp_coexistence_operational_state`.

Edge Functions ativas na verificação final:

- `whatsapp-config` v17 — JWT;
- `whatsapp-embedded-signup` v4 — JWT;
- `whatsapp-webhook` v12 — endpoint público com validação própria.

### Teste manual do número próprio

1. Na Meta, confirme que o número continua ativo no WhatsApp Business App e foi
   adicionado à mesma WABA usada pelo sistema.
2. No sistema, abra Configurações > Mensageria > WhatsApp.
3. Inicie o Embedded Signup/Coexistence sem remover a configuração atual.
4. Selecione a WABA e o número esperados.
5. Confirme que o sistema mostra a identidade correta e não aceita outra WABA ou
   outro Phone Number ID.
6. Envie uma mensagem do sistema para um contato de teste autorizado.
7. Responda pelo WhatsApp e confirme a entrada da mensagem na conversa.
8. Envie pelo aplicativo WhatsApp Business e confirme que a coexistência não
   interrompeu a API.
9. Confira status do webhook e eventos sem expor tokens nos logs.

Resultado esperado: envio e recebimento pelos dois canais usando o mesmo número,
sem duplicação de configuração e sem troca de identidade.

## 4. Matriz financeira definitiva

| Modalidade | Boleto | Pix | Cartão |
| --- | --- | --- | --- |
| Técnico | Banese | Banese | Mercado Pago |
| EAD | Banese | Banese | Mercado Pago |
| Livre | Banese | Banese | Mercado Pago |
| Especialização | Banese | Banese | Mercado Pago |
| Outros créditos | Banese | Banese | Mercado Pago |

Estado atual:

- boleto Banese: habilitado apenas no sandbox;
- Pix Banese: bloqueado em sandbox e produção;
- cartão Mercado Pago: bloqueado em sandbox e produção até homologação;
- Asaas/Banco Inter: sem rotas de novas cobranças e fora da seleção;
- históricos não foram apagados.

Há também uma restrição no banco de dados para impedir combinações inválidas.

## 5. Banese — API, boleto, carnê e saúde

O Banese não devolve um PDF pronto. A API fornece dados como nosso número,
convênio, linha digitável, código de barras e situação. O sistema monta o PDF
por código local, em rotas privadas/autenticadas.

Arquivos centrais:

- `supabase/functions/banese/internal/boletos/boleto-pdf.ts`;
- `supabase/functions/banese/internal/carne/carne-pdf.ts`;
- `supabase/functions/banese-boleto-document/`;
- `supabase/functions/banese-carnet-document/`.

Modelos enviados ao banco:

- `banese homologacao/carne-banese-bruna-tecnico-enfermagem-6-parcelas-com-enderecos.pdf`;
- `banese homologacao/Modelo de Boleto (1) (2) (1).pdf`.

Esses layouts continuam aguardando retorno formal do Banese. O código de geração
já existia e foi preservado; não foi substituído por URL de PDF do banco.

Na aba Resumo, a saúde Banese usa duas evidências reais:

- último teste persistido da credencial;
- sincronização ou erro mais recente persistido em título Banese.

Sem evidência recente, a tela informa a ausência de atualização. Ela não afirma
que a API está online apenas porque a tela carregou.

## 6. Conciliação e CNAB240

A aba **Financeiro > Conciliação** foi adicionada e liberada para Perfil
Financeiro e Perfil Gestor com escopo de todos os polos. Ela inclui:

- painel de remessa Banese;
- download seguro do arquivo gerado;
- upload de retorno;
- validação de extensão, conteúdo e tamanho;
- prévia sem baixa financeira;
- aplicação explícita depois da conferência;
- resultado por registro;
- revalidação, retomada e retry;
- listas de recebíveis e transações conciliadas.

A API continua principal. CNAB não é disparado automaticamente só porque existe
uma aba. O operador deve primeiro observar falha real/indisponibilidade da API e
seguir o procedimento de contingência aprovado.

### Modularização CNAB

- `return-service.ts`: 1.635 → 24 linhas;
- `remittance-service.ts`: 666 → 10 linhas;
- parser, validação, locks, leases, persistência, aplicação, respostas e
  idempotência foram separados em 13 módulos;
- maior módulo resultante: aproximadamente 337 linhas.

O movimento `02/WRITE_OFF` permanece bloqueado porque não foi homologado. O EDI7
está vazio e precisa ser fornecido pelo banco. Gerar um arquivo sem o EDI7 real
seria tecnicamente possível, mas operacionalmente incorreto; o sistema impede
essa ação.

### Teste manual de remessa

Pré-condições: ambiente sandbox, usuário autorizado, EDI7 oficial configurado e
caso descartável aprovado pelo Banese.

1. Abra Financeiro > Resumo e registre a evidência da falha/indisponibilidade da
   API.
2. Abra Financeiro > Conciliação > Remessa.
3. Selecione apenas títulos sandbox elegíveis e confira quantidade/valor.
4. Gere a remessa.
5. Abra o arquivo em editor que preserve posições e confira linhas com 240
   caracteres, header/trailer, convênio, EDI7 e totais.
6. Envie pelo canal oficial do Banese e registre o protocolo externo.
7. Tente gerar novamente a mesma remessa e confirme a proteção contra duplicata.

Estado esperado hoje: sem EDI7, a geração operacional deve ser bloqueada com
mensagem clara; não contorne essa proteção.

### Teste manual de retorno

1. Use somente arquivo de retorno recebido do Banese no sandbox.
2. Faça o upload e execute **Pré-visualizar**.
3. Confirme banco, lote, sequência, nosso número, ocorrência e valores.
4. Verifique que a prévia não alterou nenhuma parcela.
5. Aplique o retorno uma única vez.
6. Confira resultados aplicados, ignorados e enviados para revisão.
7. Reimporte o mesmo arquivo e confirme que não há segunda baixa.
8. Confira parcela, transação, auditoria e atualização por Realtime.

Resultado esperado: somente registro inequivocamente conciliado produz efeito;
divergência permanece em revisão.

## 7. Baixa manual — dinheiro em mãos

A tela de recebimento agora permite informar principal, juros, multa, desconto,
acréscimo e total efetivamente recebido. O frontend não calcula o resultado.

Equação canônica no backend:

```text
total recebido = principal + juros + multa + acréscimo - desconto
```

Exemplo de teste válido:

- principal: R$ 100,00;
- juros: R$ 5,00;
- multa: R$ 2,00;
- acréscimo: R$ 3,00;
- desconto: R$ 10,00;
- recebido: R$ 100,00.

### Parcela sem título remoto

1. Selecione uma parcela descartável sem identidade de gateway.
2. Abra **Receber**.
3. Informe conta, data, forma e valores.
4. Confirme.
5. Verifique parcela `PAGO`, valor em centavos, transação de caixa e evento de
   auditoria.
6. Atualize outra tela aberta e confirme TanStack/Reatime.

### Parcela com boleto Banese ativo

Use apenas título descartável do sandbox, pois o teste cancela o boleto.

1. Abra a baixa manual e informe os valores.
2. Confirme a operação.
3. O backend consulta o título Banese e confere identidade/ambiente.
4. O backend solicita a baixa remota.
5. O backend consulta novamente e exige a situação `5` (cancelado).
6. Somente depois a parcela local pode virar `PAGO`.
7. Confira o settlement e os eventos de auditoria.

Se o Banese responder que o boleto já está pago, a baixa manual deve ser
recusada. Se houver timeout, retorno ambíguo ou falha de confirmação, o resultado
esperado é `REVIEW_REQUIRED`, sem `PAGO` e sem lançamento financeiro final.

### Testes negativos

- altere o total recebido para R$ 99,99 no exemplo: backend deve recusar;
- envie a mesma idempotency key com o mesmo payload: deve retornar o mesmo
  resultado, sem duplicar caixa;
- envie a mesma chave com valores diferentes: deve recusar;
- tente uma segunda baixa concorrente: somente uma tentativa pode ser dona do
  lease;
- selecione cartão Mercado Pago ativo: deve falhar fechado enquanto o
  cancelamento oficial não estiver homologado;
- selecione título CNAB sem identidade API suficiente: deve ir para revisão.

## 8. Regras de juros, multa, desconto e parcelas

Os valores emitidos e termos da parcela são preservados como snapshot para que
mudanças futuras na turma não reescrevam um título já emitido. A matrícula
individual continua tendo precedência quando existe regra específica aprovada.

O frontend mantém os campos, mas não deriva tarifa ou líquido. Taxa e valor
líquido só aparecem quando persistidos pelo backend/provedor; ausência é exibida
como “—” ou “Não informado”, sem inventar zero.

O parcelamento escolhido é preservado na tentativa e no recebível. Ativar uma
rota não autoriza quantidade acima do permitido pelo curso/turma.

## 9. Efeito do pagamento nos cursos

- EAD, livre e especialização: pagamento confirmado pode ativar a matrícula de
  forma idempotente.
- Técnico: baixa financeira é registrada, mas a matrícula continua aguardando
  a análise documental.
- Outros créditos: o sistema registra o efeito financeiro aplicável e não cria
  matrícula sem uma regra acadêmica explícita.

Uma matrícula encerrada, cancelada ou movimentada não é reaberta por webhook
atrasado.

### Teste manual acadêmico

1. Crie um caso descartável por modalidade no sandbox.
2. Confirme o pagamento pelo fluxo canônico, nunca pelo redirect do checkout.
3. Para EAD/livre/especialização, confira uma única matrícula ativa.
4. Para técnico, confira pagamento baixado e status aguardando documentação.
5. Reprocesse o mesmo evento e confirme que matrícula/recebível não duplicam.
6. Teste uma matrícula encerrada e confirme que ela não é reativada.

## 10. Segurança, auditoria e banco de dados

Foram criadas:

- `receivable_manual_settlements`;
- `receivable_manual_settlement_events`.

Características:

- RLS habilitado sem política para cliente;
- execução exclusivamente backend/service role;
- eventos imutáveis;
- idempotency key e fingerprint;
- tentativa ativa única por parcela;
- claim atômico e lease de dois minutos;
- locks sobre settlement, parcela, conta e transação;
- comparação financeira em centavos;
- snapshot do recebível e identidade remota;
- estados explícitos de revisão, conclusão e reversão.

Também foram adicionados índices para todas as chaves estrangeiras novas e para
rotas de gateway. O Advisor não deixou chave estrangeira financeira sem índice
no escopo desta entrega. As mensagens de índice “ainda não usado” são esperadas
para tabelas novas sem dados.

## 11. Migrations aplicadas

Nomes confirmados no ambiente remoto:

1. `whatsapp_coexistence_operational_state`;
2. `add_gateway_checkout_creation_fencing`;
3. `create_banese_cnab240_exchange`;
4. `preserve_issued_enrollment_receivable_terms`;
5. `online_inscription_repair_idempotency`;
6. `receivable_manual_settlement_audit`;
7. `enable_conciliacao_for_financial_profiles`;
8. `limit_financial_providers_banese_mercado_pago`;
9. `index_receivable_manual_settlement_foreign_keys`;
10. `index_payment_gateway_route_foreign_keys`.

Os dry-runs foram revertidos antes da aplicação real.

## 12. Edge Functions publicadas/confirmadas

| Função | Versão | Autenticação |
| --- | ---: | --- |
| `banese-cnab240-api` | 1 | JWT |
| `payment-gateway-api` | 22 | JWT |
| `asaas-api` | 57 | JWT; histórico/encerramento |
| `asaas-webhook` | 25 | segredo/validação própria |
| `asaas-cancel-receivable` | 9 | JWT |
| `payment-checkout` | 37 | endpoint público com controles internos |
| `checkout-api` | 22 | endpoint público com controles internos |
| `payment-gateway-webhook` | 13 | assinatura/validação própria |
| `banese-reconciliation-worker` | 10 | segredo do worker |
| `whatsapp-config` | 17 | JWT |
| `whatsapp-embedded-signup` | 4 | JWT |
| `whatsapp-webhook` | 12 | validação própria |

Os endpoints legados `asaas-checkout`, `asaas-ead-checkout` e
`asaas-online-admin` permanecem neutralizados com `410 Gone` e não são caminho
de novas cobranças.

## 13. Modularização executada

Principais resultados:

- `return-service.ts`: 1.635 → 24 linhas;
- `remittance-service.ts`: 666 → 10 linhas;
- `gateways/router.ts`: 561 → 355 linhas;
- novo `router-adapter-runtime.ts`: 237 linhas;
- `ConciliacaoBancariaTab.tsx`: aproximadamente 1.131 → 125 linhas;
- `ModalidadeReceberTab.tsx`: 1.354 → 250 linhas;
- dez módulos novos na tela Receber; maior com aproximadamente 288 linhas.

Arquivos legados grandes fora do núcleo alterado foram preservados para evitar
uma refatoração ampla e arriscada na mesma entrega financeira. Eles devem ser
modularizados em PRs específicos, com testes próprios.

## 14. Validação automatizada

Resultado integrado final:

| Suite | Testes aprovados |
| --- | ---: |
| Gateways | 197 |
| Asaas API/histórico | 68 |
| Asaas webhook | 21 |
| Banese CNAB | 21 |
| Banese geral, boleto, carnê e core | 58 |
| Portal Banese | 18 |
| Autorização | 7 |
| WhatsApp Coexistence | 6 |
| Utilitários da UI financeira | 4 |
| **Total** | **400** |

Também aprovados:

- TypeScript `tsc --noEmit`;
- ESLint em 79 arquivos frontend alterados/novos;
- Deno check em 12 entrypoints;
- Deno fmt/check em 186 arquivos;
- build de produção Vite, 2.927 módulos, versão `0.5.0-beta.1`.

Não houve criação persistente de pagamento ou aluno fictício. Ao final, as duas
tabelas de baixa manual tinham zero registros.

A inspeção visual automatizada no navegador não pôde ser executada porque não
havia navegador conectado à sessão. Isso não altera os testes/build aprovados,
mas a lista de teste manual deste documento deve ser seguida por um operador
autenticado antes do canário.

## 15. Conferência final do ambiente

Foi confirmado via MCP:

- dez títulos Banese de homologação preservados;
- zero recebíveis Asaas/Banco Inter/Mercado Pago com identidade nova no conjunto
  consultado;
- zero baixas manuais e zero eventos artificiais;
- cinco rotas de boleto Banese sandbox ativas;
- quinze rotas Banese bloqueadas (Pix sandbox, Pix produção e boleto produção);
- dez rotas Mercado Pago cartão bloqueadas;
- Perfil Financeiro e Perfil Gestor com a aba `conciliacao-bancaria`;
- migrations finais presentes;
- funções publicadas em estado `ACTIVE`.

## 16. Pendências externas / não contornar

1. Retorno formal do Banese sobre os PDFs de boleto e carnê.
2. Código EDI7 e homologação CNAB240.
3. Liberação formal do Pix Banese em produção.
4. Credenciais/convênio Banese de produção.
5. Homologação completa de cartão Mercado Pago, inclusive recuperação de
   criação ambígua, cancelamento, estorno e chargeback.
6. Validação manual da Coexistence na Meta com o número próprio e a WABA exata.

Até essas pendências serem resolvidas, os bloqueios são comportamento correto,
não defeito.

## 17. Checklist de aceite manual

- [ ] A aba Conciliação aparece para Financeiro/Gestor e não aparece para perfil
  sem permissão.
- [ ] Resumo mostra data/status reais da integração Banese.
- [ ] Boleto Banese sandbox emite e o PDF local abre autenticado.
- [ ] Carnê local corresponde aos dados das parcelas.
- [ ] Pix Banese permanece bloqueado.
- [ ] Cartão Mercado Pago permanece bloqueado.
- [ ] Asaas e Banco Inter não aparecem para nova cobrança.
- [ ] Baixa sem título remoto valida a equação em centavos.
- [ ] Baixa com boleto Banese só conclui após confirmação remota de cancelamento.
- [ ] Timeout/ambiguidade deixa revisão, sem parcela paga.
- [ ] Repetição idempotente não duplica caixa.
- [ ] Retorno CNAB exige prévia e reimportação não duplica baixa.
- [ ] Técnico pago continua aguardando documentos.
- [ ] EAD/livre/especialização ativam somente após confirmação canônica.
- [ ] Realtime atualiza a outra tela e invalidations não exibem dados antigos.
- [ ] Número próprio envia e recebe em Coexistence sem perder o aplicativo.

## 18. Estratégia de rollback

Se um erro for encontrado no canário:

1. desabilitar a rota específica, sem apagar credenciais ou histórico;
2. suspender o worker/ação afetada conforme o runbook;
3. manter settlements e eventos para auditoria;
4. não reverter pagamentos confirmados com update manual;
5. corrigir por migration forward-only;
6. reconciliar API/CNAB e caixa antes de reabrir a rota.

Não usar `DROP`, apagar títulos ou reescrever histórico como primeira resposta.

## 19. Referências

Locais:

- `docs/integracoes-bancarias-arquitetura-e-homologacao.md`;
- `docs/integracoes-bancarias-banese.md`;
- manuais e PDFs em `banese homologacao/`;
- `AGENTS.md` para regras duráveis do projeto.

Oficiais Mercado Pago:

- [SDK Node.js oficial](https://github.com/mercadopago/sdk-nodejs)
- [Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview)
- [Integração de cartões](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/cards)
- [Notificações de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications)

Não foi encontrado projeto público Banese que substitua homologação bancária.
Os manuais fornecidos pelo banco e a aprovação formal do Banese continuam sendo
a fonte normativa.

