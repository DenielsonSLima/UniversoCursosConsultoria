# Hotfix de layout do valor e desconto em recebíveis

Data: 2026-08-31  
Estado: publicação em produção autorizada via PR #103

## Pedido e diagnóstico

Na tabela desktop de Contas a Receber, o texto exibido abaixo do valor nominal
avançava sobre os botões de ação. As capturas fornecidas confirmaram a mesma
falha em boletos pendentes e pagos: a coluna `Valor` tinha somente 11% da grade,
enquanto o resumo financeiro usava texto sem quebra de linha.

Os valores e descontos apresentados estavam corretos. O hotfix é restrito à
distribuição de espaço e tipografia da interface.

## Correção

- A largura mínima da tabela passa de 960 para 1080 pixels.
- As colunas passam a usar `18 / 23 / 17 / 11 / 17 / 14` por cento; `Valor`
  fica mais próximo de `Datas` e recebe espaço próprio antes de `Ações`.
- O padding interno das colunas `Valor` e `Ações` é reduzido sem remover a
  separação visual.
- `Desconto do boleto` passa de 11 para 10 pixels e a validade de 10 para 9
  pixels, com entrelinha compacta.
- Na linha desktop, juros, multa e valor recebido usam a mesma escala auxiliar
  de 10 pixels.
- A apresentação em cards e toda a lógica financeira permanecem inalteradas.

## Validação

- 18 testes focados de desconto e apresentação: aprovados.
- ESLint focal: aprovado.
- `npx tsc --noEmit`: aprovado.
- Comparação com o `main` remoto confirmou que os três arquivos de produto
  contêm somente o delta descrito neste registro.
- Smoke visual autenticado permanece pendente por ausência de navegador
  conectado nesta sessão.

## Publicação

- Base remota: `4f316c624238b0cf0c83ea9537682a8801165b5c`.
- O usuário autorizou explicitamente a produção em 31/08/2026.
- PR #103: um commit atômico, revisão independente aprovada, Controle de Versão
  e Qualidade do Produto aprovados.
- Preview Vercel aprovada:
  `https://universo-cursos-consultoria-git-a35db4-denielson-limas-projects.vercel.app`.
- O merge em `main` aciona a promoção pela Vercel; a verificação pós-merge é
  obrigatória antes do fechamento da entrega.

## Manifesto explícito

Total: 9 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/COMMITS_E_DEPLOYS.md`
- `ai/operacao/registros/alteracoes/2026-08-31-hotfix-layout-valor-desconto-recebiveis.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesList.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-boleto-discount.contract.test.ts`
