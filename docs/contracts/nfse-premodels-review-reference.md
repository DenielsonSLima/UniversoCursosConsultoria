# NFS-e: referência da revisão e inventário da DPS

Conferência documental em 10/11/2026. Escopo: especificar pré-modelos e revisão
sem transmitir. Este inventário não altera SQL, habilitação fiscal ou executor.
Não contém dados de contribuintes, parceiros ou notas reais.

## Fontes e vigência

| Fonte primária | Localizador e uso |
| --- | --- |
| [Guia Web 1.2.1](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf) | Seção 4.1.1, pp.21–43: Pessoas; 4.1.2, pp.43–66: Serviço; 4.1.3, pp.66–84: Valores; 4.1.4, pp.84–86: revisão/Emitir; 4.1.5, pp.86–87: resultado |
| [Guia Web 1.3 de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf) | Versão de 31/10/2026, publicada na biblioteca atualizada em 04/11: Pessoas p.22; Serviço p.44; Valores p.67; revisão pp.85–87; resultado pp.87–88; representação pp.126–130 |
| [Anexo I de produção, 09/02/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx) | Abas de leiaute DPS/NFS-e, RN DPS/NFS-e e regras de incidência; a obrigatoriedade fiscal complementa a cardinalidade XSD |
| [XSD de produção 1.01, 09/02/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip) | `DPS_v1.01.xsd`, `NFSe_v1.01.xsd`, `tiposComplexos_v1.01.xsd` e `tiposSimples_v1.01.xsd`; árvore de referência abaixo |
| [Anexo I de homologação, 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/anexo_i-sefin_adn-dps_nfse-snnfse_prodrest-v1-01-20261020.xlsx) | Contrato de testes; não substituir silenciosamente o leiaute de produção |
| [XSD de homologação, 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip) | NT009/release em testes; diferenças expressas abaixo |
| [Comunicado CGNFS-e de 29/10/2026](https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009) | Situação dos ambientes e preenchimento IBS/CBS |
| [Biblioteca atual de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual), [biblioteca de testes](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita) | Publicação dos pacotes e anexos de domínio A, B e C; conferir atualização antes da implementação |

As páginas citadas são as páginas físicas do PDF, contando a capa. As páginas
84, 85 e 86 foram renderizadas e conferidas visualmente, além da extração textual.
O PDF completo possui 125 páginas, 6.746.277 bytes e SHA256
`f24c78595f3e87539b4eb8e17e48b636d148aeb18f57a6ac4ac2a841a78f1588`.

O Guia 1.3 também foi baixado integralmente: 130 páginas, 7.079.652 bytes, SHA256
`83feac65df5f2bf47511f2b654ec08aaf249ada9bfcb67568c436be36d222ffb`.
Suas pp.85–87 foram renderizadas: o texto da revisão é igual ao das pp.84–86
da 1.2.1 após normalizar espaços, e os blocos visuais se mantêm. O histórico da
1.3 registra alterações de GOV.BR e acréscimo de perfis/procurações, sem alteração
declarada da etapa 4. **A referência atual de produção é a 1.3**; isso não torna
seu guia uma prova de que o mesmo XSD esteja ativo nos dois ambientes.

O comunicado de 29/10 informa produção sob NT004, acrescida do domínio
`tpRetPisCofins` da NT007; produção restrita sob NT009 v1.0, release 1. Os
releases 1 a 3 estavam **previstos** para produção em 01/12/2026. Essa previsão
não comprova implantação futura. O ambiente de testes não produz efeito fiscal.
O ADN aceitar a ausência de IBS/CBS por flexibilidade técnica não afasta eventual
obrigação legal; preencher o grupo exige os códigos e participantes correlatos.
[Fonte: comunicado, itens 1, 2 e 4](https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009).

Para representação, o Guia 1.3 distingue procuração eletrônica NFS-e e vínculos
da base CNPJ, incluindo estabelecimentos de mesma raiz conforme permissões.
O acesso às APIs também depende das validações do certificado da conexão e da
assinatura. A simples seleção de uma filial no produto não prova esses poderes.
[Guia 1.3, seção 11, pp.126–130](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf#page=126).

## Etapa 4: comportamento e campos

A revisão reapresenta Pessoas, Serviço e Valores. Correções retornam às etapas
de origem por `Editar Pessoas`, `Editar Serviço` e `Editar Tributação`; os valores
da prévia não são parâmetros independentes. `Emitir NFS-e` envia a DPS à SEFIN.
Não há checkbox de aceite ou declaração adicional nas pp.85–87 da 1.3; a DPS é a
declaração revisada. Manifestação do tomador é outro fluxo, posterior à emissão.
[Guia 1.3, seções 4.1.4–4.1.5 e 6.4](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf#page=85).

Inventário dos blocos visíveis no exemplo documental, sem reproduzir seus dados:

| Bloco | Dados reapresentados ou calculados |
| --- | --- |
| Pessoas | Competência, escolha IBS/CBS, relação adquirente/destinatário; papel e identificação do emitente; identificação e endereço do tomador |
| Serviço | Classificação completa e descrição do catálogo, NBS, indicador da operação, local da prestação, local de incidência e descrição literal |
| Valores declarados | Valor da operação; tributação municipal, regime, suspensão, retenção, benefício e dedução; situação/retenção federal; CST e classificação IBS/CBS |
| Prévia municipal | Serviço, base, alíquota aplicada e ISSQN |
| Prévia federal | PIS e COFINS de apuração própria, IRRF, contribuições sociais e previdenciária retidas |
| Prévia líquida | Serviço, total retido e líquido |
| Prévia IBS/CBS | Base, totais IBS/CBS, parcelas estadual/municipal e alíquotas efetivas; explicação do enquadramento utilizado |

O exemplo do guia não esgota todos os ramos condicionais. Deve-se exibir também
intermediário, destinatário distinto e informações específicas quando presentes.
Os rótulos da tabela são agrupamentos de conferência; o contrato de cada valor
é o campo XML e sua regra no Anexo I, não a posição visual da captura.

## Origem e persistência no Universo

Esta separação é uma decisão de integração do produto, baseada na distinção
entre dados declarados e resultados da NFS-e no XSD; não é uma nova regra fiscal.

| Origem | Informação resolvida para o documento | O pré-modelo pode guardar |
| --- | --- | --- |
| Configuração/cadastro da unidade | Emitente, IM, município emissor, regimes com vigência, ambiente e representação comprovada | Regra de herança ou escolha explícita permitida; não certificado ou identidade copiada |
| Parceiro selecionado | Identificação, contato, endereço e condição Brasil/exterior do tomador | Estratégia de preenchimento; o parceiro da emissão é selecionado no preparo |
| Parceiros referenciados no modelo | Destinatário distinto e intermediário, ativos e autorizados no polo | ID; labels são somente apresentação |
| Modelo versionado | Regras de Pessoas, classificação e descrição do Serviço, opções fiscais reutilizáveis | Escolhas explícitas; os ramos de Valores dependem do contrato da etapa 3 |
| Recebimentos/serviço contratado | Composição financeira e valor autorizado para aquele documento | Política de origem; nunca constante copiada de outra nota |
| Documentos da operação | Dedução, reembolso/repasse, referência anterior, processo ou substituição | Regra de exigência; chaves e fatos concretos são da emissão |
| Runtime/ledger | Ambiente, horário, versão do aplicativo, série/número únicos e `Id` da DPS | Regra de série; número e horário não são constantes reutilizáveis |
| Parametrização oficial vigente | Alíquota admitida, benefício, retenção, incidência e permissões do cenário | Política de consulta; evidência por município, serviço e competência |
| Cálculo prévio | Bases, impostos, retenções, líquido e cálculos IBS/CBS estimados | Regra de cálculo versionada; não um total fixo substituindo os fatos |
| Resposta autorizada SEFIN | Número/chave, processamento, municípios e cálculos oficiais da NFS-e | Nenhum resultado futuro; armazenar a resposta no documento emitido |

Recebimento não determina automaticamente competência, data de prestação,
tomador legal, enquadramento ou retenção. Valor recebido pode diferir de valor
do serviço. A revisão deve mostrar a origem e preservar o snapshot financeiro;
alteração de modelo, configuração, cadastro ou composição exige recalcular e
revalidar o documento. A interface não deve apresentar estimativa como autorização.

## Árvore canônica ampla: DPS de produção 09/02/2026

Inventário de caminhos do pacote oficial, para comparar cobertura das quatro
etapas. `?` significa opcional no XSD, `[]` repetição e `|` alternativa; regras
RN podem exigir campos opcionais conforme o cenário. A ordem do XML deve seguir
o schema. Os identificadores abaixo não são um payload preenchido.

```text
DPS[@versao]
  infDPS[@Id]
    tpAmb, dhEmi, verAplic, serie, nDPS, dCompet, tpEmit
    cMotivoEmisTI?, chNFSeRej?, cLocEmi
    subst? {chSubstda, cMotivo, xMotivo?}
    prest
      identificação: CNPJ | CPF | NIF | cNaoNIF
      CAEPF?, IM?, xNome?, end?, fone?, email?
      regTrib {opSimpNac, regApTribSN?, regEspTrib}
    toma?, interm? = Pessoa
      identificação: CNPJ | CPF | NIF | cNaoNIF
      CAEPF?, IM?, xNome, end?, fone?, email?
    serv
      locPrest {cLocPrestacao | cPaisPrestacao}
      cServ {cTribNac, cTribMun?, xDescServ, cNBS?, cIntContrib?}
      comExt?
        mdPrestacao, vincPrest, tpMoeda, vServMoeda
        mecAFComexP, mecAFComexT, movTempBens, nDI?, nRE?, mdic
      obra? {inscImobFisc?, (cObra | cCIB | end)}
      atvEvento? {xNome, dtIni, dtFim, (idAtvEvt | end)}
      infoCompl? {idDocTec?, docRef?, xPed?, gItemPed?, xInfComp?}
        gItemPed {xItemPed[1..99]}
    valores
      vServPrest {vReceb?, vServ}
      vDescCondIncond? {vDescIncond?, vDescCond?}
      vDedRed? = pDR | vDR | documentos.docDedRed[1..1000]
        documento: chNFSe | chNFe | NFSeMun | NFNFS | nDocFisc | nDoc
        tpDedRed, xDescOutDed?, dtEmiDoc
        vDedutivelRedutivel, vDeducaoReducao, fornec?
      trib
        tribMun
          tribISSQN, cPaisResult?, tpImunidade?
          exigSusp? {tpSusp, nProcesso}
          BM? {nBM, (vRedBCBM | pRedBCBM)?}
          tpRetISSQN, pAliq?
        tribFed?
          piscofins?
            CST, vBCPisCofins?, pAliqPis?, pAliqCofins?
            vPis?, vCofins?, tpRetPisCofins?
          vRetCP?, vRetIRRF?, vRetCSLL?
        totTrib = vTotTrib | pTotTrib | indTotTrib | pTotTribSN
          vTotTrib {vTotTribFed, vTotTribEst, vTotTribMun}
          pTotTrib {pTotTribFed, pTotTribEst, pTotTribMun}
    IBSCBS?
      finNFSe, indFinal?, cIndOp, tpOper?
      gRefNFSe? {refNFSe[1..99]}, tpEnteGov?, indDest
      dest? {identificação, xNome, end?, fone?, email?}
      imovel? {inscImobFisc?, (cCIB | end)}
      valores
        gReeRepRes? {documentos[1..1000]}
          dFeNacional | docFiscalOutro | docOutro
          fornec?, dtEmiDoc, dtCompDoc, tpReeRepRes
          xTpReeRepRes?, vlrReeRepRes
        trib.gIBSCBS
          CST, cClassTrib, cCredPres?
          gTribRegular? {CSTReg, cClassTribReg}
          gDif? {pDifUF, pDifMun, pDifCBS}
  ds:Signature?
```

Detalhes auxiliares, no mesmo XSD:

- `end`: alternativa nacional `endNac{cMun,CEP}` ou exterior
  `endExt{cPais,cEndPost,xCidade,xEstProvReg}`; logradouro, número, complemento
  opcional e bairro. País XML é ISO2, diferente do ISO3 do pré-modelo interno.
- `NFSeMun`: município, número e verificador da outra NFS-e;
  `NFNFS`: número, modelo e série. `fornec` usa a identificação de Pessoa.
- `dFeNacional`: tipo de chave, descrição condicional e chave;
  `docFiscalOutro`: município, número e descrição; `docOutro`: número e descrição.
- A opcionalidade de `ds:Signature` no arquivo não dispensa assinatura exigida
  pelo canal de integração. O mesmo cuidado vale para `toma`, NBS e endereço.

## Diferenças relevantes no XSD de homologação 20/10/2026

| Caminho/estrutura | Produção 09/02 | Homologação 20/10 |
| --- | --- | --- |
| Finalidade `finNFSe` | Em `infDPS.IBSCBS` | Em `infDPS`, obrigatório no XSD |
| Nome de `toma`/`interm` | `xNome` obrigatório | Opcional no XSD; RN ainda condiciona o envio |
| `serv.cServ` | Descrição antes de NBS/interno | NBS/interno antes da descrição; ordem XML mudou |
| Dedução/redução | `valores.vDedRed` | `valores.vAjusteBC`: percentual/valor de ajuste e documentos unificados |
| Documentos de ajuste | Campos próprios de dedução e grupo separado IBS | `docAjusteBC[1..1000]`: tipo, descrição, total, ajuste aplicado, datas, documento e fornecedor |
| `IBSCBS.cIndOp` | Obrigatório no XSD | Opcional no XSD; não implica dispensá-lo em todo cenário |
| Classificação IBS/CBS | `valores.trib.gIBSCBS.{CST,cClassTrib,...}` | `valores.trib.{CST,cClassTrib,gIBSCBS?...}` |
| Reembolso/repasse | `gReeRepRes` dentro de IBS/CBS | Retirado desse caminho; ajuste unificado em Valores |
| Imóvel | Inscrição + CIB ou endereço | Município; locação; unidades com CIB/endereço e ajustes específicos |
| Bens móveis | Sem esse ramo | `IBSCBS.bensMoveis[0..1000]`: NCM, descrição e quantidade |

O ramo de imóvel em testes inclui copropriedade, valor total, descontos,
vencimento original, unidades e ajustes de base. Esses fatos não podem ser
inventados por um modelo genérico de educação. Fonte: tipos
`TCInfDPS`, `TCInfoValores`, `TCRTCInfoIBSCBS`, `TCRTCInfoImovel` e
`TCRTCInfoTribIBSCBS` do [pacote oficial de homologação](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip).

## Saída calculada: NFS-e não é a DPS de entrada

No XSD de produção, `NFSe.infNFSe` acrescenta `nNFSe`, `cLocIncid`, `xLocIncid`,
descrições canônicas, status, processamento, emitente e a DPS incorporada.
`NFSe.infNFSe.valores` contém `vCalcDR`, `tpBM`, `vCalcBM`, `vBC`, `pAliqAplic`,
`vISSQN`, `vTotalRet` e `vLiq`; o pacote de testes usa `vCalcAjusteBCISSQN` no
lugar de `vCalcDR`. O grupo `NFSe.infNFSe.IBSCBS` tem incidência, redução,
bases, parcelas e totais calculados. Esses caminhos são resultados do provedor.
[Fonte: XSD de produção, tipos `TCInfNFSe`, `TCValoresNFSe`, `TCRTCIBSCBS`](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip).

Uma prévia local pode antecipar cálculos com regra identificada; o documento
autorizado e sua consulta devem prevalecer como prova do resultado. Não salvar
município de incidência ou ISS de uma nota histórica como valor fixo do modelo.

## Cobertura das quatro etapas e elegibilidade

| Etapa | Referência documental | Limite do pré-modelo |
| --- | --- | --- |
| 1 Pessoas | Guia 4.1.1 + tipos de identificação, endereço, regimes, destinatário | Estratégias e IDs; resolver cadastro e vigência no documento |
| 2 Serviço | Guia 4.1.2 + `TCServ` + Anexos B/C e domínios municipais | Classificações/opções reutilizáveis; exigir os fatos de cada ramo especial |
| 3 Valores | Guia 4.1.3 + `TCInfoValores` + IBS/CBS + RN | Políticas fiscais explícitas; valores/fatos/links concretos pertencem à operação |
| 4 Revisão | Guia 4.1.4 + entrada DPS e saída NFS-e | Consolidar, estimar e apontar pendências; nenhum parâmetro transmite por si só |

Guia, XSD e Anexos permitem especificar as quatro etapas sem esperar novas
fotos. **Não demonstram, sozinhos, todos os estados atuais da interface**: o guia
se apresenta como roteiro da maioria das informações (1.3 p.21; 1.2.1 p.20), e os pacotes de
ambientes distintos divergem. As capturas ajudam na fidelidade visual; regras,
cardinalidades e domínios vêm das fontes primárias. Uma matriz completa deve
cruzar cada ramo aplicável com as RN da edição escolhida e provar o fluxo em
homologação antes de alegar cobertura executável.

Na pesquisa pública não foi localizado repositório GitHub oficial verificável
do formulário completo. Código de integradores não foi promovido a contrato
fiscal; os schemas oficiais versionados no projeto são referência auditável.

Não se pode presumir a partir de um campo visível ou de XSD válido:

- Habilitação, convênio ativo, representação matriz/filial ou revogação do A1.
- Regime e sublimites do Simples, alíquota vigente ou obrigação IBS/CBS apenas
  pelo nome da empresa, código de serviço, competência ou seleção do formulário.
- Retenção, imunidade, benefício, exportação, dedução, crédito ou diferimento sem
  suporte no fato, enquadramento e parametrização competentes.
- Que uma escolha de destinatário/intermediário dispensa cadastro completo.
- Que referências anteriores, processo, construção, evento, imóvel, comércio
  exterior ou ajuste possam ser preenchidos com dados de outra operação.
- Que a ausência de rejeição técnica elimina obrigação tributária.
- Que pacote de testes, prévia calculada ou modelo salvo liberam produção.

O executor existente deve continuar limitado aos cenários comprovados. Este
documento inventaria cobertura; não ativa os novos ramos. A divergência do
pattern de série no XSD público e os demais critérios de produção permanecem
registrados em [nfse-homologation-readiness.md](nfse-homologation-readiness.md).
