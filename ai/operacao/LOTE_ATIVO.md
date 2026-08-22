# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO_PRODUCAO_4_7_0`

## Lote: 2026-08-22-jornada-cursos-livres

- Pedido: consolidar Cursos Livres como jornada presencial com turma, professor único, aulas/diário, prova final online, certificado automático e plano financeiro individual negociável.
- Base remota: `main` no commit `04d3ada4cfdb703b71a21cf68343d39373660503`, versão `4.6.1`; os lotes 4.6.0 e 4.6.1 já estão mesclados e preservados.
- Registro: `ai/operacao/registros/alteracoes/2026-08-22-jornada-cursos-livres.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-22-jornada-cursos-livres.md`.
- Frentes concluídas localmente: contrato acadêmico e prova; condição financeira individual; Gestão e Portal do Aluno.
- Supabase principal/Produção: 26 migrations aplicadas via MCP, versões remotas `20260822201749` até `20260822213949`.
- Homologação: não há branch Supabase nem outro projeto configurado neste workspace.
- Versão desta entrega: `4.7.0` estável.
- Entrega geral: o PR de produção também incorpora o lote concluído `2026-08-22-avaliacoes-ead-e-cards-tecnicos`, com dez migrations já aplicadas e manifesto próprio.
- GitHub/Vercel: publicação em Produção autorizada explicitamente em 2026-08-22; PR `#81` aberto e gates finais em execução antes do merge.
- Cobranças: nenhum boleto, matrícula, turma ou outro registro operacional foi criado durante a aplicação/validação.

### Critérios de aceite

1. Toda turma Livre recebe as matérias do curso e mantém um único professor responsável. `ATENDIDO_LOCALMENTE`.
2. Aulas ficam dentro do período da turma, respeitam a carga e alimentam o diário presencial existente. `ATENDIDO_LOCALMENTE`.
3. A avaliação publicada possui pelo menos 50 questões; cada tentativa recebe 10 questões únicas escolhidas no servidor, sem gabarito no cliente. `ATENDIDO_LOCALMENTE`.
4. A prova libera na data/hora da última aula somente com cronograma completo; aprovação é calculada no banco e finaliza matrícula e certificado Livre atomicamente. `ATENDIDO_LOCALMENTE`.
5. O aluno Livre acessa resumo, diário, atividades, notas, prova final e certificado, com bloqueios retornados pelo servidor. `ATENDIDO_LOCALMENTE`.
6. O plano da turma é apenas o padrão: por aluno é possível herdar ou configurar 1–60 parcelas, desconto comercial, primeiro vencimento, pontualidade, juros e multa. `ATENDIDO_LOCALMENTE`.
7. A Gestão pode vincular sem títulos ou vincular e gerar títulos locais agora; emissão bancária permanece ação posterior no Financeiro. `ATENDIDO_LOCALMENTE`.
8. Todo cálculo financeiro, sorteio, liberação, correção, conclusão e emissão ocorre no backend; o frontend somente coleta entradas e renderiza DTOs canônicos. `ATENDIDO_LOCALMENTE`.
9. Informática Básica recebe resumos das nove matérias e banco publicado com 50 questões válidas. `ATENDIDO_LOCALMENTE`.
10. Novas tabelas/RPCs usam menor privilégio, idempotência, locks, auditoria e migrations novas com até 500 linhas. `ATENDIDO_LOCALMENTE`.

### Validação local

- Deno: `69/69` contratos aprovados.
- Node: `28/28` contratos de interface aprovados.
- `npx tsc --noEmit`: aprovado.
- ESLint focado: aprovado.
- `npm run build`: aprovado; somente os avisos preexistentes de chunks acima de 500 kB.
- Contrarrevisão independente: nenhum blocker/High remanescente.
- Teto físico: todos os arquivos manuais deste manifesto têm até 500 linhas; o serviço compartilhado foi dividido em fachada de 417 linhas e serviço de criação de 229 linhas.
- Produção: ledger `26/26`; 19 triggers do lote presentes; RLS ativo e escrita/leitura direta fechada para `anon` e `authenticated` nas seis tabelas públicas novas.
- Informática Básica em Produção: 1 curso, 1 módulo, 9 matérias/80h, 9 resumos, 9 conteúdos, 1 avaliação publicada e 50/50 questões válidas.
- RBAC real somente leitura: gestor autorizado recebeu os DTOs de grade e avaliação; chamada sem identidade foi negada.
- Financeiro real somente leitura: prévia de R$ 500 em 4 parcelas retornou quatro vencimentos e soma exata de R$ 500 pelo backend.
- Advisors: baseline preservado em 470 avisos de segurança e 252 de performance; nenhum core corretivo é executável externamente, nenhum RPC novo ficou acessível a `anon` e as FKs novas do lote seguem cobertas.
- Compatibilidade do seed: as grafias legadas `HARDWARE E PERIFÉRIOS` e `SOFTWARES E SISTEMA OPERACIONAIS` foram incorporadas aos aliases, preservando os IDs existentes e evitando criar duas matérias extras.
- Smoke autenticado: bloqueado porque nenhum navegador in-app/Chrome está conectado à sessão (`browsers = []`).

### Pendências de fechamento

1. Fazer smoke visual autenticado da Gestão e do Portal do Aluno quando um navegador in-app/Chrome estiver conectado.
2. Executar replay e concorrência com fixture controlada quando existir homologação ou uma turma Livre de teste autorizada; Produção ainda não possui turma/matrícula Livre e não recebeu fixture artificial.
3. Evitar operações SQL em lote que alterem/excluam várias turmas Livres até validar esse cenário específico; a interface atual opera uma turma por vez.
4. Concluir commit atômico, CI, Preview Vercel, merge em `main` e smoke HTTP de Produção.

### Manifesto explícito

- O manifesto consolidado, arquivo a arquivo, está no registro `ai/operacao/registros/alteracoes/2026-08-22-jornada-cursos-livres.md`.
- Alguns arquivos compartilhados de Portal do Aluno e Gestão já continham alterações paralelas fora deste lote. Elas foram preservadas e não são atribuídas a esta entrega.

Histórico encerrado: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
