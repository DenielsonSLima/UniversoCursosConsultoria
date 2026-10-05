# Acesso do aluno — zoom e nitidez — 4.8.170

## Pedido, aceite e estado

Revisão, reunião com três agentes e atualização em produção autorizadas pelo
responsável em 05/10/2026. Navegador expressamente proibido. Escopo: acesso web,
app/PWA e portal do aluno, preservando design e zoom manual. Preparado sobre
main `78afddaf51a5fe738621c8e19feb2c6dfef5db24`, versão 4.8.169.
Publicação condicionada aos checks e Preview; estado final consultável no PR e
na Vercel. Não há alteração de dados, autenticação ou permissões.

## Diagnóstico e reunião

- Mobile: login público força 14px; login/cadastro app usam 15px. Esses tamanhos
  acionam autozoom no foco de campos no WebKit/iOS. Meta viewport já está correta.
- Fontes: suavização forçada global e overrides de login anulavam ajustes prévios.
  App não recebia o escopo do login público; sidebar também tinha regra própria.
- Animação: fadeIn global mantém transform via forwards, will-change e backface,
  podendo conservar texto em camada rasterizada. Sem evidência de blur direto
  ou fonte Inter ausente; pesos 300–900 estão declarados.
- Reunião cruzada aprovou correções locais, sem redesign e sem bloquear zoom.
  Efeitos de fundo e demais portais continuam com seus estilos próprios.

## Correções

- Piso de 16px para inputs, selects e textareas em telas até 767px ou de toque (inclusive paisagem/tablets), cobrindo
  acesso público, primeiro acesso do aluno, recuperação app, fullscreen e portal.
- Campos de login público com fonte nativa, pesos 500/400 e renderização auto.
- Escopo de renderização auto para aluno, inclusive sidebar e filhos antialiased.
- Fade do aluno usa apenas opacidade, sem transform/will-change persistentes,
  e respeita movimento reduzido. As fontes de marca existentes são preservadas.
- Rolagem de acesso permite pinch zoom; altura visual é normalizada pela escala
  para distinguir teclado real de ampliação manual, incluindo rotação e fallback.

## Manifesto explícito

- `styles.css`
- `styles/aluno-viewport.css`
- `modules/aluno/components/AlunoPortalShell.tsx`
- `modules/aluno/login-app/useAlunoFullscreenViewport.ts`
- `modules/aluno/login-app/aluno-viewport-height.ts`
- `modules/aluno/login-app/aluno-viewport-height.test.ts`
- `modules/public/login/AlunoLoginPublicView.tsx`
- `modules/public/login/AlunoFirstAccessPage.tsx`
- `modules/login/password-recovery/PasswordRecoveryAppView.tsx`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-05-aluno-zoom-nitidez.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/rag/index.json`

Total: 16 arquivos.

## Validação e limites

Aprovados: testes focados de zoom/teclado/rotação e primeiro acesso, TypeScript,
lint, build, controle de versão/linhas e contrato operacional. Harness sem
navegador avaliou 30 combinações de campos/mobile/toque sobre CSS compilado,
cascade da sidebar/fade desktop, movimento reduzido e três HTMLs/viewport.
CI executa os testes de viewport. Conferência HTTP de /login, /aluno e CSS
publicado confirma entrega dos arquivos; não comprova nitidez percebida.
Smoke visual e autenticado não executado pela proibição expressa de navegador;
a aparência final em PC/celular permanece sem observação direta.

## Preservação de trabalho paralelo

O lote ativo anterior de Proesc desconto líquido é preservado em
`ai/operacao/registros/alteracoes/2026-10-03-proesc-desconto-liquido.md`.
Somente o manifesto acima entra no commit; nenhum arquivo financeiro/Supabase
ou trabalho paralelo é alterado.
