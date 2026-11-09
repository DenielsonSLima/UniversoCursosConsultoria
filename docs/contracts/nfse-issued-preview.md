# Prévia de notas emitidas

## Fluxo de interface

Cada nota na aba Emitidas possui um menu de três pontos com **Visualizar nota**, **Baixar PDF**
e **Baixar XML**. A seleção identifica o documento
emitido no contexto/polo/ambiente/mês corrente. O modal recupera seu XML pelo backend e gera o
DANFSe dentro do sistema; não existe seleção ou envio de arquivo do computador nesse fluxo.
Prévia, download e impressão reutilizam o mesmo Blob PDF nativo do compositor já existente.
O modelo atual de emissão não recompõe o conteúdo de uma nota antiga.

Fechar ou trocar o escopo remove o modal e cancela a leitura/projeção. A consulta TanStack
isola também documento, número e chave. Não há retry automático, persistência em localStorage,
consulta ao governo pelo navegador ou fallback para upload. O cache sem observadores é removido.
Erro de revalidação invalida a prévia, cancela impressão e bloqueia ações, mesmo que TanStack
ainda conserve dados anteriores. Durante uma nova leitura, as ações ficam desabilitadas.

## Download individual e em lote

XML é o conteúdo original validado pelo mesmo contrato de identidade/hash da prévia; não se
reconstrói nem se serializa outro XML. PDF usa o mesmo pipeline de assets/projeção/compositor
da prévia. Downloads não guardam arquivos no cache de consulta ou em localStorage.

Checkboxes individuais e seleção de todas **desta página** permitem ZIP de PDFs ou ZIP de XMLs.
Paginar ou alterar busca limpa a seleção. A montagem usa apenas as linhas selecionadas da
consulta atual sem erro e bloqueia ações durante nova leitura/download. Não há seleção global
implícita de outras páginas. Trocar contexto/polo/ambiente/mês ou perder acesso cancela o trabalho.

O ZIP contém um arquivo por nota, com nome baseado em número/chave, sem nomes de alunos.
Dois leitores concorrentes, máximo defensivo de 100 notas e 50 MiB descompactados; a interface
atual tem páginas de 25 linhas. Qualquer falha ou cancelamento interrompe o lote sem entregar
ZIP parcial. A tela informa progresso e oferece cancelar. JSZip só é carregado sob demanda.
URLs temporárias de download são revogadas após o período de leitura do Safari.

## Contrato de recuperação proposto

`get_nfse_authorized_xml_secure(p_context_key, p_polo_id, p_environment, p_month, p_document_id)`.
Deve devolver o envelope v1 com scope idêntico e os seguintes dados:

```text
documentId: identidade do documento no ledger fiscal
status: EMITIDA
number: número autorizado
accessKey: chave NFS-e com 50 dígitos
xml: XML original autorizado, UTF-8, até 2 MiB
sha256: hash hexadecimal minúsculo dos bytes UTF-8 do XML
```

O servidor deverá autorizar a sessão e o estabelecimento antes de obter o XML. O documento
deverá pertencer ao polo/ambiente/período autorizado; status e identidade virão do ledger
confirmado, nunca de campos fornecidos pelo cliente ou de uma preparação. O hash deverá
corresponder ao artefato imutável preservado na autorização. Não expor caminhos de Storage,
segredos, PFX, chave privada ou URLs arbitrárias. Uma assinatura válida sozinha não comprova
autorização fiscal. Estado indisponível deve falhar explicitamente.

O cliente compara envelope, documento, número, chave e hash antes de renderizar. O parser
também confere número/chave/ambiente dentro do XML e rejeita XML inseguro. O retorno projetado
mantém os campos necessários para a apresentação; XML bruto e propriedades extras da resposta
não são conservados no cache de consulta.

## Disponibilidade

Nesta entrega somente os consumidores frontend de prévia/download e seus contratos estão implementados. A RPC acima
**não está implantada**, e o ledger/arquivamento de XML autorizado ainda precisa ser concluído
junto da emissão. `NFSE_BACKEND_ENABLED=false` bloqueia a leitura antes de importar Supabase.
Nenhuma nota real é produzida ou apresentada por fixtures. Cadastro A1 não habilita esta porta.
Habilitar o fluxo exige backend/RLS revisados, teste autenticado de recuperação e smoke da nota
real autorizada em homologação. A publicação da interface foi autorizada em 09/11/2026 para
4.8.276; ela preserva os bloqueios de leitura fiscal e emissão até a implantação desses contratos.
