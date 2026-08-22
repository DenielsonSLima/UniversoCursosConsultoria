# Visão Geral do Sistema

Status: CANÔNICO. Última revisão: 2026-08-12.

## Finalidade

O Universo Cursos e Consultoria reúne em uma aplicação web e móvel:

- site público, catálogo e captação;
- portais de Gestor, Professor e Aluno;
- gestão acadêmica de cursos, turmas, diários, estágios e documentos;
- financeiro, caixa, cobranças e conciliação bancária;
- comunicação, atendimento, WhatsApp e notificações;
- aplicativos móveis do aluno por meio do Capacitor.

## Arquitetura em uma leitura

    Navegador, PWA ou aplicativo Capacitor
                    |
                    v
    React + TypeScript + Vite + TanStack Query
                    |
                    v
    Supabase Auth, PostgREST, Realtime e Edge Functions
                    |
                    v
    PostgreSQL, RLS, RPCs, triggers e migrations
                    |
                    v
    Banese, gateways legados, WhatsApp Meta, Firebase, Cloudflare e outros serviços

O frontend coleta intenção e apresenta o retorno. Regras de autorização,
elegibilidade acadêmica, valores financeiros, baixa e transições de estado
devem permanecer no banco, em RPCs e em Edge Functions.

## Entradas principais

| Camada | Entrada | Responsabilidade |
| --- | --- | --- |
| Web | index.tsx | Inicializa React e o cache do TanStack Query. |
| Rotas | App.tsx | Separa site público, login, Gestor, Professor, Aluno, PWA e rota nativa de segurança. |
| Cliente de dados | lib/supabase.ts | Cria o único cliente público Supabase e controla a recuperação de senha. |
| Portal Gestor | modules/gestor/gestor.page.tsx | Autenticação, escopo de polo, permissões e carregamento dos módulos administrativos. |
| Portal Professor | modules/professor/professor.page.tsx | Perfil do professor, polos e módulos pedagógicos. |
| Portal Aluno | modules/aluno/aluno.page.tsx | Perfil, cursos, turmas, financeiro, secretaria, PWA e app nativo. |
| Banco e backend | supabase/migrations/ e supabase/functions/ | Schema, RLS, RPCs, triggers e integrações privadas. |

## Portais e áreas

### Site público

Fica em modules/public/. Expõe páginas institucionais, catálogo de cursos,
contato, políticas, login público e validador. A entrega web é feita pelo
Vercel; as páginas de compartilhamento social são geradas no build.

### Gestor

Fica em modules/gestor/. É o centro administrativo com escopo por polo e
permissões granulares. Seus módulos principais são Início, Parceiros,
Cadastros, Gestão, Secretaria, Financeiro, Caixa, Patrimônio, Comunicação,
Relatórios, Biblioteca, Calendário e Configurações.

### Professor

Fica em modules/professor/. Dá ao docente acesso às turmas, diários,
planejamento, plano de curso, calendário, comunicação, biblioteca e perfil,
sempre limitado aos polos e turmas autorizados.

### Aluno

Fica em modules/aluno/. Reúne turmas, cursos, calendário, financeiro,
biblioteca, comunicação, secretaria, perfil e notificações. É preparado para
PWA e também alimenta o aplicativo Capacitor.

## Dados, autorização e tempo real

O Supabase é a fonte autoritativa. As migrations versionam o estado do banco
em ordem e nunca devem ser apagadas depois de aplicadas. RLS restringe linhas,
RPCs centralizam operações críticas e triggers preservam invariantes como
transições acadêmicas e financeiras.

O frontend usa TanStack Query para cache. Quando o dado muda por Realtime, a
aplicação invalida o menor conjunto possível de consultas. Dados presentes em
storage local servem apenas à experiência; nunca autorizam um portal.

## Fluxos de negócio mais importantes

| Fluxo | Regra resumida |
| --- | --- |
| Matrícula e turmas | Curso, turma, polo, período, regras de matrícula e documentos são validados no backend. |
| Diário e resultado | Professor registra conteúdo, frequência e avaliação; o fechamento consolida o resultado. |
| Estágio | Requer disciplina com carga de estágio, turma e período elegíveis e vacinas obrigatórias aprovadas quando exigidas. |
| Dependência acadêmica | Após reprovação terminal e fechamento do diário, cria reoferta somente da disciplina; não transfere o aluno para uma turma inteira. |
| Cobrança de dependência | É título isolado, parcela única, sem matrícula ou cronograma técnico, com descrição neutra de disciplina e liberação apenas após pagamento confirmado. |
| Financeiro geral | Recebíveis, caixa, despesas, empréstimos, outros créditos e relatórios usam contratos canônicos no banco e nos gateways. |
| Documentos | Secretaria e Cadastros emitem documentos com modelos, validação e trilha de auditoria. |
| Comunicação | Atendimento interno, WhatsApp, automações e push usam backends dedicados e permissões por papel. |

## Backend e integrações

As Edge Functions em supabase/functions/ agrupam autenticação, administração de
usuários, gateways, Banese, conciliação, documentos, dependência acadêmica,
WhatsApp, suporte público e push.

Pagamentos novos seguem a política financeira vigente. O Banese é a rota
central de boleto técnico; fluxos antigos de Asaas permanecem apenas onde a
política os classifica como legado. Serviços externos não devem ser chamados
diretamente pelo navegador quando exigirem segredo.

## Entrega

- Vite gera a aplicação web.
- Vercel aplica headers, rewrites SPA e rotas de social preview definidas em
  vercel.json.
- Capacitor usa o mesmo diretório de build para Android e iOS.
- A versão oficial exibida pelo sistema está em
  internal/versioning/system-version.json; package.json não é a fonte de
  versão operacional.
- GitHub executa as verificações definidas em .github/workflows/.

## Configuração segura

O navegador recebe apenas variáveis públicas de ambiente, como endereço do
Supabase, chave pública e chaves de interface. Segredos de banco, gateways,
Cloudflare, Firebase, OpenAI e provedores externos ficam no Vault ou na
configuração privada das Edge Functions e plataformas.

Leia [Ambiente local e configuração](operacao/ambiente-local-e-configuracao.md)
antes de configurar uma máquina.

## Manutenção segura

1. Descubra o módulo e o contrato afetado.
2. Faça a menor alteração possível.
3. Teste o fluxo afetado sem criar cobranças reais nem alterar dados de alunos.
4. Para banco, permissões, financeiro ou produção, siga as políticas em
   ai/operacao/politicas/.
5. Registre e publique somente quando houver autorização explícita.

Para a divisão detalhada, use o índice em [Mapa do Sistema](README.md).

