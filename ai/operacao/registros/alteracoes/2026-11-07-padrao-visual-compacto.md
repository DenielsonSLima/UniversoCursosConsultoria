# Padrão visual compacto — registro operacional

## Pedido e objetivo

O usuário solicitou expressamente registrar o padrão visual aprovado como skill reutilizável. Este registro é operacional e separado da manutenção visual de Parceiros. A especificação conserva a identidade do Portal Universo e orienta densidade, tipografia, campos brancos, abas com linha inferior, cartões, formulários e seletores próprios; não amplia regras de negócio, acesso, backend, PDFs ou autorização de publicação.

## Manifesto explícito

- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-07-padrao-visual-compacto.md`
- `ai/operacao/skills/universo-interface-compacta/SKILL.md`
- `docs/design/interface-compacta.md`
- `docs/planos/padronizacao-visual-etapas-2026-11-07.md`

Total: 5 arquivos.

## Conteúdo e critérios

- A fonte versionada da skill fica em ai/operacao/skills/universo-interface-compacta/SKILL.md; a cópia disponível no ambiente foi criada pelo responsável do lote a pedido do usuário. Somente a fonte versionada integra este manifesto.
- docs/design/interface-compacta.md concentra tokens, referências existentes e critérios de aceite. A skill aponta para essa especificação e restringe a atuação ao domínio pedido.
- Fontes leves, campos de 38px desktop/44 px móvel, contraste legível, nomes completos, ações alinhadas e linha inferior nas abas. Texto de busca não substitui ID; filtros múltiplos e etapas de wizard mantêm sua semântica própria.
- docs/planos/padronizacao-visual-etapas-2026-11-07.md registra a sequência solicitada e seus gates. Parceiros foi verificado localmente, com CSS móvel compartilhado aceito conforme os limites do registro do produto; não se iniciou análise de código de Caixa, Configurações, Comunicação ou Biblioteca nesta frente.
- Registro dos dois manifestos no cadastro de limite de linhas, sem alterar a política grande ou adicionar exceções. Nenhuma alteração em AGENTS, memória canônica ou política de autorização.

## Validação e limites

Conferência de coerência entre skill versionada, especificação e padrão solicitado; cada arquivo deve permanecer abaixo de 500 linhas. A validação visual do produto pertence ao registro de Parceiros; as verificações realizadas e seus limites de cobertura estão descritos ali. No fechamento, o índice RAG foi atualizado uma única vez com o corpus curado: 15 fontes e 81 trechos; artefato sincronizado por hash. Não houve operação remota nesta frente.

A nova orientação do usuário autoriza publicar agora somente Financeiro 4.8.251 + Parceiros 4.8.252 já implementados; substitui a condição anterior de esperar todas as etapas. A skill não amplia essa autorização para implementação futura ou operação de negócio. O plano pode evoluir com novas orientações explícitas do usuário, sem pular a validação técnica do módulo anterior; os módulos previstos já foram autorizados pelo usuário.
