# NFS-e — modal de modelos e cabeçalho compacto

## Pedido e limite

O usuário apontou duas divergências do padrão visual aprovado: avisos e explicações ocupando espaço no cabeçalho, e Novo modelo abrindo dentro da tela. A correção reúne apenas esses pontos. Base publicada 4.8.261, commit a9a4ca4e8acc45728bb93514f06de36c908c993e; candidato 4.8.262/revisão 271. A publicação paralela dos campos monetários foi preservada antes de criar o candidato NFS-e.

## Implementação

- Remove o aviso fiscal duplicado e a explicação sobre o CNPJ; mantém o filtro de mês, com nome acessível, no cabeçalho.
- Indisponibilidade aparece em estado curto na área de resultados, sem descrição técnica repetida.
- Novo modelo e edição usam modal por portal, preservando a listagem ao fundo. Referência de comportamento: cadastro institucional de tipos de produto.
- Fundo inerte e rolagem bloqueada durante abertura; foco inicial no nome, navegação explícita por Tab/Shift+Tab e retorno ao disparador. Fechamento por Escape, X, Cancelar e fundo, respeitando a operação de salvamento.
- Campos existentes, validações, payload, idempotência, allowed e flags fiscais preservados. Rodapé com ações agrupadas à direita.
- Acesso individual, RPCs, credenciais e cálculo financeiro não são alterados.

## Validação

Lint e TypeScript focados nos componentes NFS-e aprovados. Smoke local Safari com componentes reais e rede bloqueada: cabeçalho desktop/390 px sem o aviso, filtro alterado para outro mês, modal sobre a lista, campos móveis legíveis, foco inicial, Tab/Shift+Tab contidos, Escape e Cancelar com retorno ao botão Novo modelo. O teste encontrou e corrigiu a particularidade de foco do Safari antes da entrega. Nenhuma gravação nem emissão foi executada.

O comando global check:file-lines encontra ausências históricas fora do manifesto neste workspace. Não foram recuperados arquivos nem alterados outros domínios. O manifesto manual tem menos de 500 linhas por arquivo; índice RAG é gerado. A validação global de integração deve usar o checkout remoto da PR, preservando alterações paralelas locais.

Entrega por MCP GitHub, commit atômico, Preview e checks verdes antes do merge. A publicação é a correção da entrega NFS-e anteriormente autorizada. Verificar deployment final e tela autenticada. Artefatos temporários da prévia não integram a entrega.

## Manifesto explícito

- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseDataState.tsx`
- `modules/gestor/emissor-nfse/modelos/ModelosNfseTab.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-07-nfse-modal-cabecalho-compacto.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`

Total: 10 arquivos.
