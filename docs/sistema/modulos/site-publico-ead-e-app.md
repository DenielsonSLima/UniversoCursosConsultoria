# Site Público, EAD, PWA e Aplicativo

Status: CANÔNICO. Última revisão: 2026-08-12.

## Site público

O site institucional e o catálogo ficam em modules/public/. As rotas públicas
incluem cursos técnicos, livres, especialização, ensino superior, EAD, contato,
políticas, login e validador.

O arquivo App.tsx declara as rotas. O arquivo vercel.json aplica headers de
segurança, rewrites da SPA e rotas de compartilhamento social.

## EAD

O catálogo e as páginas de EAD são mantidos no frontend. Integrações de turma,
matrícula e conteúdo usam os contratos acadêmicos e financeiros aplicáveis.
Quando uma oferta usa plataforma externa, o redirecionamento e a integração
devem ser configurados no backend ou no cadastro autorizado, não hard-coded
em uma página.

Scripts de importação ou atualização de cursos EAD são operacionais e devem
ser revisados antes de uso; vários são históricos e não substituem o fluxo
seguro via ferramentas autorizadas.

## PWA do aluno

O PWA fica em public/aluno/. Ele armazena somente o shell de aplicação; não
deve armazenar credenciais, respostas financeiras ou dados acadêmicos
confidenciais em cache público.

## Aplicativo nativo

Capacitor reutiliza o build web:

- configuração: capacitor.config.ts;
- Android: android/;
- iOS: ios/;
- bridges de autenticação e push: modules/shared/auth/ e
  modules/aluno/native-app/;
- orientação de empacotamento: internal/empacotamento/.

O desafio de segurança nativo possui rota isolada em
/native-auth/turnstile. Ela não deve carregar o shell comum do portal.

## Configuração

- Domínio público e URL do site.
- Variáveis públicas do frontend.
- Turnstile web e nativo quando habilitado.
- Firebase, APNs e credenciais nativas somente em configuração privada.
- Assinatura e identificadores de aplicativo tratados fora do repositório.

## Validação recomendada

- Conferir rotas públicas, SEO e preview social após build.
- Conferir que o PWA não cacheia resposta autenticada.
- Testar login e push nativos em aparelho ou simulador autorizado.
- Executar as verificações de empacotamento antes de gerar aplicativo.

