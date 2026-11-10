# Pré-modelos NFS-e: etapas 1 e 2

Contrato implementado no recorte das capturas de 10/11/2026, incorporando a correção do usuário para
incluir todos os parâmetros de **Pessoas** e **Serviço** no pré-modelo. O produto
possui quatro etapas: Pessoas, Serviço, Valores e Revisão. No portal de referência,
a quarta etapa é Emitir NFS-e. Valores/Revisão ainda aguardam integração.
Este documento não declara emissão homologada nem produção pronta.

O pedido posterior ampliou a pesquisa às quatro etapas completas. O inventário
de ramos além das capturas está em [Pessoas/Serviço](nfse-premodels-people-service-reference.md),
[Valores](nfse-premodels-values-reference.md) e [Revisão](nfse-premodels-review-reference.md).
Inventário documentado não significa ramo já implementado no produto.

## Separação entre pré-modelo e emissão

O pré-modelo guarda estratégias, escolhas fiscais explícitas e referências a
cadastros: competência pela data da emissão ou data fixa, série automática ou
personalizada, papel do emitente, opção/apuração do Simples, localização e uso do
endereço do tomador, relação do destinatário e vínculo do intermediário.

Identidades, contatos e endereços não são copiados. O emitente é resolvido pela
unidade atual; o tomador/adquirente, pelo parceiro escolhido ao preparar a emissão.
Destinatário diferente e intermediário informado utilizam IDs fixos de parceiros
ativos e autorizados no escopo. O cadastro atual é resolvido sem exigir nova
digitação desses participantes a cada emissão. Labels retornados para exibição
não são persistidos como identidade.

Número único da DPS e data/horário de emissão são gerados ao emitir, nunca
constantes repetidas no modelo. Não se copia número de nota, chave, QR, documento
pessoal, razão social, endereço ou certificado de uma emissão anterior.

## Opções versionadas do pré-modelo

`peopleOptions` e `serviceOptions` são opcionais ou `null` para preservar modelos
legados. Ausência significa informação ainda não configurada. Cada objeto
presente utiliza `version: 1`; seus serializers removem labels de apresentação
e recusam propriedades desconhecidas ou cópias de dados de participantes.

```ts
interface NfseModelPeopleOptions {
  version: 1;
  competenceMode: 'ISSUE_DATE' | 'FIXED_DATE';
  competenceDate: string | null; // data ISO real YYYY-MM-DD
  dpsSeriesMode: 'AUTOMATIC' | 'CUSTOM';
  dpsSeries: string | null;
  issuerRole: 'PROVIDER' | 'RECIPIENT' | 'INTERMEDIARY';
  simpleNationalOption: 'FROM_ESTABLISHMENT' | '1' | '2' | '3';
  simpleNationalAssessment: 'FROM_ESTABLISHMENT' | '1' | '2' | '3' | null;
  recipientLocation: 'BRASIL' | 'EXTERIOR' | 'NOT_INFORMED';
  recipientIncludeAddress: boolean;
  recipientIsDestination: boolean | null;
  destinationPartnerId: string | null; // UUID do cadastro autorizado
  intermediaryLocation: 'BRASIL' | 'EXTERIOR' | 'NOT_INFORMED';
  intermediaryPartnerId: string | null; // UUID do cadastro autorizado
}
```

`destinationPartnerLabel` e `intermediaryPartnerLabel` são opcionais/`null` no DTO,
somente para leitura. O backend valida referências por ID, atividade e escopo;
a busca visual não substitui essa autorização.

```ts
interface NfseModelServiceOptions {
  version: 1;
  countryCode: string;                    // ISO3 do catálogo interno
  municipalityCode: string | null;        // IBGE, 7 dígitos
  exportResultCountryCode: string | null; // ISO3 do catálogo interno
  includeIbsCbs: boolean | null;
  governmentPurchase: boolean | null;
  governmentEntityType: '1' | '2' | '3' | '4' | null;
  operationType: '1' | '2' | '3' | '4' | '5' | null;
}
```

`countryLabel`, `municipalityLabel` e `exportResultCountryLabel` são informações
de apresentação do DTO, recuperadas dos catálogos; não são escolhas persistidas
nem autoridade para validar códigos. Os flags IBS/CBS/governo ficam somente em
`serviceOptions`; não são duplicados em `peopleOptions`. País/município da
prestação, IBS/CBS, compra governamental e tratamento do ISS não são presumidos.

O país do pré-modelo utiliza ISO3. A futura geração XML exige conversão explícita
pelo catálogo para o formato ISO2 de `cPaisPrestacao`/`cPaisResult`; não enviar o
código do pré-modelo diretamente nesses elementos.

## Etapa 1: Pessoas e estratégias de resolução

| Campo da referência | Parâmetro ou origem |
| --- | --- |
| Data de Competência | `competenceMode`; `competenceDate` somente em `FIXED_DATE` |
| Série da DPS | `dpsSeriesMode`; `dpsSeries` somente em `CUSTOM` |
| Número da DPS; data/horário de emissão | Informações visíveis, geradas na emissão |
| Emitir como prestador, tomador ou intermediário | `issuerRole` |
| Município, inscrição municipal, CNPJ e razão social do emitente | Configuração/cadastro da unidade, somente leitura |
| Opção no Simples Nacional | `simpleNationalOption`; `FROM_ESTABLISHMENT` herda a configuração |
| Regime de apuração do Simples | `simpleNationalAssessment`; escolha explícita ou herança |
| Regime especial de tributação | Configuração da unidade, somente leitura |
| Localização do tomador/adquirente | `recipientLocation`: Brasil, Exterior ou não informado |
| CPF/CNPJ ou NIF, nome, indicador municipal, telefone e e-mail | Cadastro do parceiro selecionado na emissão, somente leitura |
| Informar endereço do tomador | `recipientIncludeAddress`; dados vindos do mesmo cadastro |
| Destinatário é o próprio adquirente? | `recipientIsDestination`, condicionado a IBS/CBS |
| Destinatário diferente | `destinationPartnerId`, parceiro fixo no pré-modelo |
| Localização do intermediário | `intermediaryLocation`: Brasil, Exterior ou não informado |
| Intermediário informado | `intermediaryPartnerId`, parceiro fixo no pré-modelo |

Endereços exibem os rótulos aplicáveis: CEP/município no Brasil ou país, cidade,
estado/província/região e código postal no exterior; bairro, logradouro, número e
complemento vêm do cadastro. A inscrição municipal da unidade é identificada por
esse nome; não se presume que outro dado seja o “Indicador Municipal” da captura.

Novos modelos iniciam com estratégias visíveis `ISSUE_DATE`, `AUTOMATIC`,
`PROVIDER`, Simples `FROM_ESTABLISHMENT`, tomador `BRASIL` sem endereço incluído,
destinatário ainda não escolhido e intermediário `NOT_INFORMED`. Isso não fixa
data, número, enquadramento tributário ou pessoa. Modelos legados permanecem
`null` até configuração explícita; a escolha IBS/CBS começa sem resposta.

Regras de `peopleOptions`:

- `FIXED_DATE` exige uma data de calendário válida; `ISSUE_DATE` exige data `null`.
- Com IBS/CBS e competência fixa, a data deve ser igual ou posterior a 01/01/2026,
  como mostra a captura `18.07.42` e o [guia oficial, seção 4.1.1](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf).
  É uma condição de preenchimento; não presume a obrigação tributária do emitente.
- `CUSTOM` exige série com 1 a 5 dígitos ASCII e valor de 1 a 49999;
  `AUTOMATIC` exige série `null`. O número da DPS não é configurável como constante.
- Simples `1` = não optante, `2` = MEI, `3` = ME/EPP. Opção `3` exige apuração
  não `null`, podendo herdar da unidade. Opções `1`/`2` exigem apuração `null`;
  `FROM_ESTABLISHMENT` com apuração `null` significa herdar na emissão.
- Apuração `1` = federais e ISSQN no Simples; `2` = federais no Simples e ISSQN
  pela legislação municipal; `3` = federais e ISSQN fora do Simples.
- Tomador `NOT_INFORMED` exige `recipientIncludeAddress = false`.
- Compra governamental = Sim exige tomador `BRASIL`, conforme o
  [guia oficial, seção 4.1.1, página 27](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf).
- Com IBS/CBS, a relação do destinatário é obrigatória: `true` dispensa outro
  parceiro; `false` exige `destinationPartnerId`. Sem IBS/CBS, relação e ID são `null`.
- Intermediário Brasil/Exterior exige ID fixo; não informado exige ID `null`.

As opções gerais da mesma etapa permanecem em `serviceOptions`:

| Campo da captura | Campo canônico | Condição |
| --- | --- | --- |
| Preencher as informações IBS/CBS? | `includeIbsCbs` | Escolha explícita Sim/Não |
| A operação se trata de uma compra governamental? | `governmentPurchase` | Habilitado no cenário IBS/CBS |
| Tipo de ente governamental | `governmentEntityType` | Exigido quando compra governamental = Sim |

`governmentEntityType` corresponde ao `tpEnteGov` do
[XSD oficial](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip),
para administração pública direta, autarquias e fundações:

| Código | Opção |
| --- | --- |
| `1` | União |
| `2` | Estado |
| `3` | Distrito Federal |
| `4` | Município |

O município mostrado nas capturas não é um padrão a aplicar. O tipo de ente não
deve ser inferido do nome, do CNPJ ou do endereço do tomador.

## Etapa 2: Serviço

| Campo | Formato/limite |
| --- | --- |
| País da prestação | `serviceOptions.countryCode`, ISO3 válido no catálogo |
| Município da prestação | `serviceOptions.municipalityCode`, IBGE válido e ativo |
| Código de Tributação Nacional | `nationalServiceCode`, 6 dígitos, catálogo oficial |
| Imunidade/exportação/não incidência do ISSQN? | `issTreatment` existente, escolha explícita |
| Tipo de imunidade | `immunityType` existente, códigos `1` a `5` |
| País em que se verificou o resultado do serviço | `serviceOptions.exportResultCountryCode`, ISO3 |
| Item da NBS | `nbsCode`, 9 dígitos, catálogo oficial |
| Código indicador da operação | `operationIndicatorCode`, 6 dígitos, catálogo oficial |
| Descrição do Serviço/Fornecimento | `serviceDescription`, obrigatória, até **2000** caracteres |
| Tipo de operação | `serviceOptions.operationType`, distinto do indicador da operação |
| Documento de responsabilidade técnica | `technicalResponsibilityDocument`, até 40 caracteres |
| Documento de referência | `referenceDocument`, até 255 caracteres |
| Informações complementares | `complementaryInfo`, até **2000** caracteres |
| Pedido/ordem de compra/serviço/projeto B2B | `orderReference`, até 60 caracteres |

Os limites de texto constam dos tipos do
[XSD oficial](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip).
Os limites de 2000 devem valer no editor, parser, preview e banco. Qualquer
expansão de marcador na descrição também deve respeitar o limite final.
Catálogos comprovam códigos e descrições; não determinam automaticamente o
enquadramento fiscal nem a correspondência entre serviço, NBS e indicador.

`operationType` corresponde ao `tpOper` do
[XSD oficial](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip):

| Código | Opção |
| --- | --- |
| `1` | Fornecimento com pagamento posterior |
| `2` | Recebimento do pagamento com fornecimento já realizado |
| `3` | Fornecimento com pagamento já realizado |
| `4` | Recebimento do pagamento com fornecimento posterior |
| `5` | Fornecimento e recebimento do pagamento concomitantes |

## Condicionais e validação

As dependências fiscais seguem o [guia oficial, seção 4.1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf).
A normalização ISO3 e os campos inativos `null` são decisões do contrato interno.

- País `BRA` exige município ativo; outro país exige município `null`.
- `EXPORTACAO` exige país do resultado; nos demais tratamentos, esse país é `null`.
- `IMUNIDADE` exige tipo de imunidade; os outros tratamentos exigem tipo `null`.
- Não incidência não nasce de uma escolha no formulário: exige `990101` ou
  parametrização vigente do serviço no município competente. O pré-modelo não
  cria nem comprova essa condição municipal.
- Com `includeIbsCbs = false`, compra governamental, ente e tipo de operação são
  `null`, e `operationIndicatorCode` fica vazio.
- Com `includeIbsCbs = true`, o indicador da operação é obrigatório. Tipo de
  operação é obrigatório para compra governamental ou códigos nacionais com
  prefixos `2505`, `1509`, `1712` ou `1005`.
- Ente governamental só é informado quando compra governamental = Sim.
- Tipos de operação `2` e `3` exigem referências a NFS-e anteriores na emissão;
  chaves concretas não são cadastradas no pré-modelo.
- Município de prestação não é município de incidência. `cLocIncid` é resultado
  do provedor; não adicionar uma escolha livre de município tributário ao modelo.

As validações devem existir também no backend. Persistir um pré-modelo não
autoriza uma nota, não substitui a revisão fiscal e não amplia os cenários
suportados pelo executor. Valores, retenções, alíquotas e informações das etapas
3 e 4 não são configurados por este contrato.

## Fontes primárias e rastreabilidade

- [Guia oficial do Emissor Nacional Web, versão 1.2.1](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf):
  seção 4.1.1 (Pessoas) e 4.1.2 (Serviço); condicionais de exportação,
  não incidência, compra governamental e referências de tipo de operação.
- [Documentação oficial de homologação, atualizada em 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita):
  Anexos I, B e C para regras e catálogos.
- [Pacote XSD oficial de produção 1.01](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip):
  `TSRTCTpOper`, `TSRTCTpEnteGov`, `TSDesc2000`, `TSDescInfCompl`, `TSDRT` e
  `TCInfoCompl`; cópia original preservada em `schemas/1.01/` do provedor.
- Capturas fornecidas pelo usuário em 10/11/2026: `18.06.10` a `18.06.17`,
  `18.07.42`, `18.07.44`, `18.07.46`, `18.07.57` e `18.08.01` a `18.08.04`.
  Capturas de Valores não constituem especificação das partes 3 e 4 neste lote.
