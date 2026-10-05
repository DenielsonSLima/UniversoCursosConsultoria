# Caixa — nitidez das abas de polos — 4.8.171

## Pedido e aceite

O responsável pediu também a revisão da fonte das abas de polos do Caixa,
relatando aspecto turvo e desconforto na leitura. A autorização de atualização
em produção e a orientação de não abrir navegador permanecem da sessão.
Escopo somente tipográfico e renderização; design e comportamento preservados.
Preparado sobre main `c47cd4f0bb15b502be8c4d556d60d8140d039417`, versão 4.8.170.
Publicação condicionada à CI/Preview. Estado final disponível no PR/Vercel.

## Achados e patch

- Nomes em 14px/semibold e selo Matriz em 9px, com suavização global forçada.
- CaixaPage usa fadeIn com forwards, transform translateY(0), will-change e
  backface permanentes: possível contribuição ao aspecto turvo em PC/celular.
- Nomes passam para 16px/peso 500/linha 24px e inativos slate-600; selo Matriz
  passa para 12px/peso 500/linha 16px e azul-700.
- Fonte existente preservada; suavização/text-rendering auto somente nas abas.
- Entrada do Caixa usa opacidade, termina sem transform/will-change persistente
  e respeita movimento reduzido. Outros módulos mantêm suas animações.
- Seleção de polos, escopo, consultas, valores e permissões permanecem intactos.

## Manifesto explícito

- `styles.css`
- `styles/caixa-polo-tabs.css`
- `modules/gestor/caixa/CaixaPage.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-05-caixa-abas-polos-nitidez.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/rag/index.json`

Total: 9 arquivos.

## Validação e limites

Aprovados: teste focado existente da orquestração do Caixa, TypeScript, lint do
componente e build. Harness sem navegador confere a cascade CSS compilada dos
nomes/selo em 320, 390, 844 e 1440px, renderização auto/peso 500 e ausência de
transform/will-change persistente, inclusive movimento reduzido.
Versão, teto de linhas e contrato operacional conferidos no fechamento.
Smoke visual/autenticado não executado por orientação expressa do responsável;
a melhora percebida não é declarada comprovada pela verificação técnica.
Sem banco/Supabase, alteração financeira, nova dependência ou dados de clientes.

## Trabalho anterior

A entrega do aluno 4.8.170 está publicada e seu registro é preservado em
`ai/operacao/registros/alteracoes/2026-10-05-aluno-zoom-nitidez.md`.
Somente o manifesto atual integra o commit da correção do Caixa.
