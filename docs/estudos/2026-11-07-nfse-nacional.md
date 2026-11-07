# Emissor NFS-e — estudo local

Status: HISTÓRICO — levantamento de 07/11/2026 e proposta para implementação futura. Não descreve funcionalidade já entregue nem autoriza transmissão fiscal.

## Escopo desta etapa

Análise solicitada pelo usuário, com três agentes independentes: documentação oficial, projetos GitHub e integração no código local. Consolidação adicional dos contratos financeiros existentes. As capturas fornecidas orientam posição do menu e identidade visual; documentos externos são fontes técnicas, não instruções de operação.

Manifesto desta entrega: somente este estudo. Nenhuma alteração de aplicação, banco, credenciais, versão, lote ativo ou publicação. Não foram usados certificados, acessadas contas fiscais ou emitidas notas. GitHub consultado somente pelo MCP, para leitura de projetos públicos. O lote paralelo de compactação de Configurações permanece separado.

Classificação da futura implementação: mudança crítica por envolver financeiro, autorização, dados fiscais e segredos. Nesta etapa não houve patch que exigisse reprodução, smoke ou build.

## Organização solicitada

| Local | Organização proposta |
| --- | --- |
| Menu principal | Novo módulo **Emissor NFS-e**, imediatamente abaixo de Financeiro e antes de Patrimônio. |
| Configurações | Submódulo **NFS-e Portal Contribuinte**, acessível somente pela matriz, com permissão administrativa específica. |
| Configuração central | Abas para matriz e filiais já existentes em **Polos e Filiais**, aproveitando seus IDs e CNPJs. |
| Emissor | Abas **Preparar emissão**, **Pendentes**, **Emitidas**, **Erros** e **Modelos**. |
| Separação operacional | Polo → turma → aluno/matrícula → recebimentos vinculados. |

O módulo operacional deve respeitar o polo autorizado. A matriz poderá administrar outros estabelecimentos quando houver autorização no servidor. A capacidade de gerenciar credenciais não implica automaticamente capacidade de emitir, e vice-versa.

## Fontes oficiais e vigência

O [manual API v1.2 enviado pelo usuário](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf) é a base de emissão e consulta. Ele permanece listado na [Documentação Atual de Produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual), atualizada em 04/11/2026, que também aponta o pacote base XSD/leiaute v1.01-20260209. A versão do manual não substitui a verificação das notas técnicas e implantações posteriores.

O [catálogo oficial enviado pelo usuário](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao) direciona aos serviços e ambientes. A [tabela detalhada](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao/apis-prod-restrita-e-producao) lista SEFIN, ADN contribuinte, parâmetros municipais, CNC e DANFSe. Os endereços devem ser confirmados nessa fonte na implementação; nenhum endpoint foi exercitado com credenciais neste estudo.

As [implantações oficiais](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes) registram desativação da API DANFSe ADN v1.0 em 03/08/2026. Também registram mudanças de CST/cClassTrib e vAjusteBC em 20/10/2026 na coluna de produção restrita. Não presumir igualdade de leiautes entre ambientes nem disponibilidade de um endpoint legado só porque ele aparece em exemplos ou bibliotecas.

A página [RTC](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc) adverte que a correlação experimental entre serviço, NBS, cClassTrib e cIndOp não fundamenta regras automáticas nos ambientes. Não usá-la para inventar enquadramento tributário dos cursos.

## Autenticação: portal e API

O [Guia Web v1.3, de 31/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf), documenta usuário/senha, certificado e GOV.BR no portal. A API utiliza certificado de conexão e assinaturas; senha do portal não basta para habilitar emissão automática. O capítulo de representação contempla procurações NFS-e e vínculos da base CNPJ, inclusive para APIs. Separar CNPJ emitente da identidade que o representa; não exigir um certificado exclusivo por filial sem avaliar esses mecanismos.

Esclarecimento de 07/11/2026: os estabelecimentos exibidos na captura compartilham a raiz CNPJ. O item 11.1.2 e a observação final do capítulo 11 do mesmo guia preveem representação por essa relação também nas APIs. O certificado da matriz pode atender às filiais quando os vínculos e permissões forem reconhecidos. Proposta: cadastrar o certificado central uma vez e referenciá-lo nas configurações das filiais, com validação por CNPJ; não copiar o arquivo para cada aba. O certificado real e a habilitação fiscal ainda não foram testados.

Proposta de configuração por estabelecimento:

- Identificação fiscal: razão social, CNPJ, município/IBGE, inscrição municipal quando aplicável e parâmetros de regime validados.
- Vínculos: polos atendidos por aquele emitente, com identificação explícita do prestador fiscal.
- Portal: endereço oficial, modalidade de acesso e identificação do acesso. Se houver cadastro de senha, armazená-la como segredo no backend, sem devolvê-la em consultas.
- API: ambiente, referência de certificado/assinatura, representação, validade e resultado da verificação de poderes.
- Situação: **Portal configurado**, **API não validada**, **Homologação validada**, **Bloqueado** ou **Habilitado no ambiente**, com motivo e data da verificação.

Senhas, PFX, chaves privadas e senhas de certificados não pertencem ao código, localStorage, cache de consulta, logs ou documentação. A interface recebe apenas metadados e sinais de configuração depois do cadastro. Login do Universo e acesso ao portal fiscal são credenciais distintas.

Estar na matriz visualmente não concede autoridade fiscal. A verificação deve acontecer novamente no servidor para leitura, alteração de configuração, preparação e emissão.

## Polo operacional e estabelecimento fiscal

Achado local: `modules/gestor/configuracoes/polos/polos.service.ts` vincula novos polos à empresa matriz ativa pelo mesmo `company_id`, mantendo CNPJ e endereço no polo. Esse cadastro está adequado ao desenho informado pelo usuário. `company_id` identifica a empresa matriz à qual os polos pertencem; `polos.id` identifica cada unidade e `polos.cnpj` informa o CNPJ dessa unidade.

Esclarecimento do pedido: aproveitar **Configurações → Polos e Filiais** como fonte cadastral, sem exigir recadastro de CNPJ nem substituir o vínculo atual com a matriz. Por padrão, cada polo emitirá com seu próprio CNPJ cadastrado. A configuração NFS-e deve se vincular ao ID desse polo e acrescentar apenas os parâmetros fiscais, ambiente e referência de credencial necessários.

O contrato futuro deve separar:

| Identidade | Responsabilidade |
| --- | --- |
| `polo_origem_id` | Turma, matrícula, recebimento e visibilidade operacional. |
| `polo_emissor_id` (referência a `polos.id`) | Unidade emissora existente, cujo CNPJ é obtido de `polos.cnpj`; configuração fiscal vinculada, sem cadastro paralelo da empresa. |
| Identidade de representação | Certificado, responsável ou procurador autorizado para o emitente. |
| Vínculo polo–configuração NFS-e | Cada aba referencia o polo existente e a credencial habilitada para representá-lo. |

O CNPJ central que recebe boletos/Pix na integração bancária não determina automaticamente quem presta o serviço fiscalmente. Tampouco endereço ou CNPJ da matriz devem preencher silenciosamente um cadastro de filial incompleto.

Antes da habilitação de cada emitente, verificar uso efetivo dos Emissores Públicos, cadastro e parametrização pertinentes. Participar do ADN e usar o Emissor Nacional são opções distintas na [configuração municipal oficial](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-do-painel-administrativo-municipal-nfs-e-v1-2-out2025.pdf/@@download/file). A elegibilidade dos CNPJs do Universo não foi confirmada neste estudo.

## Fluxo proposto

1. Entrar no Emissor NFS-e com polo autorizado e mês atual sugerido.
2. Selecionar turma, aluno/matrícula e modelo compatível com o estabelecimento.
3. Buscar no backend os recebimentos confirmados do período e apresentar sua composição e origem.
4. Selecionar alunos individualmente, por turma ou por conjunto filtrado.
5. Revisar emitente, tomador, competência fiscal, descrição e valores; adicionar à aba **Pendentes** sem transmitir.
6. Em Pendentes, mostrar quantidade, total, modelo, bloqueios e detalhes de cada documento.
7. A ação **Emitir selecionadas** ou **Emitir todas aptas** inicia uma fila própria, processando todo o lote selecionado, com resultado individual e progresso.
8. Mover para **Emitidas** somente após confirmar autorização e identificação fiscal consistente. Mostrar falhas na aba **Erros**; manter respostas indefinidas em Pendentes com estado **Aguardando confirmação**.

Comportamento confirmado pelo usuário: o lote deve continuar processando as outras notas quando houver erro isolado. Exibir contadores de selecionadas, emitidas, com erro e aguardando confirmação. Cada erro deve identificar polo, turma, aluno/documento, código e mensagem retornados, motivo compreensível e ação disponível para correção. Após corrigir, permitir reprocessar os itens que falharam, preservando os já emitidos e consultando primeiro qualquer emissão de resultado incerto.

Agrupar a interface por turma não significa emitir uma nota única para toda a turma. A granularidade sugerida é aluno/matrícula, período, emitente e modelo compatível; o tomador e a possibilidade de agregação precisam de validação fiscal. Recebimentos de estabelecimentos distintos nunca são consolidados automaticamente em uma mesma nota.

Selecionar todos os resultados de uma turma deve abranger o conjunto autorizado no backend, inclusive outras páginas. O sistema deve informar o alcance da seleção. Trocar polo, período ou emitente invalida a seleção ainda não persistida e exige nova revisão.

## Mês atual e valor pago

A intenção operacional é sugerir os pagamentos efetivamente recebidos no mês atual, no fuso America/Maceio. Intervalo recomendado: início inclusivo do mês até início exclusivo do seguinte. Isso é um critério de busca proposto, não uma regra fiscal já aprovada.

A competência fiscal se refere à prestação do serviço e deve ser tratada separadamente da data de recebimento, conforme o [Guia Web oficial](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf). Exemplo: uma mensalidade antiga paga no mês atual pode entrar na busca de recebimentos sem adquirir automaticamente a competência fiscal desse mês.

Contratos locais úteis:

- `modules/gestor/financeiro/financeiro.types.ts`: recebível com `poloId`, `matriculaId`, `turmaId`, `clienteId`, `dataPagamento`, `valorPago`, status, composição e proveniência.
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`: leitura paginada por polo, turma, modalidade, período e agrupamento; não estabelece sozinho elegibilidade fiscal.
- `modules/gestor/caixa/report/caixa-report.service.ts`: RPC `get_caixa_relatorio_mensal_detalhado_secure`, com polo e competência.
- `modules/gestor/caixa/report/caixa-report.types.ts`: movimentos com pagamento, turma, pagador, composição e valor recebido, mas sem todas as identidades necessárias a um vínculo fiscal seguro.

O relatório do Caixa serve de referência para conferência, não como cadastro fiscal por nome. A implementação precisa de contrato específico, com IDs duráveis de aluno, matrícula, turma, recebimento e emitente. A análise não comprovou se os dados disponíveis resolvem pagamentos parciais ou múltiplos eventos de um mesmo título.

Cálculo, elegibilidade, agregação e saldo já faturado pertencem ao backend. Não usar valor nominal da mensalidade como substituto de pagamento confirmado, nem valor líquido após tarifa como substituto automático do valor do serviço. Juros, multa, desconto, estorno e divergência de composição exigem tratamento explícito. Valor recebido conhecido não elimina uma pendência sobre sua composição fiscal.

Antes de fechar a regra, definir com o responsável fiscal: competência, base tributável, tratamento dos encargos, notas anteriores, pagamentos parciais, responsável financeiro versus aluno e eventual agregação. A interface deve mostrar o valor recebido e o valor proposto para o serviço separadamente quando divergirem.

## Modelos

Modelos devem ser versionados por estabelecimento e conter descrição do serviço, variáveis permitidas, classificação e parâmetros tributários pertinentes. Exemplos de variáveis de descrição: curso, turma e período de prestação; não inserir dados pessoais desnecessários.

O modelo não deve conter uma senha nem um valor fixo de mensalidade. Ele orienta o preenchimento; o valor vem dos recebimentos elegíveis e das regras fiscais. O enquadramento de cada modalidade de curso, retenções e grupos ISS/IBS/CBS deve ser validado por regime e ambiente, sem inferência apenas pelo nome do curso.

Ao preparar o documento, guardar a versão do modelo e a configuração utilizada. Alterar um modelo não altera notas emitidas e deve sinalizar pendentes que precisem de nova revisão.

## Fila, transmissão e reconciliação

Segundo o [manual API do contribuinte](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf), `POST /nfse` recebe uma DPS e responde com emissão ou rejeição. `GET /nfse/{chaveAcesso}` consulta a nota; `GET /dps/{id}` recupera a chave e `HEAD /dps/{id}` verifica a geração. Assim, “emitir tudo” será uma ação do Universo sobre itens independentes, sem pressupor transação única da API.

Proposta de estados por item: **Pendente de revisão → Apto → Em processamento → Emitido**, com saídas **Rejeitado**, **Bloqueado** e **Aguardando confirmação**. Este último indica que pode ter havido autorização mesmo sem resposta recebida.

- Autorizar cada operação por usuário/contexto/polo/emitente antes de aceitar replay.
- Reservar identificador, série e número da DPS de maneira durável conforme o leiaute, separando ambiente e emitente.
- Persistir valores revisados, versão do modelo, origem e alocação dos recebimentos antes de transmitir.
- Evitar dupla seleção, concorrência de operadores e faturamento duplicado do mesmo recebimento/alocação.
- Em timeout, consultar a mesma DPS antes de reenviar. Não gerar nova numeração para contornar uma resposta incerta.
- Manter auditoria de tentativas e erros sanitizados. HTTP 2xx isolado não é prova suficiente de emissão.
- Preservar resultado individual se parte da fila falhar. Retomar após fechar a tela sem duplicar o que foi autorizado.
- Revalidar estornos ou alterações financeiras posteriores à preparação antes de transmitir.

Para consulta e sincronização de notas/eventos, o [manual ADN do contribuinte](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-apis-adn-sistema-nacional-nfse.pdf) descreve distribuição por NSU e consulta por CNPJ. Manter cursor por emitente, ambiente e contexto de autorização, sem misturar filiais.

XML autorizado e chave são evidências fiscais duráveis. A obtenção/exibição de DANFSe precisa de contrato atual confirmado; não reproduzir endpoint desativado nem presumir que uma renderização própria seja o documento oficial. Cancelamento e substituição precisam de análise específica futura e não estão implementados por esta proposta.

## Projetos GitHub examinados

Bibliotecas de terceiros são referências de implementação, não fontes de regra fiscal. Nenhum pacote foi instalado ou executado.

| Projeto | Evidência e avaliação |
| --- | --- |
| [brasil-fiscal/nfse](https://github.com/brasil-fiscal/nfse) | TypeScript, MIT, beta declarado. A1/PFX, mTLS, assinatura XML e GZip/Base64; emissão e consulta por DPS. Primeiro candidato para prova técnica em Node, condicionado à correção/validação dos pontos abaixo. |
| [nfse-nacional/nfse-php](https://github.com/nfse-nacional/nfse-php) | PHP, MIT, emissão, consulta, distribuição NSU e parâmetros municipais. Referência comparativa de contrato/reconciliação; exigiria runtime PHP se adotado. A organização não é uma fonte governamental. |
| [OpenAC-Net/OpenAC.Net.NFSe.Nacional](https://github.com/OpenAC-Net/OpenAC.Net.NFSe.Nacional) | C#, MIT, schemas e validação XSD, emissão/consulta/eventos. Alternativa de serviço fiscal dedicado; suporte A3 anunciado não comprova operação autônoma em servidor. |
| [kalmonv/node-sped-nfse](https://github.com/kalmonv/node-sped-nfse) | TypeScript, dependências nativas OpenSSL/LibXML. Não adotar como está: transporte desativa validação TLS do servidor e a licença precisa de esclarecimento. |

Achados concretos a preservar na futura avaliação:

- O [transporte do kalmonv](https://github.com/kalmonv/node-sped-nfse/blob/main/src/utils/tools.ts) usa `rejectUnauthorized: false`; isso não pode ser copiado para o Universo. A [licença](https://github.com/kalmonv/node-sped-nfse/blob/main/LICENSE.md) contém textos que exigem esclarecimento antes de incorporação.
- O [caso de emissão TypeScript](https://github.com/brasil-fiscal/nfse/blob/main/src/application/use-cases/EmitirNFSeUseCase.ts) trata 2xx como autorização mesmo sem garantir chave/XML. O adaptador precisa de validação de resposta mais forte.
- O [download de DANFSe desse projeto](https://github.com/brasil-fiscal/nfse/blob/main/src/application/use-cases/BaixarDanfseUseCase.ts) utiliza rota que precisa ser confrontada com a desativação oficial; não considerar a função validada pelo nome.
- O [retry PHP](https://github.com/nfse-nacional/nfse-php/blob/main/src/Http/Retry.php) e o [transporte .NET](https://github.com/OpenAC-Net/OpenAC.Net.NFSe.Nacional/blob/main/src/OpenAC.Net.NFSe.Nacional.Web/Transport/NFSeHttpClientRegistry.cs) fornecem referências para repetição de leituras e isolamento por certificado.

Proposta arquitetural: interface própria de provedor fiscal no backend, independente de biblioteca. O React envia intenção e exibe resultado. A compatibilidade de PFX, assinatura XML, mTLS e dependências com o runtime efetivo das Edge Functions ainda precisa de prova. Um serviço fiscal dedicado é alternativa a avaliar, sem escolha de infraestrutura nesta análise.

## Pontos locais de integração futura

| Arquivo | Ponto identificado |
| --- | --- |
| `modules/gestor/gestor-navigation.config.ts` | Ordem do novo item após Financeiro. |
| `modules/gestor/gestor-navigation.tsx` | Ícone e visibilidade; já restringe Configurações fora da matriz. |
| `modules/gestor/access-control.ts` | ID e permissões próprias do módulo fiscal. |
| `modules/gestor/components/GestorModuleContent.tsx` | Carregamento sob demanda e renderização do novo módulo. |
| `modules/gestor/configuracoes/ConfiguracoesPage.tsx` | Card e seção do Portal Contribuinte. |
| `modules/gestor/gestor.page.tsx` | Contexto efetivo de polo e proteção de navegação. |
| `modules/gestor/hooks/useGestorPolos.ts` | Resolução dos polos visíveis. |
| `modules/gestor/hooks/useGestorPoloTransition.tsx` | Limpeza/revisão ao trocar contexto. |
| `modules/login/portal-session.ts` | Contrato que exige revalidação de identidade/capacidade no servidor. |

Diretórios sugeridos, ainda não criados: `modules/gestor/emissor-nfse/` e `modules/gestor/configuracoes/nfse-portal-contribuinte/`. Manter componentes e contratos coesos com até 500 linhas por arquivo manual. As chaves de consulta precisam incluir escopo, contexto, período e emitente pertinentes.

Não foram encontradas integrações NFS-e nos pontos de navegação, Configurações e Financeiro examinados. Isso não equivale a uma auditoria de todo o repositório ou confirmação de estado remoto.

## Critérios da próxima etapa

Antes de implementar transmissão, resolver:

1. Reutilizar polos e CNPJs de **Polos e Filiais**, confirmando município, cadastro e habilitação fiscal de cada um no Emissor Nacional; não solicitar recadastro da estrutura já existente.
2. Credencial/representação válida para cada emitente, sem presumir certificado único por filial ou permissão irrestrita da matriz.
3. Regra de mês do pagamento versus competência da prestação, valor do serviço e tratamento de encargos/estornos.
4. Identidade do tomador quando aluno e pagador/responsável financeiro forem diferentes.
5. Granularidade da nota, pagamentos parciais, notas já emitidas fora do Universo e prevenção de duplicidade.
6. Modelos e parâmetros fiscais aprovados por estabelecimento/regime.
7. Runtime capaz de executar assinatura e mTLS com validação TLS, sem expor chaves ao navegador.

Sequência sugerida: protótipo local com dados sintéticos e sem transmissão; contratos de autorização e origem dos valores; prova em produção restrita; fila e reconciliação; emissão real somente em etapa explicitamente autorizada. O protótipo não foi iniciado nesta entrega.

Validação futura focada: acesso matriz/filial, isolamento por polo, troca de contexto, seleção entre páginas, mês/competência, tomador, parcial/estorno, modelo versionado, concorrência, timeout depois de autorização e retomada. Os Swaggers da SEFIN retornaram 502 durante a pesquisa do agente; limites, payloads e poderes reais não foram comprovados por execução. Não há smoke autenticado ou homologação fiscal concluída.
