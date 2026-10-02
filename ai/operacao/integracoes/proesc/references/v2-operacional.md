# Contrato operacional Proesc V2

Revisão: 01/10/2026. Decisão do usuário: novas leituras e sincronizações devem usar V2; interromper consultas V1 e preservar histórico. O estado efetivo da implementação/publicação é registrado no lote e na [decisão](../../../../../docs/decisions/proesc-v2-operacional.md), não inferido desta diretriz.

## Acesso e período

- Base: `https://api.proesc.com/api/v2`. Header `Authorization: Bearer` e, nesta instituição, `x-proesc-waf` fornecido pelo suporte. Credenciais permanecem no Vault/conexão privada V2.
- Unidade consultada no estudo: `3145`. Polos locais não são novas unidades Proesc por inferência.
- `/invoices`: enviar `expiration_year` e `expiration_month` explícitos. Normalizar mês inteiro válido para texto `01` a `12` antes de serializar. Suporte confirmou a comparação textual e a consulta `09` recuperou setembro.
- Filtro de vencimento não é filtro de caixa: pagamento de título vencido em setembro pode ocorrer antes ou depois de setembro. Corte histórico usa a data de pagamento e a regra financeira local.
- A versão documental 2.1/Bora Estudar não é substituição da API escolar V2.

## Recursos e filtros

Filtros abaixo documentados nas [fontes oficiais revisadas](v2-fontes-2026-10-01.md). Existência documental não prova autorização ou comportamento em todas as combinações.

| Recurso | Filtros documentados | Uso no Universo |
| --- | --- | --- |
| `GET /people` | `unit_id`, `page`, `limit` (1–50, padrão 20), `id`, `cpf`, `name`, `email`, `group_id`, `search`, `registration_start_date`, `registration_end_date` | Localizar pessoas e examinar vínculos de matrícula/turma, começando pelas já existentes no sistema. |
| `GET /invoices` | `unit_id`, `expiration_year`, `expiration_month`, `invoice_type_id`, `person_id`, `national_registry`, `page` | Consultar parcelas por vencimento e pessoa, validar obrigação e estado financeiro. |
| `GET /configuration_data` | Conferir operação no catálogo/fontes oficiais antes de enviar filtros | Dados de carga/IDs; não presumir cadastro completo de turmas. |
| `GET /grades` | Conferir operação no catálogo/fontes oficiais antes de enviar filtros | Notas; não substitui fonte comprovada de situação da matrícula. |

`people.cpf` e `people.id` são buscas exatas; nome usa busca textual por prefixo, sem garantir unicidade. Datas de cadastro pertencem à pessoa, não ao ingresso/saída da matrícula. Uma única data seleciona aquele dia; início e fim formam intervalo inclusivo.

`invoices.person_id` identifica o aluno vinculado ao débito. `invoices.national_registry` é CPF do responsável financeiro. Não consultar o aluno com o filtro do responsável esperando equivalência.

## Envelope e normalização

- No estudo real, `invoices` trouxe objeto com `data[]` e metadados de paginação. Em `people`, foi observado `data`, `links`, `meta`. O schema documental antigo tem diferenças; inspecione o retorno específico.
- Valide página atual, última página, total, número de registros e IDs únicos. Não encerre inventário porque a primeira página respondeu 200. Não transforme timeout, HTTP 429, erro lógico ou página truncada em coleção vazia válida.
- Retorno real `invoices`: `invoice_id`, `person_id`, `pessoa`, `matricula`, `status`, `due_date`, valores original/atualizado/pago, `payment_date`, `discounts`, `late_payment_fees` e `bank_slip`.
- `matricula` contém `id`, `turma_id`, `ativa`, `data_saida` e outros campos. Não converter códigos/flags isolados em trancamento sem semântica comprovada.
- Valores foram retornados como texto PT-BR, por exemplo `279,90`. Valide formato e use centavos inteiros; não use `parseFloat` direto nem aritmética binária para liquidação.
- Encargos, valores pagos, data e boleto apareceram na raiz, embora o schema histórico aninhasse parte deles em `discounts`. Preserve objetos e prove caminhos antes de mapear; não aplaine perdendo identidade/componentes.

## Conciliação e identidade

1. Delimite unidades, turmas e matrículas locais autorizadas. Obtenha pessoa por identificador/CPF e valide vínculo de turma/matrícula; homônimo não basta.
2. Consulte parcelas e complete as páginas dentro do período. Prove vínculo de unidade/pessoa/turma/obrigação, principal e vencimento antes de anexar evidência a uma conta local.
3. Registre estado, observação e origem V2 pelo contrato do backend. Preserve histórico V1, chaves locais, baixas, lançamentos e a idempotência; não recrie obrigações apenas para trocar o nome da origem.
4. `PAGA` com data/valor e identidade consistentes pode ser prova de quitação conforme validador financeiro. Desconto comprovado não é saldo pendente.
5. `VENCIDO`/`EM ABERTO` exigem prova de obrigação e ausência de conflito de pagamento. Não sobrescreva pagamento local ou evidência de cancelamento com estado incompatível sem revisão.
6. `PAGAMENTO PARCIAL`, `PAGAMENTO SUPERIOR` e desconhecidos preservam o retorno e o tratamento explícito de revisão até regra homologada. Não inferir saldo de `original - pago` nem de `updated - pago`.
7. Ausência de título no conjunto não prova cancelamento ou renegociação. Mantenha as provas antigas; interromper V1 não exige apagá-las nem voltar a consultá-la.
8. Banese e ciclo emitido localmente preservam origem e contrato. V2 é consulta do legado Proesc, não substituição do gateway nem autorização para novas emissões.

## Limites de disponibilidade

Em 01/10/2026, `GET /configuration_data?unit_id=3145` respondeu HTTP 200 com
10 grupos, dois cursos, nove anos letivos, cinco tipos de parcela, 16 meios de
pagamento, 33 situações de matrícula, dez tipos de matrícula e uma instituição.
Não trouxe lista de turmas na raiz. As turmas foram conferidas pelos vínculos
`people.enrollments[].class.id`; coleta completa de 1.971 pessoas / 40 páginas
confirmou identidade inequívoca para as 402 matrículas com obrigações locais.
Também foram identificadas 24 matrículas locais sem vínculo financeiro Proesc;
isso não criou cobranças nem alterou estado acadêmico.

O cadastro auxiliar permite reconhecer códigos como `11 = TRANCOU`, mas o
código disponível não comprova a situação atual de cada matrícula. Uma futura
atualização acadêmica deve confrontar estado individual, datas e fatos locais.

Uma consulta adicional de janeiro/2027 retornou HTTP 200, total de 240 parcelas,
e 20 registros `EM ABERTO` na primeira página. Esse rótulo futuro foi observado
diretamente, não deduzido do exemplo de setembro; a coleta completa conserva a
verificação de valor pago zero e data de pagamento ausente antes de provar OPEN.

Trate HTTP 429 com pausa/retomada limitada; não crie laço ilimitado nem alterne para V1. Registre somente erro sanitizado, período, contagem e estado de completude. Sem prova suficiente, mantenha conferência em vez de prometer saldo.

As evidências concretas e discrepâncias de parcial/superior estão em [setembro/2026](v2-evidencia-setembro-2026.md). Para desligamento, consulte o [mapa de migração](v2-mapa-migracao.md).

## Estado implantado em 01/10/2026

Sete migrations e Edge `proesc-api` v28 ativadas após inventário completo e
auditoria. O runtime V2 é a fonte operacional; os dois runtimes V1 estão
desabilitados e rotas antigas retornam HTTP410, sem fallback. O histórico V1
continua disponível como prova armazenada.

Agendamento verifica trabalho a cada dois minutos. RECENT cobre mês atual e
anterior após 15 minutos; FULL repete a cada 24 horas e cobre pessoas e todos
os meses entre os vencimentos locais mínimo/máximo. Datas futuras não são
descartadas. As páginas e lotes são retomáveis, com identidade e revisão de
credencial validadas antes da aplicação. Cinco falhas encerram o run como FAILED,
sem tratar incompletude como ausência financeira.

O primeiro FULL completou 47 meses/12.814 parcelas. Das 6.417 obrigações locais,
6.392 foram reencontradas; 25 ausentes mantiveram as provas anteriores.
Nenhuma parcela sem vínculo financeiro local gerou nova obrigação.
Configuração/monitor V2 integram a entrega 4.8.149; consulte o
[registro da publicação](../../../registros/alteracoes/2026-10-01-proesc-v2-fechamento-publicacao.md)
e o estado remoto para distinguir preparação, Preview e produção.

## Abertura operacional e composição calculada

Depois da migração, a zeragem fixa anterior permitiu que confirmações históricas
aumentassem a posição atual. A correção autorizada separou abertura operacional
zero em 01/10/2026 nos quatro polos, após autorização explícita, sem reescrever
pagamentos, a despesa antiga de ajuste ou `data_saldo` da conta compartilhada.
O encerramento operacional em 30/09 discrimina o histórico e seu ajuste de
implantação; não elimina fatos nem cria despesa para simular a zeragem.

Quitação V2 e composição são evidências distintas. As quatro parcelas pagas
em 01/10 com vencimento em 05/10 receberam aprovação privada para cálculo do
desconto de R$ 19,90 pela regra já autorizada. O status é calculado por regra,
não desconto comprovado no retorno da API. A aprovação congela vínculo/snapshot
e exige identidade, data, valores, configuração exata e ausência de conflito.
Porto recebeu uma quinta aprovação específica. A autorização posterior do
usuário habilitou cálculo automático desde 01/10 para T43, T44 e T45: identidade
V2, pagamento PAGA pontual, principal/recebido exatos, regra da turma homologada
com revisão/fingerprint fixados, sem override nem conflito. Regra alterada,
data atrasada/futura ou configuração ambígua bloqueiam o cálculo. Não são criadas
aprovações por pagamento nem componentes de API artificiais. Nove candidatos
pagos em setembro permanecem fora dessa política.

O pagamento atrasado vencido em 16/09 permanece com composição não discriminada,
sem afetar sua quitação comprovada. Não promover desconto configurado/bloco sem
data a componente efetivamente aplicado. [Teste, auditoria e limites](../../../registros/alteracoes/2026-10-01-proesc-v2-virada-composicao.md).

## Limites reconferidos para a entrega 4.8.149

- As 27 obrigações em conferência são Proesc: 25 ausentes e duas parciais.
  Consulta dirigida por pessoa/mês confirmou as ausências com páginas completas.
  As três pendências mensais de outubro estão dentro das 27, não são adicionais.
- Treze ausentes têm cancelamento explícito em linhas contábeis históricas,
  mas sem data efetiva homologada; não remover a conferência por ausência V2.
- `/enrollment-financials` é documentado, mas seis consultas dirigidas com o
  token atual retornaram HTTP401, “Acesso não permitido para este endpoint.”
  Pessoas/parcelas com o mesmo token continuam HTTP200. Não atribuir esse erro
  ao WAF sem prova, nem equiparar permissão exibida a acesso efetivo.
- Tarifa de recebimento do Proesc é separada de desconto do aluno. Extratos
  enviados mostram bruto 260, tarifa 3,97 e líquido 256,03; `/invoices` consultado
  não informou a tarifa efetivamente debitada. Não aplicar tarifa fixa a todo
  pagamento, não confundir juros/multa com tarifa e não reativar V1 para buscá-la.
- Data de liberação/saque do extrato não é data de pagamento da mensalidade.
  Liberação em outubro de pagamento em setembro não cria nova receita de outubro.
