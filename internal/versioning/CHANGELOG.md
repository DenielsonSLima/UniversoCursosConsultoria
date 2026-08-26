# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [05/08/2026 — parte 1](./changelog/2026-08-05-parte-1.md), [04/08/2026](./changelog/2026-08-04.md), [03/08/2026](./changelog/2026-08-03.md), [02/08/2026 — continuação](./changelog/2026-08-02-parte-2.md), [02/08/2026 a 31/07/2026](./changelog/2026-07-31-a-2026-08-02.md), [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

## [4.8.6] - 2026-08-26

### Corrigido

- Avisos financeiros Push, inbox e WhatsApp passam a revalidar o recebível antes do efeito externo; títulos suspensos, cancelados, estornados, devolvidos ou pagos não recebem lembretes de cobrança.
- O checkout EAD e o checkout legado reutilizam somente o mesmo título `PENDENTE` ou `VENCIDO`, sem pagamento, e repetem a validação entre reparos assíncronos e imediatamente antes de devolver a URL.
- O BolePix continua sendo emitido como `BOLETO` Banese. Quando o banco não devolve QR ou payload Pix oficial, backend e portais rebaixam a apresentação para o PDF do boleto sem fabricar nem exibir um Pix vazio.

### Segurança e qualidade

- A guarda compartilhada bloqueia `banese_card + PIX` direto antes de consultar configuração, em sandbox e produção, sem bloquear o Pix oficial retornado dentro de uma cobrança `BOLETO`.
- A ordem de locks financeiros foi normalizada para `contas_receber → job → delivery`, com revalidação de identidade e testes de corrida para impedir reapresentação ou envio após trancamento e pagamento.

## [4.8.5] - 2026-08-25

### Alterado

- O fechamento operacional registra migration, revisão cruzada, PR/merge, CI, Vercel Preview/Production, smoke público e limitações sem alterar o contrato funcional publicado em 4.8.4.

## [4.8.4] - 2026-08-25

### Corrigido

- A remoção ou troca de matrícula do Aluno passa a sincronizar por uma outbox autorizada, sem depender de DELETE filtrado do Postgres Changes, com refetch canônico ao reconectar ou retomar o aplicativo.
- O card financeiro usa somente status, elegibilidade de recibo e resumo calculados pelo backend; a página deixa de manter uma segunda assinatura Realtime para o mesmo evento financeiro.

### Segurança e qualidade

- A audiência `ALUNO` é autorizada pela identidade corrente, preservando o OID do autorizador, a policy RLS, os grants mínimos e os tópicos sem payload acadêmico sensível.
- Os quatro perfis continuam disponíveis na mesma identidade, separados entre os logins público e institucional, com seletor apenas quando há mais de um acesso compatível na audiência.

## [4.8.3] - 2026-08-25

### Alterado

- O fechamento operacional registra ledgers e hashes das 11 migrations, PR/merge, CI, Vercel Preview/Production, smoke HTTP e limitações de autenticação sem criar usuários, pagamentos ou lançamentos artificiais; o contrato funcional publicado em 4.8.2 permanece inalterado.

## [4.8.2] - 2026-08-25

### Corrigido

- Os Financeiros do Professor e do Aluno passam a receber do backend valores pagos, saldos, atraso, filtros, totais e paginação, sem tratar valor previsto como pagamento nem mascarar falha de consulta como saldo zerado.
- Recibos manuais usam snapshot autorizado e PDF vetorial institucional; prévia, download e impressão compartilham o mesmo arquivo, enquanto comprovantes oficiais de gateway permanecem preservados.
- O portal do Professor revalida os polos em toda montagem, mantém a sessão em falha transitória e nunca libera módulos com autorização apenas em cache.
- Realtime e TanStack refazem as leituras canônicas na assinatura e reconexão, com debounce, limpeza e invalidações direcionadas para matrícula, vacinas, calendário, comunicação e financeiro.

### Segurança e qualidade

- As novas RPCs confirmam a identidade e o escopo no banco, usam grants mínimos e preservam pagamento zero ou parcial, data civil de Maceió e exclusão de títulos cancelados ou estornados.
- Os acessos multiperfil continuam separados por audiência: Aluno/Responsável no login público e Gestor/Professor no institucional, com seleção somente quando houver mais de um perfil compatível.
- Contratos de Auth, SQL, PDF, Banese, Realtime e chaves TanStack foram incorporados ao gate obrigatório de CI.

## [4.8.1] - 2026-08-24

### Alterado

- O fechamento da identidade multiperfil registra os ledgers reais, a Edge Function v35, o merge, o deploy web e os smokes de Produção no lote ativo, no histórico operacional e no índice RAG.

### Segurança e qualidade

- O patch não altera o contrato funcional 4.8.0; apenas preserva evidências imutáveis de CI, rollout e limitações do smoke autenticado sem criar usuário artificial.

## [4.8.0] - 2026-08-24

### Adicionado

- Uma mesma identidade autenticada pode reunir, de forma controlada, os perfis Gestor, Professor, Aluno e Responsável.
- O login público oferece somente Aluno e Responsável; o login institucional oferece somente Gestor e Professor. Quando há um único perfil na audiência, o acesso é automático; quando há dois, a pessoa escolhe o contexto.

### Segurança e qualidade

- O compartilhamento exige CPF válido e e-mail canônico iguais em todos os perfis, preserva a senha existente e rejeita colisões ou divergências antes do vínculo.
- Travas transacionais, constraints diferíveis e limpeza conservadora de Auth protegem vínculos e exclusões concorrentes.
- Recuperação de senha, primeiro acesso, checkout, convites assinados e Edge Function foram revisados em conjunto, com contratos multiperfil incorporados ao gate do GitHub.

## [4.7.7] - 2026-08-24

### Corrigido

- O card do aluno agora reconhece a validação administrativa do e-mail com check verde e rótulo próprio, sem confundi-la com a confirmação independente do Supabase Auth.

## [4.7.6] - 2026-08-24

### Corrigido

- A Caixa de Assinaturas da Secretaria volta a consultar os documentos da Matriz, cujo UUID legado é válido no PostgreSQL, sem falhar antes da chamada remota.

### Segurança e qualidade

- A fronteira das RPCs continua rejeitando identificadores malformados; autorização, escopo, banco e funções remotas permanecem inalterados.
- A PR #87 foi integrada na `main`, a Vercel Production ficou pronta e o smoke autenticado da Caixa da Matriz concluiu sem erro.

## [4.7.5] - 2026-08-24

### Corrigido

- A emissão do Diário volta a respeitar a capa visual configurada em Modelos de Documentos, sem reconstruir uma capa genérica nem duplicar logo, título, marca d'água ou slogan.
- Capa e contracapa possuem destinos independentes, e o gerador relê o modelo autoritativo antes de compor o PDF para não reutilizar a arte antiga em cache.
- Professor e Coordenador voltam a ter slots digitais explícitos e posicionáveis na página de validação.

### Segurança e qualidade

- Novas emissões congelam a capa no manifesto V3 por URL, MIME, dimensões, tamanho e SHA-256, mantendo a finalização dos manifestos V1/V2 históricos.
- A migration V3, a Edge Function v14 e a aplicação web foram publicadas em Produção pela PR #85; o contrato remoto preserva V1/V2 históricos, exige V3 para novas emissões e mantém JWT/ACLs restritivos.

## [4.7.4] - 2026-08-23

### Alterado

- O fechamento operacional da entrega 4.7.3 foi sincronizado no lote ativo, no registro de alterações e no índice RAG versionado.

### Segurança e qualidade

- A publicação funcional permanece inalterada; esta revisão registra CI, Vercel Produção, rotas públicas e a versão estável exibida pelos portais.

## [4.7.3] - 2026-08-23

### Corrigido

- As turmas técnicas e livres temporárias voltaram a aparecer no Gestor pelo contrato acadêmico canônico, sem coerção incorreta dos indicadores numéricos.
- O portal do Professor passou a reutilizar o mesmo Diário do Gestor, com frequência, conteúdo, notas, fechamento, prévia oficial e assinatura eletrônica.
- Capa, contracapa, campos, marca d’água e posições de assinatura do Diário agora são consumidos diretamente de Modelos de Documentos e Configurações, com falha explícita para capa raster legada incompatível.

### Adicionado

- Professores com atribuição de coordenação recebem, no próprio portal, a caixa de revisão e a segunda assinatura do Diário; o papel de acesso continua sendo Professor.
- O Gestor recebeu o módulo Assinaturas com cards de Diários, Contratos e Matrículas, filtros, caixa/acervo, documentos finais, comprovantes e atalhos para o Diário assinado dentro da turma; categorias sem pipeline próprio permanecem explicitamente indisponíveis.
- O Diário assinado termina automaticamente com duas páginas vetoriais de evidências, além do comprovante independente para validação.
- Uma skill operacional permanente obriga novos geradores de PDF a reutilizarem os modelos e a marca d’água configurados antes de qualquer fallback.

### Segurança e qualidade

- O fluxo continua Professor → Coordenador, exige reautenticação e preserva provas individuais, manifesto semântico, hashes e compatibilidade histórica; divergências de papel, posição ou geometria do modelo falham antes da emissão.
- Os testes temporários cobrem Professor, Professor coordenador, Aluno e Responsável; nenhuma cobrança, boleto ou operação Banese é criada.

## [4.7.2] - 2026-08-23

### Corrigido

- Logout, retorno dos seletores de perfil e primeiro acesso agora limpam a sessão local com segurança, preservando outros dispositivos apenas nos encerramentos automáticos.
- A grade técnica ganhou rótulos explícitos, horários sugeridos coerentes e remoção da sugestão ao trocar para outra carga; a Ficha de Matrícula repara a grade eleitoral sem danificar estruturas externas.

### Adicionado

- O atalho “Novo Registro” do Dashboard passa a oferecer Responsável pelo fluxo canônico existente.

### Segurança e qualidade

- O escopo RLS de Parceiros falha fechado para polo nulo, a reconciliação de convites foi reforçada e os contratos críticos passaram a integrar o gate do GitHub.

## [4.7.1] - 2026-08-22

### Alterado

- O fechamento operacional da entrega 4.7.0 foi sincronizado no lote ativo, no histórico de alterações e no índice RAG versionado.

### Segurança e qualidade

- A publicação funcional já validada permanece inalterada; esta revisão atualiza somente os registros operacionais e a versão exibida pelos portais.

## [4.7.0] - 2026-08-22

### Adicionado

- Cursos Livres passam a usar uma jornada presencial completa, com turma, professor responsável único, grade, aulas e diário integrados.
- A Gestão pode preparar e publicar uma avaliação final com banco mínimo de 50 questões; cada tentativa recebe dez questões únicas sorteadas no servidor.
- O Portal do Aluno reúne resumo acadêmico, diário, atividades, notas, prova final e certificado do Curso Livre.
- Cada aluno pode herdar o plano financeiro padrão da turma ou receber uma condição individual de 1 a 60 parcelas, com descontos, juros e multa autorizados.
- As avaliações EAD passam a preservar rascunhos, confirmar respostas pelo servidor e exibir o retorno correto somente no momento autorizado.
- Os cards de Cursos Técnicos mostram a quantidade de disciplinas e o progresso acadêmico canônico de cada turma.

### Alterado

- A conclusão de Curso Livre, o resultado da prova e a solicitação do certificado passam a ocorrer atomicamente no backend.
- A Gestão pode vincular o aluno sem títulos ou gerar os títulos locais no vínculo; a emissão bancária permanece uma ação posterior e separada no Financeiro.
- O Curso Livre de Informática Básica recebeu nove matérias, resumos e conteúdos, carga total de 80 horas e avaliação publicada com 50 questões válidas.
- Os gabaritos dos 63 cursos EAD foram removidos do JSON público e armazenados em cofre privado, com reconstituição exclusiva pelas RPCs autorizadas da Gestão.

### Segurança e qualidade

- Sorteio, correção, elegibilidade, cálculo financeiro, rateio de centavos e conclusão permanecem exclusivamente em RPCs autorizadas, idempotentes e auditáveis.
- Novas tabelas usam RLS e menor privilégio; RPCs críticas usam `SECURITY DEFINER`, `search_path` vazio, locks determinísticos e grants explícitos.
- A revisão final fechou a máscara do primeiro retorno financeiro, serializou início e entrega da prova por matrícula e passou a exigir soma exata da grade antes de concluir o salvamento.
- Mutações e conclusão EAD foram serializadas, e os indicadores dos cards técnicos passaram a falhar de modo explícito diante de payload incompleto.
- Fotografias parciais de prova e contagens acadêmicas vazias ou apenas coercíveis também passam a falhar fechadas no cliente.
- Contratos acadêmicos, financeiros e de interface, TypeScript, ESLint, limite de linhas e build de produção foram validados antes da publicação.

## [4.6.1] - 2026-08-22

### Adicionado

- O modal de Novo Registro em Parceiros passa a oferecer também o cadastro de Responsável.
- Gestores, Professores e Responsáveis convidados recebem uma tela de criação de senha coerente com os portais atuais.

### Corrigido

- O cadastro de usuário Gestor valida e-mail e CPF antes de enviar o convite, evitando identidade Auth órfã quando os dados internos já colidem.
- O primeiro clique no convite deixa de ser informado como expirado quando a validação falha internamente; somente a expiração real do token usa essa mensagem.
- O retorno do convite usa a rota de recuperação já autorizada em produção e reconhece o tipo assinado pelo Supabase para abrir diretamente a criação de senha.

### Segurança e qualidade

- O acesso institucional fica bloqueado até a criação real da senha, com estado explícito, ledger privado e autorização revalidada no banco e nas Edge Functions.
- Convites pendentes são reconciliados por prova HMAC e operações idempotentes; uma falha interna preserva a identidade para tratamento seguro, sem exclusão automática.
- A identidade órfã do teste reportado foi excluída somente após validação de ausência de senha, sessão, token e vínculos internos.
- Migrations, 20 Edge Functions, contratos focados, TypeScript e build de produção foram validados antes da publicação.

## [4.6.0] - 2026-08-21

### Adicionado

- O Gestor acompanha a confirmação do e-mail do Responsável, pode validar a titularidade por um canal independente, reenviar o primeiro acesso e gerar uma senha temporária exibida somente uma vez.
- O Responsável recebeu primeiro acesso próprio: senha temporária exige troca, os Termos de Uso vigentes são obrigatórios e os dependentes permanecem bloqueados até a conclusão.
- O portal e a administração de Responsáveis foram separados em componentes, hooks, serviços e chaves de consulta do próprio domínio.

### Corrigido

- Depois de criar a senha pelo convite ou pela recuperação, uma conta somente de Responsável volta ao login público compatível, em vez de ser enviada ao login institucional.
- Um convite apagado ou expirado pode ser substituído por um novo e-mail de recuperação sem expor links ou tokens ao Gestor.

### Segurança e qualidade

- A emissão assistida usa marcador Auth exclusivo, reserva serializada, reconciliação, auditoria sem segredo e resposta `no-store`; emissões do Aluno e do Responsável não compartilham o mesmo identificador técnico.
- Reenvios preservam o mesmo identificador até a conclusão canônica, evitando e-mail duplicado quando a confirmação externa fica ambígua; respostas de login com tokens também são explicitamente `no-store`.
- Banco, Edge Function, login, primeiro acesso e interface administrativa possuem contratos focados no fluxo completo do Responsável.
- Os arquivos ativos deste lote foram modularizados por responsabilidade e passaram a obedecer ao teto verificável de 500 linhas; migrations já aplicadas permanecem imutáveis e auditadas como exceção.

## [4.5.1] - 2026-08-21

### Adicionado

- O Gestor pode validar administrativamente o e-mail informado pelo aluno e emitir uma senha temporária exibida uma única vez, somente após confirmação explícita e com trilha de auditoria.
- O primeiro login com senha temporária obriga o aluno a criar uma senha própria antes de aceitar os termos vigentes e acessar o portal.
- A documentação operacional e funcional do sistema foi consolidada, incluindo integrações, módulos, ambiente local, testes e publicação.
- Três novas capas de cursos EAD foram incorporadas ao catálogo público.

### Corrigido

- O relatório do Caixa alinha a prévia ao PDF vetorial, simplifica a posição líquida, reutiliza o mesmo Blob na visualização e apresenta textos operacionais sem expor detalhes internos.
- A criação de turmas com plano financeiro único ganhou um seletor de curso acessível e consistente com os demais formulários.

### Segurança e qualidade

- A senha temporária não é persistida nem repetida na resposta, invalida emissões concorrentes, força troca no primeiro acesso e usa respostas sem cache.
- O gate do GitHub passa a testar confirmação de e-mail, emissão de senha temporária, contrato de runtime e fluxo completo de primeiro acesso.
- O snapshot foi reconciliado por hash com o `main` remoto: arquivos já publicados foram deduplicados e migrations obsoletas substituídas permaneceram fora do commit.

## [4.5.0] - 2026-08-21

### Adicionado

- Acesso multiperfil consistente para Aluno, Responsável, Professor, Coordenador e Gestor, com seleção explícita de contexto e redirecionamento revalidado pelo servidor.
- Primeiro acesso do aluno passa a exigir confirmação de e-mail, aceite vigente e troca de senha antes de abrir o portal ou iniciar checkout próprio.
- Crachá de Preceptor ganha layout CR80 vertical, template fechado por allowlist e snapshot canônico de emissão.

### Corrigido

- O editor e o comprovante de assinatura eletrônica passaram a preservar a tipografia segura, a marca institucional e a geometria canônica da coluna de validação.
- O checkout revalida o contexto do aluno no servidor e não permite que uma exceção administrativa contorne o primeiro acesso do próprio gestor.

### Segurança e qualidade

- As funções de autenticação e checkout preservam seus gates de JWT e validam o contexto retornado pelas RPCs canônicas; respostas de falha permanecem fechadas.
- TypeScript, ESLint, build de produção, testes de acesso, PDF, contratos Supabase e checks Deno dos entrypoints alterados foram aprovados antes da publicação.

## [4.4.1] - 2026-08-20

### Corrigido

- O editor global do carimbo passou a selecionar o QR pelo quadrado realmente impresso, permite ajustar o tamanho de todos os elementos com controles visíveis e informa de forma clara quando a área protegida do QR impede uma alteração.
- Papel do signatário, título e linha decorativa podem ser ocultados do visual; campos probatórios obrigatórios continuam presentes e imutáveis.
- QR, código e endereço de verificação foram organizados em uma coluna própria. O endereço exibido começa por `www.universocc.com.br`, enquanto o conteúdo técnico do QR preserva a URL HTTPS completa.
- O CPF da assinatura exibe somente os dois primeiros e os três últimos dígitos, preservando a validação de registros históricos no formato anterior.

### Segurança e qualidade

- As cinco migrations incrementais de visibilidade, geometria do QR, máscara de CPF e coluna de validação foram preservadas com os identificadores reais do ledger de produção; a migration aplicada de provas individuais não foi editada nem reaplicada.
- Editor, compositor PDF, validador público, Edge Function e contratos de banco foram revisados em conjunto. Foram aprovados 220 testes relevantes, TypeScript, ESLint, formatação, inspeção vetorial do PDF e smoke remoto protegido.
- A Edge `assinatura-eletronica-diario-artefatos` está na versão 9, ativa e com JWT obrigatório.

## [4.4.0] - 2026-08-20

### Adicionado

- Assinatura Eletrônica ganha um único editor livre de carimbo, aplicado automaticamente a todos os signatários autorizados do Diário de Classe.
- Imagem, textos probatórios, linha e QR podem ser movidos e redimensionados; bindings, rótulos, estilos e evidências individuais permanecem protegidos pelo contrato canônico.
- O fluxo técnico do Diário aceita de um a seis signatários canônicos, com ordenação e provas individuais imutáveis, sem separar o modelo visual por Professor e Coordenador.

### Segurança e qualidade

- A marca institucional vem exclusivamente do registro `watermark_landscape_<polo_id>` de Modelos de Documentos, inclusive quando seu recurso canônico é uma data URI; não existe fallback genérico ou edição de marca no editor de assinatura.
- Migrations incrementais v4–v7, Edge Functions com JWT obrigatório e o acervo de assinaturas foram revisados no projeto de produção. A migration já aplicada de provas individuais foi preservada sem edição ou reaplicação.
- Contratos de assinatura, Edge e PDF vetorial, além do build de produção, foram aprovados. A política jurídica do Diário continua desabilitada; por isso não foi criada assinatura real durante a validação.

## [4.3.3] - 2026-08-14

### Adicionado

- Uma pessoa vinculada como Professor e Gestor pode escolher o perfil institucional ao entrar, sem que um redirecionamento do outro portal anule sua escolha.
- O cadastro de Professor consegue reutilizar, de forma controlada, a identidade institucional já existente de um Gestor com CPF e e-mail correspondentes.

### Segurança e qualidade

- A autorização do vínculo usa o UID canônico da sessão, exige escopo do parceiro, acesso global e Configurações, e não aceita identificador Auth enviado pelo navegador.
- O vínculo valida CPF e e-mail, evita colisão com outro Professor e trata concorrência sem concluir o cadastro indevidamente.
- Os contratos de login, autorização e vínculo foram adicionados aos gates de qualidade.

## [4.3.2] - 2026-08-13

### Corrigido

- A conciliação Banese deixa de criar uma execução financeira quando não há título elegível na fila.
- A reserva da fila e a criação da execução passam a ocorrer na mesma transação, evitando ciclos vazios e corridas entre workers.

### Segurança e qualidade

- Execuções vazias legadas e telemetria técnica bem-sucedida recebem retenção estrita após 48 horas; pagamentos, tentativas, transições e falhas continuam preservados.
- O novo entrypoint funciona com os privilégios mínimos do `service_role`, o prune fica restrito ao cron e os entrypoints legados de início e claim foram revogados.
- Três migrations, worker v26, smoke real de fila vazia, teste focal 9/9, `deno check` e revisão independente foram validados antes da publicação.

## [4.3.1] - 2026-08-12

### Adicionado

- Dependências acadêmicas passam a gerar uma única cobrança avulsa para a disciplina refeita, sem transferir o aluno, alterar a matrícula técnica ou criar um novo cronograma do curso.
- A Secretaria configura valor proporcional, desconto de pontualidade, juros e multa em política própria da dependência; cada título congela esses termos em snapshot imutável.
- A prévia mostra disciplina, valor, vencimento e encargos antes da confirmação, e o boleto identifica somente `Disciplina: nome`.

### Segurança e qualidade

- O boleto Banese permanece exclusivo, sem Pix, com baixa bancária e aviso alinhados em 60 dias após o vencimento; baixas presenciais e estornos exigem trilha auditável.
- Turma, curso, reprovação e matrícula deixam de aparecer na apresentação nova ao aluno, no boleto e no resumo do pagamento.
- Títulos históricos mantêm o contrato anterior; cobranças novas exigem uma parcela, `matricula_id` nula, snapshot próprio e liberação acadêmica somente após pagamento comprovado.
- Migration, 11 Edge Functions, contratos Deno, TypeScript, ESLint, `deno check` e build de produção foram validados antes da publicação.

## [4.3.0] - 2026-08-12

### Adicionado

- A Central de Relatórios passa a oferecer resumo por categoria, composição das entradas, fluxo de caixa realizado versus projetado e inadimplência por faixas de atraso.
- Receitas e despesas continuam por competência, enquanto entradas e saídas representam o caixa realizado; os resumos consideram todo o resultado filtrado, sem depender da prévia paginada.

### Segurança e qualidade

- As novas consultas são RPCs protegidas por permissão de Relatórios e polo, com cálculo de agregações e saldo residual no backend.
- A inadimplência passa a respeitar data de corte, descontos, baixas parciais e estornos manuais; a Central deixa de carregar status ou links específicos do gateway de cobrança.
- Foram aprovados contratos financeiros, cache/Realtime, TypeScript, ESLint focal, verificação da Edge Function e build de produção.

## [4.2.0] - 2026-08-12

### Estabilização de produção

- Os cinco relatórios financeiros separados passam a gerar PDF nativo vetorial, com cabeçalho institucional canônico e um único Blob reutilizado na prévia, no download e na impressão.
- Criação e baixa de empréstimos passam a usar a data civil de Maceió, evitando avanço indevido de dia pelo relógio UTC.
- Os runtimes de checkout, cobrança, webhook, CNAB e reconciliação Banese foram republicados com as regras do plano financeiro único já migradas no banco.
- A versão estável consolida a entrega `4.2.0-beta.2`, mantendo as migrations, contratos e históricos publicados sem regravação.

### Qualidade

- O novo exportador foi validado com texto extraível, inspeção de recursos sem imagem A4, renderização das páginas e contratos de Blob único.
- Node local foi alinhado a `24.x`, a versão exigida pelo projeto e usada nas validações de publicação.

## [4.2.0-beta.2] - 2026-08-11

### Adicionado

- Cursos livres e especializações passam a ter plano financeiro único, com parcelas variáveis, snapshots imutáveis e matrícula idempotente.
- Caixa recebe posições operacional, líquida e total; empréstimos ganham liquidação, ajustes, exportação paisagem e separação do crédito do resultado operacional.
- A Central de Relatórios passa a oferecer extrato, entradas, saídas, receitas e despesas por contrato financeiro canônico.

### Corrigido

- Contas a Pagar preserva lançamento, fornecedor, categoria, turma, recibo vetorial e os fluxos auditáveis de edição, cancelamento e estorno.
- A política de Realtime mantém o acesso autorizado à aba Outros Créditos durante a publicação dos relatórios financeiros.
- O extrato financeiro passa a expor corretamente o indicador de conta ativa em todos os retornos da RPC canônica.

### Segurança e qualidade

- Histórico de migrations foi reconciliado com o banco remoto sem reaplicar versões já existentes.
- RPCs legadas de empréstimos receberam `search_path` vazio e grants restritos a `service_role`; as fontes locais usam os IDs efetivamente registrados pelo banco.

## [4.2.0-beta.1] - 2026-08-10

### Adicionado

- Patrimônio passa a ter catálogo empresarial de tipos, edição, baixa parcial ou total por perda, exclusão lógica auditável e posição patrimonial isolada no Caixa.
- A criação de turma técnica passa a ter cinco etapas, vencimento inicial obrigatório, fim previsto sugerido em 24 meses e código de autorização para condições individuais.
- A matrícula técnica passa a ter quatro etapas, com sequência completa do curso, vencimento herdado e editável, bolsa/incentivo autorizado e simulações canônicas de pagamento em dia ou em atraso.

### Alterado

- O total técnico apresenta o curso completo: matrícula, dois ciclos de mensalidades e uma rematrícula quando configurada.
- Valores financeiros usam entrada formatada em real brasileiro; controles internos de gateway e financeiro legado deixam de ser expostos ao usuário final.
- Contratos técnicos e Plano de Curso recebem os refinamentos locais concluídos nos lotes de 10 de agosto.

### Segurança e qualidade

- O código de condição individual fica somente como hash bcrypt, com RBAC financeiro, auditoria, redefinição sem recuperação do segredo e limite de tentativas por gestor e turma.
- O backend impede alteração individual de ciclos, vencimento, juros, multa ou texto do boleto e encerra a sequência financeira no segundo ciclo.
- Publicação organizada em expansão compatível e endurecimento pós-deploy para evitar interrupção entre Supabase e frontend.

## [2.3.0-beta.3] - 2026-08-09

### Corrigido

- O selo do cabeçalho institucional passa a identificar todos os polos pela cidade — Aquidabã, Porto da Folha e Propriá — mantendo `MATRIZ` para Japoatã.

### Qualidade

- A identificação das quatro unidades foi validada em PDFs vetoriais reais, nas orientações retrato e paisagem, com extração de texto e inspeção das páginas renderizadas.

## [2.3.0-beta.2] - 2026-08-09

### Adicionado

- Professores passam a preencher o Plano de Curso das disciplinas atribuídas com aulas planejadas; a Gestão acompanha os estados ausente, rascunho e concluído diretamente na grade.
- O cadastro do aluno e seus documentos oficiais passam a contemplar zona, seção, data de emissão e UF do título eleitoral, além da apresentação formatada de CPF e CEP.
- O Financeiro Técnico passa a permitir pré-vínculo sem cobrança, ativação individual, em lote ou agendada e regras flexíveis por turma e aluno.
- A criação de turma técnica passa a usar quatro etapas — turma, inscrições, financeiro e revisão — com matrícula e rematrícula opcionais.
- Modelos de Documentos ganha uma prévia somente leitura do cabeçalho institucional para matriz e polos, em retrato e paisagem, com a marca-d'água configurada da unidade.

### Corrigido

- A seleção de docentes na grade foi convertida em diálogo compacto, com atualização imediata, Realtime restrito e planejamento de aula autorizado pela regra acadêmica correta.
- O Financeiro Técnico voltou ao visual completo anterior e deixou de fixar matrícula, rematrícula, quantidade de mensalidades, descontos, juros, multas ou políticas de aplicação.
- Ficha Cadastral, Ficha de Matrícula e Pasta de Identificação preservam o modelo configurado, os campos eleitorais e o snapshot histórico durante emissão e reimpressão.
- O Contrato do Aluno passa a usar obrigatoriamente a revisão ativa e juridicamente aprovada, com marca institucional na camada correta e replay do snapshot original.
- A prévia, o download e a impressão da Pasta e da Ficha usam o mesmo PDF vetorial, inclusive no Safari, sem imagem A4 rasterizada.
- Relatórios, documentos elegíveis da Secretaria, Caixa, Financeiro e Parceiros passam a usar o mesmo cabeçalho institucional, com três linhas por coluna, e-mail oficial e espaçamento protegido para textos longos.

### Segurança e qualidade

- RPCs acadêmicas, financeiras e documentais validam identidade, polo, vínculo, estado, revisão esperada e idempotência no backend; títulos emitidos e documentos concluídos mantêm snapshots imutáveis.
- TanStack Query e Realtime foram limitados ao escopo afetado, com supressão segura de ecos locais e recuperação após reconexão.
- As migrations foram aplicadas e auditadas pelo MCP Supabase; TypeScript, ESLint, build, contratos focados e auditorias de PDF vetorial foram aprovados antes desta publicação.

## [2.3.0-beta.1] - 2026-08-06

### Adicionado

- O Gestor passa a ter o módulo Patrimônio, organizado por polo, com cadastro de aquisição, item, quantidade, valor unitário, total canônico, série, observação, busca e visualização em cards ou tabela.
- Financeiro ganha a aba Empréstimos: o crédito entra na Matriz, as parcelas geram uma única Conta a Pagar física e o custo é rateado de forma canônica entre todos ou apenas os polos selecionados.
- O Caixa exibe separadamente o resumo de financiamento e rateios, sem misturar crédito ou amortização ao resultado operacional.

### Alterado

- O submódulo Despesas passa a se chamar Contas a Pagar, mantendo as abas de despesas fixas e variáveis e os lançamentos existentes.
- Contas a Pagar permite desdobrar o valor total de um lançamento parcelado no backend, ou manter o valor informado por parcela em aberto para baixa posterior.

### Segurança e qualidade

- Patrimônio, empréstimos, baixas e rateio usam RPCs idempotentes, RLS por empresa/polo, Realtime direcionado e invalidação TanStack Query por escopo.
- Valores, parcelas, rateios e indicadores financeiros permanecem calculados exclusivamente no backend.

## [2.2.3-beta.29] - 2026-08-05

### Corrigido

- A Pasta de Identificação em lote passa a usar o mesmo seletor compacto da Carteirinha, com escolha por turma ou por todos os alunos ativos do polo.
- Turmas sem alunos ativos deixam de aparecer no seletor e a quantidade do lote é atualizada conforme a seleção.
- O serviço de emissão restringe o lote geral à Pasta de Identificação e mantém outros documentos protegidos contra ampliação acidental do escopo.

### Qualidade

- O fluxo foi validado no Safari com lote geral e turma específica, além de contrato automatizado, TypeScript, ESLint e build de produção.

## [2.2.3-beta.28] - 2026-08-05

### Corrigido

- O cadastro público deixa de confundir o perfil recém-criado com um CPF duplicado e passa a vincular, na mesma transação, o aluno à identidade correta do Auth.
- CPFs, e-mails e identidades realmente existentes recebem a mensagem “Usuário já cadastrado”, com acesso direto a Entrar, Recuperar senha e reenvio seguro da confirmação quando aplicável.
- A criação de usuários internos valida os dados antes do Auth, grava o vínculo canônico e usa a mesma política de senha forte do servidor.
- A configuração de usuários registra todos os eventos Realtime antes de assinar o canal, eliminando a falha que interrompia a tela.
- Ao sair do portal do aluno, o navegador volta ao início público e apenas o aplicativo nativo retorna ao login dedicado do app.
- O atendimento público preserva o mesmo protocolo em oscilações de rede, guarda o acesso no armazenamento nativo e recebe respostas por Realtime com consulta de contingência.
- A abertura de chamado público ganhou idempotência para que uma resposta de rede ambígua não gere protocolos duplicados.
- O chat autenticado recria seus canais e sincroniza mensagens ao retomar o aplicativo ou recuperar a conexão.
- O chat público antes do login não associa mais uma identidade apenas por CPF: o gestor vê “Visitante não autenticado” até a entrada segura do aluno.
- iOS e Android passam a usar a captura/seleção nativa de áudio quando a WebView não oferece `MediaRecorder`, normalizando M4A, MP3 e WAV antes do envio.
- O iOS passa a declarar o uso do microfone para liberar a gravação de mensagens de voz; o Android mantém as permissões no manifesto do novo pacote.
- O boletim deixa de abrir o visualizador legado e passa a usar o visualizador oficial dos demais documentos, com Download PDF, impressão, paginação e campos configurados.
- A prestação de contas do Caixa preserva fielmente a prévia, a logo e o fundo paisagem configurado completo — faixa azul, marca central e curvas — em PNG sem perdas nos relatórios usuais, acrescenta texto selecionável, pesquisável e copiável e estabiliza cada folha no Safari para manter cabeçalho e rodapé nas quatro páginas.

### Alterado

- Felicitações e comunicados não comerciais de relacionamento passam a acompanhar os Termos aceitos, com transparência e controle posterior na Central de Notificações.
- Todos os fluxos de criação, recuperação e troca de senha passam a exigir no mínimo 8 caracteres, letra maiúscula, minúscula e número.

### Qualidade

- O hotfix inclui contratos para vínculo Auth/aluno, criação de gestor, resiliência do chat, permissões nativas, PDFs selecionáveis, visualizador oficial do boletim, ordem de assinatura Realtime e preferências de relacionamento.
