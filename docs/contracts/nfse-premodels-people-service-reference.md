# Pré-modelos: referência completa de Pessoas e Serviço

Auditoria de 10/11/2026. Inventário das etapas 1/2 da emissão completa, comparado
com o código atual; não é declaração de suporte a todos os cenários, emissão
autorizada ou prontidão de produção. O contrato implementado em
[nfse-premodels-stage12.md](nfse-premodels-stage12.md) cobre um subconjunto deste
inventário. Valores e revisão pertencem aos contratos específicos das etapas 3/4.

## Fontes e limites de versão

1. [Guia oficial Web 1.2.1](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf),
   PDF de 125 páginas: seção 4.1.1, páginas 21–42, e seção 4.1.2, páginas 43–65;
   página 66 inicia Valores. Nome do arquivo identifica 1.2.1; histórico interno
   registra 1.2 em 27/07/2026. Texto completo dessas páginas extraído e tabelas
   de NIF/referências também conferidas renderizadas.
   SHA-256: `f24c78595f3e87539b4eb8e17e48b636d148aeb18f57a6ac4ac2a841a78f1588`.
2. [Anexo I de homologação, 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/anexo_i-sefin_adn-dps_nfse-snnfse_prodrest-v1-01-20261020.xlsx):
   abas `LEIAUTE DPS_NFS-e 1.01`, `RN DPS_NFS-e 1.01`,
   `MUN.INCID_INFO.SERV.` e `EXPORTACAO_EMISSÃO_NFS-e`.
   SHA-256: `72b05981c8882cdd807f3acf901b669465360f9cf1b9d9e235ac4363dacfb2d8`.
3. [XSD de homologação, 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip),
   tipos complexos e simples; cópias locais em
   `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/`.
4. A página de produção aponta atualmente para o [guia Web v1.3](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf).
   Comparação concluída: PDF de 130 páginas, histórico de 31/10/2026; Pessoas
   páginas 22–43, Serviço páginas 44–66 e Valores começa na 67.
   SHA-256: `83feac65df5f2bf47511f2b654ec08aaf249ada9bfcb67568c436be36d222ffb`.
   [Anexo I de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx)
   e [XSD de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip)
   são perfis distintos. O [comunicado oficial de 29/10/2026](https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009)
   identifica produção como NT 004/007 e NT 009 em produção restrita; não promover
   campos novos de homologação para produção sem seleção explícita do leiaute.
5. Anexos de domínio B e C disponíveis na [página oficial de documentação](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)
   fundamentam códigos nacionais, NBS e indicador de operação. Capturas do usuário
   `18.06.10`–`18.08.04` são evidência visual parcial, não inventário completo.

Foi pesquisado GitHub por publicações da Receita/Serpro e referências do portal
oficial. Não se identificou nessa busca um repositório oficial do emissor Web que
substitua guia/leiaute. SDKs comunitários encontrados não foram usados como regra.
O URL antigo `documentacao-em-homologacao` redirecionou para produção nesta consulta;
para homologação, usar a página `producao-restrita` e registrar a versão do artefato.

### Delta do guia 1.3 em relação ao 1.2.1

O texto completo entre os títulos 4.1.1 e 4.1.3 foi comparado após normalização
NFC e espaços: **45.344 caracteres idênticos**. Não houve acréscimo/remoção de
campos ou regras textuais das etapas Pessoas/Serviço; as páginas avançaram uma
posição. As tabelas/telas de NIF e referências também foram conferidas renderizadas
nas duas versões. As referências de página abaixo seguem 1.2.1; em 1.3 somar 1.

O histórico 1.3 acrescenta alternância de perfis/procurações e altera acesso GOV.BR;
isso não preenche as lacunas fiscais identificadas aqui. Para o produto, a origem
de parâmetros continua sendo cadastro, leiaute e ambiente selecionados, não a
mera disponibilidade de um perfil de acesso ao portal.

## Regra de origem dos dados

Legenda: **M** = preferência reutilizável no modelo; **C** = cadastro autorizado
consultado por ID; **E** = valor concreto de cada emissão; **P** = resultado ou
regra do provedor. Um campo visível no portal não implica uma constante no modelo.

O modelo deve definir como obter o dado e guardar escolhas reutilizáveis. CPF/CNPJ,
NIF, nomes, contatos e endereços pertencem ao cadastro atual, sem cópia no modelo.
Datas de um evento, documentos de transação, chaves de notas e valores não podem
ser repetidos silenciosamente em todas as notas. Podem ser resolvidos por vínculo
cadastral ou exigidos na revisão, conforme cenário explicitamente suportado.

## Etapa 1: inventário e lacunas

| Grupo / campos | Origem | Situação atual e lacuna |
| --- | --- | --- |
| IBS/CBS; competência; série/número DPS | M + E | Flags e estratégias existem; número/data de emissão são informativos. A geração real ainda precisa aplicar as estratégias e garantir unicidade. |
| Papel do emitente | M | Existem as três opções. Falta distinguir opção cadastrada de capacidade efetivamente implementada. |
| Emitente: CPF/CNPJ, nome, município, IM, telefone, e-mail, CEP, logradouro, número, complemento, bairro | C | Wrapper consulta CNPJ/IBGE/IM/regimes. Razão social e endereço são placeholders; telefone/e-mail do emitente não são projetados no componente. |
| Opção Simples; apuração; regime especial | M + C | Herança/opções existem. A futura emissão deve confirmar enquadramento válido na competência, sem tomar a seleção como comprovação cadastral. |
| Compra governamental; ente | M | Implementados; governo força tomador Brasil na normalização central e na lista. |
| Tomador Brasil / Exterior / não informado | M + C | Opção existe; identidade vem do parceiro escolhido ao preparar a emissão. Falta projeção fiscal completa e validação de coerência entre opção e cadastro. |
| Tomador nacional: CPF/CNPJ, IM, nome, telefone, e-mail e endereço nacional | C | Rótulos existem como origem cadastral; o formulário de pré-modelo não consulta esses dados do futuro tomador. A emissão deverá resolver/validar o cadastro. |
| Tomador exterior: informar NIF ou justificar ausência; NIF; nome; contatos; endereço exterior | M + C | Só há localização e placeholder genérico NIF. Não há estratégia/campo de motivo de ausência nem DTO fiscal estrangeiro integrado. |
| Destinatário igual ao adquirente? | M | Implementado quando IBS/CBS está ativo; desligar IBS limpa relação/ID mesmo com Pessoas desmontada. |
| Destinatário diferente: Brasil/Exterior; identidade; contatos; endereço | M + C | ID fixo de parceiro existe. Não existe `destinationLocation` nem projeção de país/NIF que resolva esse ramo; detalhes são placeholders. |
| Intermediário Brasil / Exterior / não informado | M + C | Localização e ID fixo existem. Busca devolve apenas ID/label; não comprova localização nem resolve documentos/contatos/endereço. |
| Intermediário exterior: NIF ou motivo de ausência e endereço exterior | M + C | Mesmo déficit de representação do tomador exterior; selecionar Exterior não implementa o ramo. |

Campos de endereço nacional: CEP, município/IBGE, bairro, logradouro, número e
complemento. Exterior acrescenta país, cidade, estado/província/região e código
postal, além de bairro/logradouro/número/complemento. O complemento é opcional.
As escolhas `NIF` / `cNaoNIF` são alternativas, não documentos simultâneos.
Motivos `1`/`2` representam dispensa/não exigência; o valor `0` não deve ser oferecido
como atalho para emissão SEFIN: o Anexo I o reserva a situações de compartilhamento.
O leiaute também contempla `CAEPF` para prestador/tomador/intermediário quando
aplicável; é informação do cadastro, ausente da projeção fiscal atual, não uma
identidade a copiar para `peopleOptions`.

### Distinções que precisam permanecer visíveis

- O guia Web, página 24, descreve emissão disponível somente pelo prestador na
  versão documentada. O leiaute também contém `tpEmit=2/3`, motivo
  `cMotivoEmisTI` e prestador estrangeiro. Esses ramos requerem contrato e capacidade
  próprios; não se implementam apenas trocando o rótulo do emitente.
- Série Web automática: 70.000–79.999; transcrição Web: 80.000–89.999.
  Aplicativo próprio/API: 00001–49999, conforme regra E0010 do Anexo I.
  O intervalo atual 1–49999 é apropriado ao canal de integração; não reproduz a
  transcrição manual do portal. Não transformar número da DPS em constante do modelo.
- Competência fixa com IBS/CBS exige data a partir de 01/01/2026. A estratégia
  `ISSUE_DATE` é decisão do produto para reutilização; a competência deve corresponder
  ao fato real, não ao mês de pagamento nem automaticamente ao dia atual em todo caso.
- O código nacional pode exigir tomador para determinar incidência. A opção
  “não informado” precisa de validação cruzada, não apenas de ocultar campos.
- Regime cadastral, país e documento precisam ser resolvidos na emissão. Nenhum
  ID/label sozinho comprova a adequação de uma pessoa ao cenário estrangeiro/governo.

## Etapa 2: parte comum

| Campo / grupo | XML ou regra | Situação atual |
| --- | --- | --- |
| País/município da prestação | `locPrest/cPaisPrestacao` ou `cLocPrestacao` | ISO3/IBGE no modelo existem; falta conversão explícita ISO3→ISO2 no futuro payload do cenário real. |
| Código nacional | `cServ/cTribNac` | Catálogo implementado. |
| Complemento municipal | `cServ/cTribMun`, 3 dígitos | Ausente no estado, UI, serializer e SQL de pré-modelo; catálogo depende do município e o Anexo I não permite o campo para MEI. |
| NBS | `cServ/cNBS` | Catálogo implementado; não há enquadramento fiscal automático pela seleção. |
| Código interno do contribuinte | `cServ/cIntContrib`, até 20 | Existe no leiaute, não aparece na tabela comum do guia e está ausente do modelo. Avaliar estratégia/vínculo, não confundir com número DPS. |
| Descrição | `cServ/xDescServ` | Limite 2.000 alinhado em editor, prévia, parser e save. Fluxo de Serviços também foi alinhado. |
| Imunidade | tratamento + `tpImunidade` | Seleção e cinco tipos existem; a condição material ainda depende da revisão fiscal. |
| Exportação | `cPaisResult` e matriz de cenários | País do resultado existe; grupo `comExt` e motor de cenários não existem no pré-modelo. |
| Não incidência | código 990101 ou parametrização municipal | Modelo permite enum, sem consulta/validação dessa habilitação municipal. Não comprova que a escolha é permitida. |
| Município de incidência | `cLocIncid` / P | Ausência de seletor livre é correta. Falta apresentar a determinação quando houver contrato de consulta/revisão completo. |
| Indicador da operação | `IBSCBS/cIndOp` | Catálogo/obrigatoriedade condicional implementados. |
| Tipo de operação | `IBSCBS/tpOper` | Cinco códigos implementados. Tipos 2/3 ainda não possuem resolução das notas referenciadas. |

A imunidade, exportação e não incidência alteram a etapa de Valores. A seleção
dessas opções não deve simplesmente zerar todos os tributos nem definir o município
de incidência no cliente. As combinações de país do tomador/intermediário/prestação,
código nacional e país do resultado seguem a aba `EXPORTACAO_EMISSÃO_NFS-e`.

Para locações/rodovias/águas marítimas, há localidades especiais e regras próprias
no Anexo I. O picker IBGE atual não cobre a localidade geral `0000000` ou trechos
de concessão. Esse déficit é de outros serviços, não do curso técnico usual.

## Etapa 2: ramos que faltam

| Ramo e ativação na referência | Campos exatos / alternativas | Reutilização e aplicabilidade |
| --- | --- | --- |
| Imóvel: indicadores 020101/020201/020301; obra prevalece em 07.02/07.05 | Guia: CIB ou endereço nacional/exterior, inscrição imobiliária fiscal. Endereço nacional deve corresponder ao município da prestação. | M: regra/vínculo de imóvel. C/E: imóvel efetivo. Não aplicável por padrão ao curso 080201. Grupo inteiro ausente. |
| Obra: subitens 07.02/07.05 | `obra/inscImobFisc`, alternativa `cObra` (CNO/CEI), `cCIB` ou `end`; endereço nacional/exterior conforme país. | M: estratégia/vínculo de obra. C/E: cadastro/local concreto. Grupo inteiro ausente; não reutilizar ART como substituto da obra. |
| Evento: subitens do item 12 | `atvEvento/xNome`, `dtIni`, `dtFim`, alternativa `idAtvEvt` ou `end`; endereço nacional/exterior. | M: regra/vínculo. E: evento, datas e endereço. Grupo inteiro ausente; curso técnico não vira evento apenas por ter turma/calendário. |
| Comércio exterior: matriz por tomador, intermediário, local e tratamento | `comExt/mdPrestacao`, `vincPrest`, `tpMoeda`, `vServMoeda`, `mecAFComexP`, `mecAFComexT`, `movTempBens`, `nDI`, `nRE`, `mdic` | M: modo, vínculo, moeda, mecanismos, compartilhamento e regra de origem. E: valor e documentos reais. Grupo inteiro ausente; pode aplicar a ensino internacional, não ao cenário doméstico presumido. |
| Operação 2/3 | `IBSCBS/gRefNFSe/refNFSe`, 1–99 referências | M: estratégia de localizar notas. E: chaves concretas. O modelo não deve replicar a mesma chave em emissões independentes. Resolução ausente. |
| Complementares | `infoCompl/idDocTec`, `docRef`, `xInfComp`, `xPed`, `gItemPed/xItemPed` (até 99 itens) | Quatro textos existem; lista de itens ausente. Documento de referência requer regra própria quando emitente for tomador/intermediário. |

Endereços de obra/evento/imóvel usam CEP ou o grupo exterior, acrescidos de
logradouro, número, complemento e bairro; o exterior inclui código postal,
cidade e estado/província/região. Grupos `choice` do XSD são alternativas: a lista
não significa exigir CIB, código e endereço simultaneamente.

Comércio exterior não é sinônimo de país da prestação estrangeiro. O grupo pode
ser exigido quando tomador ou intermediário estiver no exterior, mesmo com
prestação no Brasil. Não inferir exportação de ISS só por cliente estrangeiro.
As moedas e mecanismos exigem seus domínios oficiais completos, não listas curtas.

### Complementos do leiaute posterior ao guia Web

No perfil de homologação de 20/10/2026, inventariar ainda:

- `IBSCBS/indFinal`, indicador de uso/consumo pessoal, distinto da relação
  `indDest` entre tomador e destinatário. Não existe opção correspondente no modelo.
- `IBSCBS/imovel/cMun`, `gLocacao` e até 99 `gUnidImob`. A locação contém
  `pCopropriedade`, `vTotOper`, `vDescIncondTot`, `vDescCondTot`, `dVencOrig`.
  Unidade contém `inscImobFisc`, alternativa CIB/endereço e ajustes próprios.
  Valores/ajustes são detalhados na etapa 3. A estrutura não é idêntica à do guia
  anterior nem deve ser promovida automaticamente para o perfil de produção.
- `IBSCBS/bensMoveis` até 1000 grupos para `cTribNac=990401`, com `cNCMBemMovel`,
  `xNCMBemMovel`, `qtdNCMBemMovel`. Grupo ausente; ramo de locação, não de ensino.
- Motivo da emissão por tomador/intermediário, rejeição/substituição e finalidade
  do documento pertencem ao fluxo fiscal específico. Não são constantes genéricas
  de um modelo recorrente de curso.

Diferenças conferidas diretamente nas duas cópias XSD oficiais:

| Ponto | Produção 1.01 | Homologação 20/10/2026 |
| --- | --- | --- |
| Finalidade `finNFSe` | Dentro de `IBSCBS` | Diretamente em `infDPS` |
| Ordem do grupo `cServ` | Descrição antes de NBS/código interno | Descrição depois de NBS/código interno |
| Nome de `TCInfoPessoa` no schema | Ocorrência 1 | Ocorrência 0; RN continuam relevantes |
| Imóvel | Inscrição + alternativa CIB/endereço | Município + locação/unidades/ajustes |
| Bens móveis | Grupo ausente | Grupo de locação até 1000 ocorrências |

A planilha de homologação ainda apresenta caminho `IBSCBS/finNFSe`, divergente
do XSD homologação. Registrar o conflito e testar o perfil escolhido; não montar
um XML híbrido usando a posição da planilha de um ambiente e o schema do outro.

## Aplicabilidade ao curso técnico 080201

Na aba `MUN.INCID_INFO.SERV.`, linha 115, o código numérico `80201` corresponde ao
080201 e indica a regra geral do estabelecimento do prestador; a coluna de grupos
específicos não exige obra/evento. Isso não fixa alíquota, enquadramento ou retenção.

Para o cenário doméstico de ensino confirmado pelo usuário, as prioridades são:
cadastro íntegro do emitente e aluno/parceiro, local da prestação, classificação
080201/NBS confirmada, competência correta, Simples/apuração, totais e tributos da
etapa 3. Obra, imóvel, evento e comércio exterior devem ser ramos explícitos de outros
cenários, sem sobrecarregar nem ativar automaticamente o modelo educacional.

Imunidade, exportação, tomador/intermediário emitente, destinatário diferente e
compra governamental não estão confirmados para esse curso apenas por existirem
opções na UI. A implementação atual preserva essas escolhas como metadados; o
executor real deve recusar cenários ainda sem contrato completo.

## Lacunas ordenadas para implementação posterior

1. **Resolução fiscal de pessoas:** DTO de cadastro completo, nacional/exterior,
   NIF/motivo, contatos/endereço; localização do destinatário; coerência país/documento.
2. **Regras cruzadas:** tomador obrigatório por serviço; não incidência municipal;
   cenário de exportação/comex; capacidade por papel do emitente; referências de operação.
3. **Campos comuns omitidos:** complemento municipal e itens de pedido; decidir
   tratamento do código interno do contribuinte e sua origem.
4. **Ramos específicos:** imóvel, obra, evento, comex e locação de bens móveis,
   com fonte/vínculo dos dados concretos, seleção de leiaute e testes próprios.
5. **Aplicação na emissão:** o pré-cadastro sozinho não aplica as estratégias ao
   XML nem resolve datas/numeração/referências. O fluxo atual continua sem despacho
   real de notas da fila.

Não foram alterados UI, schema ou regras fiscais durante esta auditoria. O defeito
de labels longos encontrado na revisão anterior foi corrigido pela raiz com limite
de apresentação de 300 caracteres e preservação do ID; não é lacuna de campo fiscal.

## Validação e cobertura da entrega anterior

Antes desta auditoria: três smokes DOM (wizard, catálogo geográfico e seleção de
modelo com 2.000 caracteres em Serviços), 13 verificações dos contratos afetados,
ESLint focado e TypeScript com 49 arquivos raiz passaram. Esses resultados não
comprovam os ramos ausentes. A raiz confirmou também smoke Safari autenticado de
salvamento e reabertura de pré-modelo inativo, com os objetos conferidos no backend;
essa prova não constitui emissão fiscal.

`scripts/test-nfse-local-stage1.mjs` coleta recursivamente `*.test.ts`/`*.test.tsx`
do módulo. O workflow `nfse-regressions.yml` já coleta os novos testes SQL pelo glob
`supabase/tests/nfse*.isolated.test.mjs`. A raiz acrescentou o passo explícito
“Exercitar cadastro de pré-modelos sem transmissão” para os três novos smokes MJS,
reutilizando a instalação isolada de jsdom; não é necessário mudar o coletor TS.
