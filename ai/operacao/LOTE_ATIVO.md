# Lote ativo

Estado: EM CORREÇÃO — COLUNAS DOS INSTRUMENTOS DO DIÁRIO

## Lote: 2026-09-13-diario-colunas-notas

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-13-diario-colunas-notas.md`.

- Corrigir a regressão da 4.8.57 que concatenou instrumentos no PDF e duplicou o grupo de notas na tela.
- Exibir apenas instrumentos selecionados ou usados no documento, uma avaliação por coluna; repetir P como P1/P2 e preservar categorias combinadas.
- Manter notas, médias, recuperação e frequência fornecidas pelo servidor, incluindo zero, vazio e precisão decimal.
- Escopo: apresentação da tabela e do PDF nativo; banco, fonte, assinatura e fechamento preservados.
- Três frentes: interface/helper, compositor PDF e revisão independente das 14 fontes.
- Aceite: cabeçalho único, seleções fiéis, colunas alinhadas, casos P/P1-P2/P+PP/TG-CQ, smoke visual e PDF renderizado.
- Publicação autorizada explicitamente pelo usuário nesta conversa.

## Entrega anterior

- 4.8.57, PR150: 14 diários materializados, 122 aulas, 369 notas e 3.218 frequências; replay sem novas inserções.
- Registro completo: `ai/operacao/registros/alteracoes/2026-09-13-diarios-operacionais.md`.
