# Portais e Acesso

Status: CANÔNICO. Última revisão: 2026-08-21.

## O que este módulo faz

Define a entrada do sistema e separa a experiência de cada público:

| Portal | Rota principal | Código de entrada |
| --- | --- | --- |
| Site público | / | modules/public/ e App.tsx |
| Login interno | /sistema/login | modules/login/ |
| Gestor | /gestor/* | modules/gestor/gestor.page.tsx |
| Professor | /professor/* | modules/professor/professor.page.tsx |
| Aluno | /aluno/* | modules/aluno/aluno.page.tsx |
| Responsável legal | /responsavel/* | modules/responsavel/ |
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

## Primeiro acesso do Aluno e do Responsável

O convite por e-mail e a senha temporária são caminhos diferentes para o
mesmo primeiro acesso protegido:

1. No convite, a pessoa abre o link, cria uma senha própria e entra pelo login
   público. Se ainda não aceitou os termos vigentes, o portal a encaminha para
   essa etapa antes de liberar qualquer conteúdo.
2. Se o e-mail foi apagado ou o link expirou, o Gestor pode reenviar o acesso.
   Uma conta já vinculada recebe um novo e-mail de recuperação, sem expor o
   link ou o token na resposta administrativa.
3. Como alternativa assistida, o Gestor confirma que validou a titularidade do
   e-mail por um canal independente e gera uma senha temporária. Ela é exibida
   uma única vez, não é persistida pelo frontend e obriga a criação de uma
   senha própria no primeiro login.
4. A troca da senha e o aceite da versão vigente dos Termos de Uso são
   revalidados pelo banco. Enquanto houver qualquer pendência, o Aluno não
   recebe o contexto acadêmico e o Responsável não consegue listar os seus
   dependentes.

A emissão assistida é recusada quando a mesma identidade Auth possui mais de
um perfil, pois a senha é global para a conta. Em contas elegíveis, o servidor
usa uma reserva serializada e um par marker/nonce de uso único; a senha só é
mostrada depois que a escrita, a autenticação efêmera e a conclusão no banco
forem confirmadas. Resultado ambíguo falha fechado e nunca revela a senha.

O reenvio conserva o mesmo `requestId` até a conclusão canônica. Um retry de
operação reservada ou já enviada não chama novamente o provedor. Respostas com
senha ou tokens usam `no-store`; links e tokens de recuperação não são
devolvidos ao Gestor.

O cadastro e a verificação do Responsável continuam explícitos no módulo do
Gestor. Os campos de contato familiar mantidos no cadastro do Aluno não criam
uma identidade de acesso automaticamente: o Gestor confere os dados, cria ou
seleciona o Responsável canônico e verifica o vínculo antes de preparar o
acesso.

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
- modules/responsavel/
- modules/gestor/parceiros/responsaveis/
- supabase/functions/portal-user-management/

## Validação recomendada

- Validar uma sessão por papel: Gestor, Professor, Aluno e Responsável.
- Confirmar que a troca de polo remove dados do polo anterior.
- Confirmar que uma rota sem permissão exibe bloqueio e não apenas esconde o
  botão.
- Confirmar convite, reenvio, validação administrativa, senha temporária,
  troca obrigatória e aceite de termos do Responsável.
- Executar os testes de autenticação ou acesso diretamente afetados.
