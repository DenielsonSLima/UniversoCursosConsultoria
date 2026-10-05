# Gestor — Início, Secretaria e Calendário — 4.8.172

## Pedido e aceite

O responsável pediu a mesma análise de nitidez nos três módulos do gestor.
A autorização de produção e a proibição de navegador persistem na sessão.
Base main `1b62dd25ef366aa2a7be6b8333629112e42178aa`, versão 4.8.171.
Publicação condicionada à CI/Preview; estado final disponível no PR/Vercel.

## Achados e patch

- Painel e agenda usam rótulos de 9–11px, contraste baixo e tracking amplo.
  Rótulos menores passam a 12px/linha 18px, com tracking reduzido nas maiúsculas.
  Textos slate-400 passam a slate-600; ícones e cores de categoria preservados.
- Secretaria usa font-black nos títulos dos atalhos. Navegação passa a 16px/600,
  descrições a 14px/400 e slate-600; cabeçalho usa peso 700 e tracking menor.
- Suavização global antialiased alcança descendentes da agenda apesar do auto
  inline da raiz; CSS localizado passa a auto nos três módulos.
- fadeIn global conserva transform/will-change. Entrada das raízes e navegação
  revisadas usa somente opacidade sem forwards, com movimento reduzido.
  Cartões de métricas e Secretaria conservam hover de borda/sombra sem deslocar texto.
- Campos da agenda usam >=16px em celular/toque para evitar autozoom ao focar;
  seletores desktop e textos de 13px da agenda passam a 14px.
- CSS de tamanhos restrito a painel/agenda. Documentos e formulários da
  Secretaria preservam medidas. Sem mudança em compositores PDF, valores,
  permissões, consultas ou código AgendaWorkspace compartilhado com aluno/professor.

## Manifesto explícito

- `styles.css`
- `styles/gestor-module-readability.css`
- `modules/gestor/dashboard/DashboardPage.tsx`
- `modules/gestor/dashboard/components/DashboardMetricCard.tsx`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/calendario/CalendarioPage.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-05-gestor-inicio-secretaria-calendario-nitidez.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/rag/index.json`

Total: 13 arquivos.

## Validação e limites

Fechamento: smoke DOM dos componentes reais (navegação restrita da Secretaria,
cartão de métricas e seletores/ações da agenda); cascade CSS compilada em
320, 390, 844 e 1440px, toque em paisagem e movimento reduzido; tipagem,
lint dos componentes e build. Limite de linhas, versão e contrato operacional.
Harnesses temporários não integram o commit; sem navegador ou dados reais.
Smoke visual/autenticado pendente por orientação expressa; a melhora percebida
não é declarada comprovada pela análise técnica. Preview/CI precedem produção.
