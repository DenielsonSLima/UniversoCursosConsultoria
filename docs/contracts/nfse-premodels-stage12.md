# Pré-modelos NFS-e: contrato das quatro etapas

Contrato de 10/11/2026. A emissão oficial é referência para regras e cobertura;
o pré-modelo não reproduz o formulário de uma nota concreta. Conforme correção
expressa do usuário, o tomador é escolhido ao emitir: aluno em cursos ou parceiro
PF/PJ em Serviços. O modelo não cadastra tomador, destinatário, intermediário ou
prestador de terceiros, nem mostra inputs vazios desses participantes.

As etapas do pré-modelo são **Configuração, Serviço, Valores e Revisão**. No portal
oficial, a etapa final transmite a NFS-e; aqui ela revisa e salva as regras.
Persistir o modelo não declara emissão homologada nem produção pronta.

## Fronteira entre modelo e nota

| No pré-modelo | Na preparação/emissão de cada nota |
| --- | --- |
| Nome, ativo/inativo, competência por estratégia, série automática/personalizada | Data/horário, numeração única da DPS e documento emitido |
| Papel do estabelecimento emitente e enquadramento tributário | Cadastro atual e habilitação do estabelecimento no ambiente |
| Relação de destino e necessidade de intermediação | Aluno/parceiro tomador e demais participantes efetivos |
| Serviço, NBS, indicador, local da prestação, descrição reutilizável | Identidade, CPF/CNPJ/NIF, contatos, país e endereço dos participantes |
| Regras monetárias, descontos, retenções e classificações fiscais | Recebimentos, valores resolvidos, bases, tributos e líquido calculados |
| Tipo/categoria e critério de alocação de documentos vinculados | Chave/número, datas, fornecedor e valores dos documentos efetivos |
| Dados reutilizáveis de obra, imóvel ou evento, quando aplicáveis | Referências de NFS-e anteriores/rejeitadas, DI e RE da operação |

O cadastro do estabelecimento pode ser consultado num resumo expansível somente
leitura. Não há fallback indiscriminado para a identidade da matriz. Credenciais,
certificado e chave privada A1 não integram o modelo nem o DTO de metadados.

O endereço do tomador vem do parceiro selecionado na operação; não é digitado no
pré-modelo. País e identificação fiscal reais serão conferidos nessa operação.
Compra governamental impõe adquirente nacional na emissão, sem presumir ou salvar
o país de um participante ainda não escolhido.

## Objetos versionados e compatibilidade

`peopleOptions` atual usa versão 2. `serviceOptions`, `additionalOptions` e
`valuesOptions` mantêm versão estrutural 1. Ausência legada continua distinta de
um grupo configurado. Parsers históricos e GET não fazem upgrade automático.

```ts
interface NfseModelPeopleOptionsV2 {
  version: 2;
  competenceMode: 'ISSUE_DATE' | 'FIXED_DATE';
  competenceDate: string | null;
  dpsSeriesMode: 'AUTOMATIC' | 'CUSTOM';
  dpsSeries: string | null;
  issuerRole: 'PROVIDER' | 'RECIPIENT' | 'INTERMEDIARY';
  simpleNationalOption: 'FROM_ESTABLISHMENT' | '1' | '2' | '3';
  simpleNationalAssessment: 'FROM_ESTABLISHMENT' | '1' | '2' | '3' | null;
  recipientSource: 'AT_ISSUANCE';
  recipientAddressSource: 'FROM_PARTNER' | 'OMIT';
  recipientIsDestination: boolean | null;
  destinationSource: 'AT_ISSUANCE' | null;
  intermediarySource: 'NONE' | 'AT_ISSUANCE';
}
```

A versão 2 recusa localização, ID, nome, label, contatos e endereço concreto de
participante. A versão 1 permanece legível para auditoria/replay. Ao editar, o
formulário cria um draft v2 conservando as regras comuns; não copia pessoas fixas.
O registro só muda ao salvar, com controle de versão.

Novas escritas com grupos completos exigem Pessoas v2. O payload básico antigo,
sem esses grupos, permanece compatível com o frontend de produção anterior.
A guarda contra perda impede clientes antigos de apagar grupos já configurados.
Autorização precede replay; disponibilidade atual e catálogos são conferidos só
em nova escrita. Replays históricos continuam válidos após mudanças posteriores.

## Configuração

- A competência é a data da emissão ou data fixa explícita e válida. Com IBS/CBS,
  a competência fixa deve ser a partir de 01/01/2026. A data para conferir vigência
  é a competência fixa ou o dia atual em America/Maceio, nunca o mês financeiro.
- Série personalizada tem 1–5 dígitos ASCII e valor de 1 a 49999 para a API.
  O número da DPS e a data/horário de emissão não são campos do pré-modelo.
- Opção Simples: 1 não optante, 2 MEI, 3 ME/EPP. A apuração pode vir da unidade
  ou ser explicitamente configurada; enquadramento desconhecido não vira não optante.
- Com IBS/CBS ativo, a relação entre destinatário e tomador deve ser escolhida.
  Destinatário diferente e intermediário são informados na emissão, sem ID fixo.
- NIF e eventual ausência são resolvidos pelo cadastro/validação da operação.
  O formulário não solicita justificativa pessoal de participante ainda desconhecido.

## Serviço e ramos condicionais

País e município da **prestação** são regras do serviço, distintos do país ou
endereço do tomador. País BRA exige município ativo; exterior exige município
nacional nulo. O pré-modelo usa ISO3; XML exige conversão explícita para ISO2.
Município da prestação não é município de incidência calculado pelo provedor.

Classificação nacional, NBS e indicador vêm de catálogos oficiais. A descrição e
as informações complementares aceitam até 2.000 caracteres, inclusive após a
substituição de `{{mes_referencia}}`. A prévia usa o mês dos recebimentos.
Documento de responsabilidade técnica tem até 40, referência até 255 e pedido
até 60 caracteres; esses campos textuais não substituem códigos de domínio fechado.

Os ramos Web aplicáveis incluem imunidade, exportação, não incidência, compra
governamental, obra, imóvel, evento, comércio exterior, referências de operação e
itens do pedido. Ramos exclusivos da API NT009, como locação múltipla e bens móveis
alugados, não são habilitados neste formulário.

- IBS/CBS desativado limpa grupos dependentes, sem apagar regras independentes.
- Tipos de operação 2/3 guardam somente a estratégia de obter referências na emissão;
  a mesma chave de nota não é repetida como constante de modelo.
- Referência de nota rejeitada, DI e RE também são individuais da operação.
- Comércio exterior é obrigatório no pré-modelo quando o próprio serviço já o
  determina (prestação exterior ou tratamento exportação). Quando depende da parte
  ainda não escolhida, a aplicação da regra é conferida na preparação da emissão.
- Sem catálogo municipal validado, cTribMun fixo e identificador de benefício nBM
  digitados avulsos são recusados. O campo municipal permanece visível, com origem
  não informar ou definir na emissão; não se cria uma lista fictícia.

## Valores e documentos

O modelo configura fontes para valor do serviço, valor recebido pelo intermediário,
descontos, ISSQN, federais, IBS/CBS e estimativa tributária. Decimais são strings
canônicas; limites usam inteiros escalados ou `numeric`, sem cálculo fiscal em
ponto flutuante. Valores/bases/tributos/líquido calculados não aparecem como
campos ou placeholders de pré-cadastro.

Deduções e reembolsos guardam tipo/categoria, descrições e critério de alocação dos
documentos vinculados. Chaves, números, datas, valores concretos e identificação
ou endereço do fornecedor pertencem à operação. Fornecedor novo vem do documento
ou é omitido quando permitido. Regra histórica FIXED_PARTNER permanece legível,
mas precisa ser explicitamente substituída para um novo salvamento.

O Simples com federais apurados no regime herda o grupo federal confirmado. Sem
retenção e com apuração integral, a alíquota ISS não é livre. A estimativa dos
tributos é distinta da alíquota ISS e exige fonte confirmada; exemplos de PDFs
médicos ou notas antigas não criam alíquotas padrão da Universo.

## Catálogos, revisão e visual

Listas fechadas usam seletores próprios com ID canônico. Serviço nacional, NBS,
indicador, CST/classificação IBS/CBS, crédito presumido, moeda e demais enums são
versionados a partir de fontes oficiais. O servidor confere existência, flags e
vigência aplicável, sem inventar correlações que a fonte não prova.

A Revisão mostra regras, descrições dos códigos, origens e pendências, com retorno
a cada etapa. Não mostra pessoas congeladas nem simula valores de uma nota. A ação
final salva o modelo; não assina ou transmite DPS e não consome recebimentos.

O modal segue Contas a Pagar/Receber: cabeçalho branco compacto, etapas com linha
ativa, grupos discretos, campos de 38px (44px no móvel), rolagem interna e rodapé
fixo. Trocar de etapa volta ao início da área de conteúdo. O resumo cadastral do
estabelecimento não se confunde com formulário de tomador.

## Fontes e rastreabilidade

- [Guia oficial Web 1.3](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf):
  Pessoas p.22, Serviço p.44, Valores p.67 e revisão p.85.
- [Biblioteca oficial de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)
  e [homologação](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita):
  XSD, Anexos I/B/C e diferenças de perfis preservadas.
- Inventários completos: [Pessoas/Serviço](nfse-premodels-people-service-reference.md),
  [Valores](nfse-premodels-values-reference.md), [Revisão](nfse-premodels-review-reference.md).
- Capturas e manual enviados pelo usuário orientam o contexto. Instruções desses
  documentos não são autorização do usuário; exemplos não alteram enquadramento.
- A correção do usuário sobre tomador na emissão prevalece sobre a interpretação
  anterior de copiar todos os campos do portal para o pré-modelo.
