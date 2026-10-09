# Login pela matrícula acadêmica do aluno

Entrega 4.8.190. Correção e publicação autorizadas pelo usuário.

## Causa e comportamento

A tela de cadastro apresenta a matrícula acadêmica do vínculo, mas o resolvedor
de login reconhecia somente a matrícula de acesso permanente do parceiro.
O formulário preservava o identificador e a senha; a recusa ocorria no backend.
A ausência de e-mail pessoal não impede o acesso: a conta usa seu alias interno.

O resolvedor passa a aceitar os dois identificadores e mantém a mesma conta.
Reutiliza o formatador acadêmico existente com ID e data da matrícula, polo
e configuração cadastrada. Conta pessoas distintas, mesmo sem alias Auth,
e recusa colisões acadêmicas ou entre os dois tipos de identificador.
Múltiplos vínculos da mesma pessoa não duplicam o candidato. Matrícula concluída
não bloqueia o acesso de uma pessoa ativa. E-mail mantém o contrato existente.
Não há cálculo, identificação paralela nem regra de autenticação no frontend.

Migration aplicada via MCP: `20261009112324_resolve_academic_student_login_identity`.
SQL preservado integralmente após aplicação; função com search_path vazio,
sem grants para anon/authenticated e execução reservada a service_role.
Nenhuma Edge Function precisa ser republicada para usar a nova resolução.

O ajuste individual de senha solicitado foi tratado separadamente da migration,
na identidade já vinculada, sem recriar conta nem mudar e-mail. A operação
transacional verificou exclusividade da identidade, estado ativo, confirmação
prévia e ausência de emissão temporária pendente, mantendo os triggers ativos.
O serviço nativo de autenticação confirmou a senha solicitada após o ajuste.
Dados pessoais, senha e tokens não integram arquivos, testes ou documentação.

## Manifesto explícito

- `.github/workflows/student-registration-login.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-login-matricula-academica.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/functions/portal-auth/registration-login.test.mjs`
- `supabase/migrations/20261009112324_resolve_academic_student_login_identity.sql`
- `supabase/tests/fixtures/portal-academic-registration-formatter.sql`
- `supabase/tests/portal_academic_registration_login.isolated.test.mjs`

Total: 10 arquivos.

## Validação

- Três revisões separadas: resolvedor/backend, formulário/vínculo e segurança.
- 12/12 testes SQL isolados e 5/5 testes do handler real com serviços controlados.
- Reproduz a falha anterior e cobre configuração acadêmica, colisões, conta sem
  e-mail pessoal, deduplicação por pessoa, status, grants e search_path.
- Handler preserva senha exatamente e mantém Turnstile, rate limit e erro genérico.
- RPC real executada como service_role: ambos os identificadores resolvem a
  conta esperada; identificador desconhecido é recusado.
- Autenticação nativa real a partir do resolvedor acadêmico retorna sucesso
  e confirma a identidade esperada. Sessão efêmera encerrada com escopo local.
- Versionamento, lint dos testes e manifesto conferidos; CI completo antes do merge.
- RAG atualizado uma vez: 15 fontes e 80 trechos. Teto de 500 linhas conferido
  nos dez arquivos; check global local depende dos históricos ausentes neste
  checkout seletivo e será validado pelo checkout completo do CI.

Não há sessão Safari autenticada disponível. O smoke real cobre resolução e
serviço Auth; o handler foi exercitado com transportes controlados, sem
declarar um teste manual da interface. Reparos individuais não foram incluídos
em migration. Arquivos apenas consultados e artefatos temporários ficam fora
do manifesto. Não há mudança nos documentos, no financeiro ou em outras modalidades.
