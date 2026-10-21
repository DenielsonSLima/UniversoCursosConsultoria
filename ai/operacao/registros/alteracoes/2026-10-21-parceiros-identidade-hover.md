# Parceiros: identidade completa no card de pessoa jurídica

Estado: VALIDADO_EM_PUBLICACAO. Versão 4.8.230 / revisão 239.
Pedido do usuário em 20/10: reduzir aproximadamente 15% o nome e mostrar
nome completo, razão social, CNPJ e demais dados disponíveis ao passar o mouse.
Escopo independente da correção financeira; publicação já solicitada na sessão.

## Alteração e aceite

- Fonte do nome de 14 para 12 px, redução de 14,3%, preservando o layout do card.
- Popup via portal fora do overflow do card, com nome completo, razão social,
  nome fantasia quando disponível, CNPJ, telefone, e-mail, cidade, contato e polo.
- Usa somente dados já carregados; não consulta nem modifica cadastro.
- Hover e foco de teclado abrem; Escape fecha; popup permite mover o ponteiro
  do nome para o conteúdo e rolar sem fechar. Rolagem externa/resize fecham.
- Posicionamento limitado à viewport e conteúdo alto com rolagem própria.
- Clique no popup não dispara abertura do cadastro; card mantém comportamento.

## Validação

- Três revisões independentes sem bloqueios.
- Smoke de interação em DOM simulado aprovado: portal, conteúdo/CNPJ,
  posicionamento com retângulos desktop/móvel, transferência de hover,
  sobreposição foco/hover, Escape e próxima abertura/blur, scroll interno/externo,
  resize e isolamento de clique.
- Dois defeitos de foco detectados no ensaio foram corrigidos antes da entrega.
- TypeScript e lint focado aprovados; build/CI conferidos antes de incorporar.
- Nenhum navegador utilizado. DOM simulado não renderiza CSS real; smoke visual
  permanece com o usuário por sua preferência expressa.
- Base PJCard comparada com main f84aca6: apenas importação, largura flexível
  do cabeçalho e substituição do nome pelo componente de prévia.
- Sem mudanças de banco, dependências do produto ou campos de cadastro.

## Manifesto explícito

- `modules/gestor/parceiros/components/cards/PJCard.tsx`
- `modules/gestor/parceiros/components/cards/PJIdentityPreview.tsx`
- `ai/operacao/registros/alteracoes/2026-10-21-parceiros-identidade-hover.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 7 arquivos.
