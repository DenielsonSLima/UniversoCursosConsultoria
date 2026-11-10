# NFS-e — evidências de prontidão e limites por ambiente

Conferência: 10/11/2026. Este registro consolida downloads públicos oficiais e testes
offline. Não houve uso do A1 em API de produção nem emissão de nota de produção nesta
conferência. Homologação e produção continuam sendo contratos separados.

## Integridade do pacote oficial de produção

A [documentação atual de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual),
atualizada em 04/11/2026, ainda aponta o
[ZIP XSD v1.01 de 09/02/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip).
Um novo download por HTTPS verificado retornou HTTP200, 65.640 bytes e SHA256:

```text
e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072
```

Os sete arquivos usados em `supabase/functions/_shared/nfse-national/schemas/1.01/`
coincidem byte a byte com `Schemas/1.01/` dentro desse novo ZIP, inclusive CRLF.
Arquivos de outras versões presentes no ZIP não foram usados nessa comparação.

| Arquivo | Bytes | SHA256 |
| --- | ---: | --- |
| DPS_v1.01.xsd | 691 | fe45e5250a48e519aba89fc6a472863b8e602ed957778fb64692804933a00d0c |
| NFSe_v1.01.xsd | 752 | af0bd2d8c50acba3d9c3f3f515426eca083b3f66e3211ce8dd48a7cf101818b8 |
| pedRegEvento_v1.01.xsd | 746 | e90b6816d29cca0bd5ed8f86ad98d3b7b0d8bbfc11a7583e6ff8f98170fd4009 |
| tiposComplexos_v1.01.xsd | 116856 | e8e09d525574cc224ca6d1f8d8eb0366043ab2a3aa8d0d234058e6244d60e371 |
| tiposEventos_v1.01.xsd | 31544 | 1b32bea21089dc232d78b62d805e9c07382f440d4e0ea2cb3fb6b82ebde68c11 |
| tiposSimples_v1.01.xsd | 70711 | 830ea116c34d7310699e34b214b7214a65f7e5d3b1f09aeaa702f7e3f4283b17 |
| xmldsig-core-schema.xsd | 10610 | 49848f732663aecb618d72ad6130c5c3240f0a10f3a1a8544b7d48a6c726046f |

Isso exclui corrupção local por importação ou escape JSON nesses sete arquivos. Nenhum
XSD oficial foi corrigido, normalizado ou substituído durante a conferência.

## Série DPS: divergência reproduzida na fonte original

O tipo `TSSerieDPS` do ZIP recém-baixado contém exatamente:

```xml
<xs:simpleType name="TSSerieDPS">
  <xs:restriction base="xs:string">
    <xs:maxLength value="5"/>
    <xs:pattern value="^0{0,4}\d{1,5}$"/>
    <xs:whiteSpace value="preserve"/>
  </xs:restriction>
</xs:simpleType>
```

O pattern possui um único byte de barra invertida antes de `d`.
Seus bytes hexadecimais são `5e307b302c347d5c647b312c357d24`.
O problema não é uma barra duplicada introduzida pelo JSON.

O [dialeto de regex de XML Schema](https://www.w3.org/TR/xmlschema-2/#regexs)
tem gramática própria e delimitação implícita; `^` e `$` externos não funcionam como
as âncoras de JavaScript/Perl. Nesta expressão são caracteres literais; `\d` é uma
classe de dígitos, não o texto literal barra-d. Essa distinção foi reproduzida com
`xmllint`/libxml2 2.9.13 contra os arquivos originais extraídos do novo ZIP:

| Conteúdo de `serie` no XML sintético | Resultado XSD |
| --- | --- |
| `1` | Rejeitado pelo pattern; saída3 |
| `00001` | Rejeitado pelo pattern; saída3 |
| `^1$` | Aceito; saída0, somente como controle offline |

O último valor não é uma série fiscal admissível e não pode ser transmitido.
O teste já versionado em [provider.test.ts](../../supabase/functions/_shared/nfse-national/provider.test.ts)
também preserva a reprovação da série numérica no pacote original de produção.

Conclusão delimitada: existe uma divergência entre o pacote público e a série numérica
esperada para DPS. Esta prova offline não estabelece qual schema a SEFIN usa internamente,
nem demonstra que a API de produção rejeitaria a mesma DPS. Não houve essa chamada.
Não se deve apresentar produção como pronta nem desativar a validação XSD para contornar
a divergência.

Uma eventual adaptação derivada exigirá decisão explícita, fontes oficiais intactas,
diff/hash do derivado, restrição mínima e testes positivos/negativos de todo o contrato,
além de prova integrada no ambiente autorizado. Outra saída é um pacote oficial corrigido
ou esclarecimento oficial verificável. Nenhuma dessas saídas está ativada por este registro.

## Serviço 080201 e NBS

Novo download do
[Anexo B oficial de 22/01/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx):
HTTP200, 85.008 bytes, SHA256
`e74b0be8ad204e458932efb1716225a3fb5703a84e5475ce5c4c6789d1c61b1a`.

- Aba `LISTA.SERV.NAC.`, linha194: código numérico Excel `80201`, representado no contrato
  nacional com seis dígitos como `080201`: “Instrução, treinamento, orientação pedagógica
  e educacional, avaliação de conhecimentos de qualquer natureza.”
- Aba `LISTA.NBS_v2.0`, linha1058: `1.2202.00.00`, transmitido como `122020000`:
  “Serviços de educação técnica de nível médio”.

As duas listas comprovam existência e descrição dos códigos. Elas não comprovam o
enquadramento de uma operação concreta, correlação obrigatória entre os dois códigos,
imunidade, retenção, alíquota ou habilitação do contribuinte. A escolha real deve permanecer
na revisão fiscal e no snapshot do documento; não deve ser inferida do nome da turma.

## Simples Nacional: tratar opSimpNac3 com sua vigência

`opSimpNac=3` identifica ME/EPP optante pelo Simples Nacional. Não é a opção1
de não optante mostrada nas capturas anteriores; o cenário confirmado na revisão
deve prevalecer, com a competência correspondente.

A [Receita Federal, em 14/08/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026),
distingue duas vigências: uso obrigatório do Emissor Nacional por ME/EPP optante a partir
de 01/11/2026 e efeitos das regras relativas a IBS/CBS para optantes a partir de 01/01/2027.
O [FAQ oficial v1.3 de 06/11/2026](https://www.gov.br/nfse/pt-br/perguntas-frequentes/perguntas-frequentes-nfs-e-v1-3-20261106.pdf),
seção20.4, confirma que são cronogramas distintos.

Portanto, não aplicar automaticamente a opSimpNac3 em 2026 o bloqueio IBS/CBS que seria
avaliado para um não optante. O preenchimento deve considerar regime, competência e
opção efetiva de recolhimento/destaque; isso não dispensa os demais dados fiscais.
A [orientação da RFB de 29/09/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade)
também separa a opção pelo Simples da opção de apuração regular de IBS/CBS para 2027.

Para ME/EPP com `regApTribSN=1`, o FAQ, seção20.2, explica a ausência de destaque do ISS
calculado nota a nota; não presumir esse valor de regime se ele não foi confirmado.
O teste técnico com omissão sintética de IBS/CBS não substitui essa revisão real.

## Critérios antes da liberação fiscal

1. Confirmar cadastro, representação, ambiente, município e parâmetros vigentes do serviço.
2. Conservar tomador legal, competência, prestação, códigos e regime no snapshot revisado.
3. Validar XML/assinatura/envelope contra o contrato do ambiente; reconciliar a mesma DPS
   após resultado incerto, sem reservar outra identidade para contornar a incerteza.
4. Obter autorização e consulta coerentes em homologação pelo canal autenticado aprovado.
5. Resolver a divergência documental de produção com evidência verificável e autorização
   do ambiente antes de qualquer transmissão real; preservar os artefatos originais.

Certificado cadastrado, handshake, parâmetros salvos e piloto técnico isolados não
constituem, individualmente, prova de que uma emissão real já esteja pronta.
