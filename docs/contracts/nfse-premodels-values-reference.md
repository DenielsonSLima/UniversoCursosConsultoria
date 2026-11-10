# Pré-modelos NFS-e: referência completa de Valores

Pesquisa de contrato em 10/11/2026. Inventário para futura implementação da etapa 3,
sem alterar UI, banco, enquadramento da empresa ou emissão. O objetivo do produto
é resolver a nota a partir de parceiro + pré-modelo e das fontes financeiras
vinculadas, com valores fixos ou regras previamente configuradas.

## Fontes e perfis

- **G13:** [Guia Web 1.3, histórico de 31/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf),
  seção 4.1.3, pp. 67–85; versão atual ligada pela página de produção em 04/11/2026.
  PDF local conferido: 130 páginas, 7.079.652 bytes, SHA256
  `83feac65df5f2bf47511f2b654ec08aaf249ada9bfcb67568c436be36d222ffb`.
- **G12:** [Guia Web 1.2.1](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf),
  histórico 27/07/2026, seção 4.1.3, pp. 66–84. O texto completo da seção Valores
  é igual ao G13 após normalizar espaços: 18.535 caracteres em cada versão.
  As alterações declaradas em 1.3 tratam de acesso, perfis e procurações.
- **P:** [Anexo I de produção, 09/02/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx)
  e [XSD de produção 1.01](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip).
  Planilha original SHA256 `de 5bc492959eadc8bfa7540e16939995924f2188f743648eaf84d3b31e9eeb7c`.
- **H:** [Anexo I de homologação, 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/anexo_i-sefin_adn-dps_nfse-snnfse_prodrest-v1-01-20261020.xlsx)
  e [documentação/XSD de produção restrita](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita).
  Planilha original SHA256 `72b05981c8882cdd807f3acf901b669465360f9cf1b9d9e235ac4363dacfb2d8`.

O [comunicado oficial de 29/10/2026](https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009)
informa produção em NT004 com domínio `tpRetPisCofins` da NT007; homologação em
NT009 release 1. A previsão para releases 1–3 em produção é 01/12/2026, sujeita
ao cronograma formal. A string `versao="1.01"` não identifica sozinha o contrato.
Não serializar o formato H como se fosse P.

## Como usar o inventário

**M** = parâmetro/estratégia do pré-modelo. **N** = valor/evidência por nota,
resolvido automaticamente por fonte vinculada. **D** = derivado/retornado pelo
provedor; não é um valor fixo a repetir. A ocorrência XSD de um filho aplica-se
somente quando o respectivo grupo/opção estiver presente. Regras de negócio e
parametrização municipal podem exigir ou vedar grupos estruturalmente opcionais.

Proposta de produto, distinta de um domínio oficial XML: cada valor configurável
deve guardar uma origem explícita: valor fixo, percentual sobre base identificada,
soma de recebimentos selecionados, rateio de documento vinculado ou valor derivado
do perfil/município. “Não aplicável”, ausente e zero são estados diferentes.
Uma fonte ausente gera pendência específica; não vira zero ou tributação presumida.

Valores monetários usam decimal canônico, até 15 inteiros e 2 decimais no XML.
Percentuais variam por tipo XSD: `pAliq` usa `TSDec1V2`, PIS/COFINS e totais
aproximados `TSDec2V2`, reduções/diferimentos `TSDec3V2`. Validar também a RN:
o limite semântico não substitui o padrão lexical do XSD. Calcular com decimal,
sem ponto flutuante binário, e aplicar o arredondamento do perfil confirmado.

## Valores do fornecimento/serviço

G13 pp. 67–68; P/H `DPS/infDPS/valores`.

| Campo Web / XML | Ocorrência e condição | Origem |
| --- | --- | --- |
| Valor da operação/serviço / `vServPrest/vServ` | Obrigatório | M define fonte; N resolve montante |
| Valor recebido pelo intermediário / `vServPrest/vReceb` | Opcional no XSD; RN exige quando emitente é intermediário | M regra; N valor, não confundir com recebimento financeiro do prestador |
| Desconto incondicionado / `vDescCondIncond/vDescIncond` | Opcional; informado >0 e menor que `vServ` | M fixo/percentual/origem financeira; N montante |
| Desconto condicionado / `vDescCondIncond/vDescCond` | Opcional; informado >0 e menor que `vServ`; não reduz BC ISS | M regra e condição; N montante |

Não descontar novamente um abatimento já embutido no recebimento usado como
origem de `vServ`. A regra deve definir se sua base é valor bruto do serviço ou
valor efetivamente recebido. A soma de descontos, retenções e ajustes precisa
obedecer às RNs, sem produzir líquido/base negativos.

## Tributação municipal e ISSQN

G13 pp. 68–77; P/H `valores/trib/tribMun`. O município e a competência fazem parte
da validação das escolhas, não apenas da apresentação do formulário.

| Campo / XML | Opções e condição | Origem |
| --- | --- | --- |
| Tributação ISS / `tribISSQN` | `1` tributável; `2` imunidade; `3` exportação; `4` não incidência; obrigatório e derivado do Serviço | D de `issTreatment` |
| País do resultado / `cPaisResult` | ISO2; ramo exportação | M país do resultado, convertido do catálogo |
| Tipo de imunidade / `tpImunidade` | `1` a `5` para escolha atual; `0` apenas tipo não informado na origem | M da etapa Serviço; não escolher `0` para contornar revisão |
| Regime especial de tributação / `prest/regTrib/regEspTrib` | `0` nenhum; `1` ato cooperado; `2` estimativa; `3` microempresa municipal; `4` notário/registrador; `5` profissional autônomo; `6` sociedade de profissionais; `9` outros | M estratégia herdar configuração/revisão; válido no município |
| Exigibilidade suspensa? / presença `exigSusp` | Não/Sim; aplicável conforme tributação e regime | M escolha explícita |
| Tipo de suspensão / `exigSusp/tpSusp` | `1` decisão judicial; `2` processo administrativo; obrigatório no grupo | M fundamento |
| Processo / `exigSusp/nProcesso` | Obrigatório no grupo; até 30 caracteres conforme tipo XSD | M referência vigente ou N documento vinculado |
| Retenção ISS? / `tpRetISSQN` | `1` não retido; `2` tomador; `3` intermediário; obrigatório | M política condicionada às RNs/participantes |
| Incluir/editar tomador ou intermediário | Ações Web para suprir participante necessário à retenção | N por referências cadastrais da etapa Pessoas |
| Alíquota ISS / `pAliq` | Condicional; pode ser vedada, exigida ou fornecida pelo sistema | M fonte revisada; N/D conforme perfil |
| Benefício municipal? / presença `BM` | Não/Sim; Sim requer benefício municipal válido para serviço/contribuinte/competência | M política validada |
| Identificação do benefício / `BM/nBM` | Identificador parametrizado de 14 dígitos | M referência oficial, não texto livre inventado |
| Redução BM monetária / `BM/vRedBCBM` | Condicional ao benefício; alternativa à porcentagem | M regra; N valor |
| Redução BM percentual / `BM/pRedBCBM` | Condicional ao benefício; alternativa ao valor | M percentual permitido pelo município |
| BC ISSQN | Calculada após desconto incondicionado, ajustes e benefício aplicáveis | D |
| Alíquota efetivamente aplicada | Campo de conferência conforme parametrização/regime | D; não confundir com opção de informar `pAliq` |
| Valor ISSQN | Calculado sobre a BC pela alíquota aplicável | D |

Retenção exige o participante correspondente. Imunidade, exportação, não incidência,
MEI, certos regimes especiais e benefício de isenção podem vedá-la. Suspensão
também muda a disponibilidade da retenção. Não assumir retenção por ser pessoa
jurídica ou compra governamental: consultar as regras municipais aplicáveis.
O tipo especial e o benefício não podem ser criados por uma seleção no modelo.

### Recorte obrigatório: Simples `opSimpNac=3`, `regApTribSN=1`

As RNs E0621/E0625/E0628/E0631 de H distinguem retenção:

- ISS retido (`2`/`3`): `pAliq` exigida no ramo aplicável; mínimo citado 1,8%,
  teto geral 5%, sem benefício incompatível. A alíquota concreta depende da empresa.
- ISS não retido (`1`): `pAliq` vedada. Não preencher apenas porque existe uma
  alíquota em nota histórica; a aplicação municipal/SN é resolvida pelo sistema.
- RegAp `2`/`3` muda a regra: município conveniado ativo fornece a alíquota;
  fora desse cenário o emitente pode precisar informá-la (RNs E0635/E0640).
- G13 p. 77: quando os tributos federais são apurados no Simples, o Web apresenta
  esse grupo preenchido e bloqueado. Não oferecer alíquotas federais livres como
  padrão para esse cenário. Herança fiscal exige configuração confirmada.

A [RFB, em 14/08/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026),
distingue Emissor Nacional obrigatório para ME/EPP SN desde 01/11/2026 e efeitos
IBS/CBS no Simples a partir de 01/01/2027. Declarar IBS/CBS voluntariamente em
2026 exige completar o ramo técnico; ausência de rejeição técnica no ADN não
constitui aprovação fiscal do enquadramento.

## Dedução/redução e documentos: produção P

G13 pp. 72–76; P `valores/vDedRed`. M guarda modo/critério; N resolve documentos e
valores da operação. Alternativas do grupo: percentual, valor monetário ou
documentos. A lista documental comporta 1–1000 itens quando utilizada.

| Campo / ramo | Formato e condição | M/N |
| --- | --- | --- |
| Há dedução/redução? | Não/Sim; no Sim selecionar modo monetário, percentual ou documental | M |
| `pDR` | Percentual do modo escolhido; RN e limites municipais | M |
| `vDR` | Montante do modo escolhido; menor que serviço, com restrições legais | M regra / N montante |
| Documento `chNFSe` | Chave NFS-e nacional de 50 dígitos | N referência validada |
| Documento `chNFe` | Chave NF-e de 44 dígitos | N referência validada |
| Documento `NFSeMun` | `cMunNFSeMun` IBGE de 7 dígitos; `nNFSeMun` até 15 dígitos; `cVerifNFSeMun` até 9 caracteres | N |
| Documento `NFNFS` | `nNFS` até 7 dígitos; `modNFS` até 15; `serieNFS` até 9 caracteres | N |
| Outro documento fiscal / `nDocFisc` | Identificador até 255 caracteres | N |
| Documento não fiscal / `nDoc` | Identificador até 255 caracteres | N |
| Tipo da dedução / `tpDedRed` | Domínio abaixo, obrigatório no item | M categoria; N confirma vínculo |
| Descrição de outras / `xDescOutDed` | Até 150 caracteres, condicional a outras deduções | M texto/regra ou N evidência |
| Data de emissão / `dtEmiDoc` | Data ISO, obrigatória no item | N |
| Valor apto / `vDedutivelRedutivel` | Valor do documento passível de dedução | N |
| Valor utilizado / `vDeducaoReducao` | Parcela aplicada à nota; não exceder apto/serviço | M rateio / N parcela |
| Identificar fornecedor / `fornec` | Opcional; cadastro Brasil/Exterior conforme ramo | M referência cadastral / N dados atuais |

`tpDedRed`: `01` alimentação/bebidas/frigobar; `02` materiais; `03` produção externa;
`04` reembolso de despesas; `05` repasse consorciado; `06` repasse plano de saúde;
`07` serviços; `08` subempreitada de mão de obra; `99` outras deduções.

O fornecedor documental pode exigir uma alternativa de identificação: CNPJ de 14 dígitos,
CPF de 11 dígitos, NIF até 40 ou `cNaoNIF` (`0` não informado na origem, `1` dispensado,
`2` não exigido); nome até 150. Para a dedução P há CAEPF de 14 dígitos/IM até 15 opcionais.
Endereço opcional, com escolha nacional (município IBGE de 7 dígitos, CEP de 8 dígitos) ou exterior
(país ISO2, código postal até 11, cidade/região até 60); logradouro até 255, número
até 60, complemento até 156, bairro até 60; telefone de 6–20 caracteres e e-mail até 80 opcionais.
Esses dados são resolvidos de um cadastro/documento, sem cópia de identidade no modelo.

Dedução não é desconto comercial. O guia alerta para a carga mínima ISS de 2%,
com exceções legais; o Anexo contém a lista de códigos e RNs correspondentes.
Não transformar essa lista em permissão geral de reduzir base.

## Ajustes documentais: homologação H / NT009

H, planilha LEIAUTE linhas 256–298 e RNs E0462/E0467/E0469:
`valores/vAjusteBC` substitui a estrutura anterior e reúne ajustes ISS/IBS/CBS.

| Campo | Formato/condição | M/N |
| --- | --- | --- |
| `pAjusteBCISSQN` ou `vAjusteBCISSQN` | Escolha percentual/monetária, opcional; respeitar RN e piso efetivo | M regra / N valor |
| `documentos/docAjusteBC` | 1–1000 documentos quando presente | N resolução vinculada |
| `tpAjusteBC` | Obrigatório; domínio abaixo | M categoria |
| `xTpAjusteBC` | Até 150; condicional aos tipos `99`/`199` | M/N |
| `vTotDoc`, `vAjusteAplic` | Ambos obrigatórios; aplicado ≤documento e ≤serviço | N; M define rateio |
| `dtEmiDoc`, `dtCompDoc` | Datas ISO opcionais no XSD, sujeitas às RNs do ramo | N |
| `dFeNacional` | Escolha documento do repositório: `tipoChaveDFe`, `xTipoChaveDFe` condicional, `chaveDFe` | N |
| `docFiscalOutro` | Escolha fora do repositório: IBGE de 7 dígitos `cMunDocFiscal`, `nDocFiscal` e `xDocFiscal` até 255 | N |
| `docOutro` | Escolha não fiscal: `nDoc` e `xDoc` até 255 | N |
| `fornec` | Opcional; identificação/endereço/contatos conforme `TCInfoPessoa` H | M referência / N dados |

`tpAjusteBC`: `2` materiais; `5` consorciado; `6` plano de saúde; `7` serviços;
`8` subempreitada; `9` profissional parceiro; `99` outras deduções ISS;
`101` intermediação imobiliária; `102` turismo; `103` produção publicitária;
`104` mídia; `105` glosa de saúde; `199` outros reembolsos/ressarcimentos.

`tipoChaveDFe`: `1` NFS-e; `2` NF-e; `3` CT-e; `9` outro. Descrição do outro
até 255, chave até 50, validada segundo o documento. O tipo não dispensa verificar
a existência, titularidade/vínculo e parcela disponível para alocação.
Não combinar ajuste percentual/monetário ISS com documentos de ajuste ISS
dos tipos `2,5,6,7,8,9,99` (RN E0462). A unificação não autoriza contar a mesma
parcela duas vezes em bases diferentes.

## Tributação federal

G13 pp. 77–78; P/H `valores/trib/tribFed`.

| Campo XML | Obrigatoriedade/condição | Origem |
| --- | --- | --- |
| `piscofins/CST` | Obrigatório se grupo PIS/COFINS informado; domínio de 2 dígitos abaixo | M classificação confirmada ou herança do regime |
| `vBCPisCofins` | Condicional ao CST/RN; ≤valor do serviço | M regra / N base |
| `pAliqPis`, `pAliqCofins` | Condicionais; alíquotas de apuração própria | M fontes confirmadas, sem percentuais presumidos |
| `vPis`, `vCofins` | Condicionais; compatíveis com base × alíquota | D/N, verificar cálculo |
| `tpRetPisCofins` | Tipo de retenção; condicional no XML, Web pede escolha no ramo | M política e regra aplicável |
| `vRetCP` | Retenção previdenciária opcional; se informada >0 e <serviço | M regra / N montante |
| `vRetIRRF` | Opcional; se informado >0 e <serviço | M regra / N montante |
| `vRetCSLL` | Contribuições sociais retidas segundo domínio NT007; condicional ao tipo | M regra / N montante; nome histórico não implica CSLL isolada |

CST PIS/COFINS completo do XSD, sem confundir com CST IBS/CBS:

| Código | Situação |
| --- | --- |
| `00` | Nenhum |
| `01` | Tributável com alíquota básica |
| `02` | Tributável com alíquota diferenciada |
| `03` | Tributável por unidade de medida |
| `04` | Monofásica: revenda a alíquota zero |
| `05` | Substituição tributária |
| `06` | Alíquota zero |
| `07` | Isenta |
| `08` | Sem incidência |
| `09` | Suspensão |
| `49` | Outras saídas |
| `50` | Crédito: receita tributada no mercado interno |
| `51` | Crédito: receita não tributada no mercado interno |
| `52` | Crédito: exportação |
| `53` | Crédito: receitas tributadas e não tributadas internas |
| `54` | Crédito: tributadas internas e exportação |
| `55` | Crédito: não tributadas internas e exportação |
| `56` | Crédito: tributadas/não tributadas internas e exportação |
| `60` | Presumido: receita tributada interna |
| `61` | Presumido: receita não tributada interna |
| `62` | Presumido: exportação |
| `63` | Presumido: tributadas e não tributadas internas |
| `64` | Presumido: tributadas internas e exportação |
| `65` | Presumido: não tributadas internas e exportação |
| `66` | Presumido: tributadas/não tributadas internas e exportação |
| `67` | Outros créditos presumidos |
| `70` | Aquisição sem crédito |
| `71` | Aquisição com isenção |
| `72` | Aquisição com suspensão |
| `73` | Aquisição a alíquota zero |
| `74` | Aquisição sem incidência |
| `75` | Aquisição por substituição tributária |
| `98` | Outras entradas |
| `99` | Outras operações |

Domínio completo de `tpRetPisCofins` (NT007, presente nos XSD consultados):

| Código | Retenção |
| --- | --- |
| `0` | PIS/COFINS/CSLL não retidos |
| `1` | PIS/COFINS retidos, domínio legado sem discriminar CSLL |
| `2` | PIS/COFINS não retidos, domínio legado sem discriminar CSLL |
| `3` | PIS/COFINS/CSLL retidos |
| `4` | PIS/COFINS retidos; CSLL não |
| `5` | PIS retido; COFINS/CSLL não |
| `6` | COFINS retida; PIS/CSLL não |
| `7` | PIS não; COFINS/CSLL retidas |
| `8` | PIS/COFINS não; CSLL retida |
| `9` | COFINS não; PIS/CSLL retidos |

Não subtrair PIS/COFINS duas vezes quando a composição de contribuições retidas
já estiver representada em `vRetCSLL`. As RNs e o retorno do perfil devem
determinar a composição. Os códigos não provam incidência legal para a empresa.

## IBS/CBS: classificação, tributação regular e diferimento

G13 pp. 79–82; Anexos P/H. Com o grupo IBS/CBS informado, completar seus campos
dependentes. Sem o grupo, não preencher classificações avulsas. O comunicado de
29/10 distingue recepção técnica flexível de obrigação fiscal.

| Campo | Formato e condição | Origem |
| --- | --- | --- |
| `CST` |3 dígitos; obrigatório no grupo tributário | M classificação confirmada |
| `cClassTrib` |6 dígitos; obrigatório; pertence ao CST e precisa suportar NFS-e | M catálogo vigente |
| `cCredPres` |2 dígitos; somente se classificação permitir | M opção confirmada/por vigência |
| `gTribRegular/CSTReg` |3 dígitos; obrigatório quando grupo regular exigido | M classificação regular |
| `gTribRegular/cClassTribReg` |6 dígitos; obrigatório no grupo e compatível com CSTReg | M catálogo vigente |
| `gDif/pDifUF` |Percentual; obrigatório quando `gDif` exigido | M percentual fundamentado |
| `gDif/pDifMun` |Percentual; obrigatório no mesmo grupo | M |
| `gDif/pDifCBS` |Percentual; obrigatório no mesmo grupo | M |

RNs E0958/E0959/E0960–E0972: usar a classificação e seus indicadores para exigir
ou vedar `gIBSCBS`, tributação regular, crédito presumido e diferimento.
Não criar switches independentes capazes de contradizer o catálogo.
Em P, CST/cClassTrib ficam dentro de `IBSCBS/valores/trib/gIBSCBS`; em H ficam
diretamente em `IBSCBS/valores/trib`, e o `gIBSCBS` adicional é condicional.

O [catálogo oficial SVRS](https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria)
consultado em 10/11/2026, filtrado por `IndNfse=true` e vigência nessa data,
retornou 12 CSTs/73 cClassTrib. Domínio de CST encontrado nesse recorte:
`000` integral; `010` uniforme; `011` uniforme reduzida; `200` reduzida;
`221` fixa proporcional; `400` isenção; `410` imunidade/não incidência;
`515` diferimento com redução; `550` suspensão; `800` transferência de crédito;
`811` ajustes; `820` tributação em documento específico.
Isso é um pré-filtro público do catálogo, não prova de que o perfil/Calculadora
Nacional implantado aceita todo código. Validar suporte NFS-e, vigência e flags
no perfil efetivo, preservando a referência da tabela utilizada.

A [tabela oficial de crédito presumido](https://dfe-portal.svrs.rs.gov.br/CFF/TabelaCreditoPresumido)
também contém indicadores de documento e datas por tributo. Os itens 1/2 marcados
para NFS-e tratam de produtor rural e transportador autônomo, com início indicado
em 01/01/2027; não são escolhas genéricas de uma prestação educacional em 2026.
Não aplicar CST, cClassTrib, redução ou crédito por nome/CNAE/NBS isoladamente.

### Reembolso, repasse e ressarcimento no perfil P

P `IBSCBS/valores/gReeRepRes/documentos`, até 1000 itens. São evidências N;
o modelo pode guardar categoria, origem documental e regra de alocação.

- Escolha `dFeNacional`: `tipoChaveDFe` (`1` NFS-e, `2` NF-e, `3` CT-e, `9` outro),
  `xTipoChaveDFe` até 255 quando aplicável e `chaveDFe` até 50.
- Ou `docFiscalOutro`: município IBGE de 7 dígitos, `nDocFiscal`/`xDocFiscal` até 255.
- Ou `docOutro`: `nDoc`/`xDoc` até 255.
- `fornec` opcional: identificação reduzida CNPJ/CPF/NIF/motivo sem NIF e nome;
  datas `dtEmiDoc` e `dtCompDoc`, tipo `tpReeRepRes`, descrição condicional
  `xTpReeRepRes` até 150 e montante `vlrReeRepRes` são os demais campos do item.
- `tpReeRepRes`: `01` intermediação de imóveis; `02` turismo; `03` produção
  publicitária; `04` mídia; `99` outros reembolsos/ressarcimentos.
- Em H esses fatos são representados por documentos de `vAjusteBC`; não enviar
  também `gReeRepRes`. Confirmar a correspondência de categorias, sem troca cega.

### Ramos monetários adicionais H / NT009

Não aparecem como novos campos livres de Valores no G13. Para locação/cessão/
arrendamento de imóveis, H inclui `imovel/gLocacao/pCopropriedade`, `vTotOper`,
`vDescIncondTot`, `vDescCondTot`; e por unidade imobiliária,
`gAjusteBCLocImoveis/tpAjusteBCLocImoveis`, descrição condicional e
`vAjusteBCLocImoveis`. Tipos: `01` tributos, `02` emolumentos, `03` condomínio,
`04` redutor social, `99` outras parcelas, com restrições por NBS.
O total não é o valor proporcional do coproprietário; `vServ` e descontos são
calculados pelo percentual. Casos 99.02–99.04 são apenas API-HOMO conforme o
comunicado 29/10. Não extrapolar essas fórmulas ao serviço educacional.

## Valor aproximado dos tributos

G13 pp. 82–84; P/H `valores/trib/totTrib`. Escolher exatamente um ramo XML:

| Modo do pré-modelo | Campos obrigatórios dentro do ramo | Origem |
| --- | --- | --- |
| Valores monetários | `vTotTrib/vTotTribFed`, `vTotTribEst`, `vTotTribMun` | M regra/fixos; N montantes |
| Percentuais | `pTotTrib/pTotTribFed`, `pTotTribEst`, `pTotTribMun` | M percentuais fundamentados |
| Alíquota do Simples | `pTotTribSN` | M fonte/alíquota nominal aplicável ao emitente |
| Não informar estimativa, quando permitido | `indTotTrib=0` | M escolha validada pelo regime; não zero monetário |

RNs E0702–E0713: valores entre 0 e serviço; percentuais dentro das faixas previstas;
ME/EPP SN não pode informar `indTotTrib`. Não optante não pode usar `indTotTrib`
nem `pTotTribSN`. A alíquota nominal SN da transparência tributária não é a
alíquota ISS retido nem o percentual efetivo calculado para IBS/CBS.

## Resultados calculados e revisão

P/H geram BC ISS, alíquota aplicada, ISS, total retido e líquido. Em termos do
Anexo, líquido deduz descontos e retenções; ISS só entra como retenção quando
retido. O retorno autorizado é a autoridade documental; a prévia local precisa
ser comparada, sem alterar o XML retornado.

No grupo gerado IBS/CBS, são D: local de incidência, redutor governamental,
BC e ajustes calculados; alíquotas IBS-UF/IBS-Mun/CBS, reduções e alíquotas
efetivas; diferimentos e valores por tributo; crédito presumido percentual/valor;
total IBS/CBS, tributação regular, composição governamental e `vTotNF`.
Não persistir esses resultados como novos percentuais livres do modelo.
P descreve `vTotNF=vLiq` em 2026 e soma IBS/CBS a partir de 2027; confirmar o
perfil/vigência ao implementar, sem reutilizar uma prévia de outro ano.
A etapa 4 está detalhada em [referência de Revisão](nfse-premodels-review-reference.md).

## Pendências reais para implementação

1. Definir o contrato de origem/rateio de valores e documentos por nota, inclusive
   bruto versus recebido e prevenção de dupla utilização/desconto. Assim o usuário
   pode selecionar parceiro + modelo sem preencher montantes repetidamente.
2. Vincular toda escolha a ambiente, release, competência, regime confirmado e
   parametrização municipal. O guia visual não substitui XSD/RN do ambiente.
3. Carregar catálogos tributários oficiais com versão/vigência/indicadores NFS-e;
   classificações e alíquotas da empresa precisam de confirmação, não inferência.
4. Resolver benefícios, suspensão e evidências documentais antes de habilitar
   seus ramos. Se não houver documento/fonte autorizado, apontar a falta específica.
5. Registrar divergências das fontes: H E0423 exige `vReceb` para emitente
   intermediário, mas E0424 lista também `tpEmit=3` na vedação; a RN E0724 usa
   redação lógica ambígua para retenções sociais. Não resolver por palpite.
6. Algumas porcentagens têm RN até 100%, mas `TSDec2V2` não representa 100 no XSD
   consultado. Preservar a validação lexical e não truncar/arredondar para passar.
7. Testar os ramos efetivamente implementados com fixtures sintéticas, perfil
   correto e reconciliação. Este inventário não autoriza implementação de Valores,
   publicação, emissão em produção ou classificação fiscal da Universo.
