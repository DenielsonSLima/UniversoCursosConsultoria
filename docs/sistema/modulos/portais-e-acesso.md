# Portais e Acesso

Status: CANÔNICO. Última revisão: 2026-08-12.

## O que este módulo faz

Define a entrada do sistema e separa a experiência de cada público:

| Portal | Rota principal | Código de entrada |
| --- | --- | --- |
| Site público | / | modules/public/ e App.tsx |
| Login interno | /sistema/login | modules/login/ |
| Gestor | /gestor/* | modules/gestor/gestor.page.tsx |
| Professor | /professor/* | modules/professor/professor.page.tsx |
| Aluno | /aluno/* | modules/aluno/aluno.page.tsx |
| Desafio nativo | /native-auth/turnstile | modules/shared/auth/ |

App.tsx centraliza as rotas. Cada portal carrega suas áreas sob demanda para
reduzir o peso inicial.

## Como o acesso funciona

1. O cliente público é criado em lib/supabase.ts com a chave pública.
2. O portal carrega o perfil autorizado a partir do servidor.
3. O perfil informa papel, módulos permitidos e escopo de polos.
4. O frontend usa esse retorno para a navegação, mas o banco continua
   autorizando cada leitura e escrita por RLS, RPC ou Edge Function.
5. Alterações relevantes de perfil e permissão são revalidadas por Realtime.

Nunca trate sessionStorage, localStorage, parâmetros de rota ou dados do
frontend como autorização.

## Configuração necessária

- URL e chave pública do Supabase no ambiente web.
- URLs de redirecionamento de Auth autorizadas no projeto Supabase.
- Domínios oficiais definidos no Vercel e nas configurações de Auth.
- Turnstile configurado para os fluxos público e nativo quando habilitados.
- Papéis, perfis e permissões configurados pelo Gestor autorizado.

Os nomes das variáveis públicas estão em .env.example. Valores privados não
devem ser colocados em arquivos VITE_.

## Fontes principais

- App.tsx
- index.tsx
- lib/supabase.ts
- modules/login/
- modules/shared/auth/
- modules/gestor/access-control.ts
- modules/gestor/gestor-navigation.tsx
- modules/aluno/aluno.page.tsx
- modules/professor/professor.page.tsx

## Validação recomendada

- Validar uma sessão por papel: Gestor, Professor e Aluno.
- Confirmar que a troca de polo remove dados do polo anterior.
- Confirmar que uma rota sem permissão exibe bloqueio e não apenas esconde o
  botão.
- Executar os testes de autenticação ou acesso diretamente afetados.

