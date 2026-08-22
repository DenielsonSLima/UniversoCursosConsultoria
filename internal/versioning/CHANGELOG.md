# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

Histórico anterior: [31/07/2026 a 26/07/2026](./changelog/2026-07-26-a-2026-07-31.md) e [26/07/2026 a 14/07/2026](./changelog/2026-07-14-a-2026-07-26.md).

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

## [2.2.3-beta.27] - 2026-08-05

### Corrigido

- Exportações de relatórios financeiros, Caixa, Parceiros, declarações, certificados e recibos passaram a manter texto real, nítido, pesquisável e selecionável.
- Ficha de Matrícula e Pasta de Identificação deixaram de cortar linhas e campos durante a geração do PDF.
- Documentos em lote agora respeitam orientação por página, e o crachá de estágio compõe frente e verso em uma folha A4 válida.
- Downloads e impressões da Biblioteca usam o PDF original, sem reprocessar páginas pelo canvas.
- Logotipos, marcas d’água, QR Codes, assinaturas, imagens e fundos são aguardados antes da captura; a exportação é bloqueada quando algum ativo ou campo não está pronto.

### Qualidade

- Foi criado um contrato automatizado que impede novos exportadores rasterizados de página inteira fora do gerador central.
- TypeScript, ESLint, build de produção, testes do Caixa e testes de impressão da Secretaria foram validados.

## [2.2.3-beta.26] - 2026-08-04

### Adicionado

- Notificações push passam a aceitar imagem junto ao texto, inclusive uma imagem padrão configurável para felicitações de aniversário.
- A caixa de notificações do aluno ganhou paginação no backend e carregamento incremental para preservar desempenho conforme o histórico cresce.
- A escolha de receber felicitações e comunicados de relacionamento passou a ser separada, explícita, sem seleção prévia e auditável no cadastro ou primeiro acesso.

### Corrigido

- Login e cadastro do aplicativo foram ajustados para diferentes tamanhos de iPhone e Android, sem rolagem ou arrasto indevidos quando o conteúdo cabe na tela.
- O campo de data de nascimento agora respeita a largura do formulário no WebKit, e o fundo azul cobre toda a área segura do aparelho.
- A verificação Cloudflare no aplicativo deixa de exibir o bootstrap com a marca Universo e não é reiniciada apenas por trocar de aba.
- O retorno do login com Google volta diretamente ao aplicativo no iOS e Android, sem manter o aluno preso no navegador.
- A abertura de comunicados recebeu destino próprio com navegação de retorno; notificações de chat continuam no Atendimento.
- O modal do chat móvel agora fica centralizado na área útil, com cabeçalho fixo e rolagem apenas no conteúdo interno.
- A tela de notificações não repete um pedido de permissão do sistema já concedido e diferencia relacionamento de publicidade comercial.

### Plataforma e qualidade

- Builds web e automações de qualidade foram alinhados ao Node.js 24.
- Os projetos nativos iOS e Android foram avançados para o build 26 da versão 1.0.
- TypeScript, ESLint, testes contratuais, build de produção, sincronização Capacitor e builds de simulador iOS e Android foram incluídos na validação desta versão.

## [2.2.3-beta.25] - 2026-08-03

### Alterado

- Todas as unidades passam a atender de segunda a sexta, das 08:00 às 17:00, e aos sábados, das 08:00 às 16:00.
- Domingos e feriados ficam identificados como períodos sem funcionamento.
- Novos polos herdam automaticamente o mesmo horário padrão na configuração de atendimento.
- A listagem de Polos e Filiais passa a manter a matriz sempre no primeiro card, seguida dos demais polos por cidade e nome.

### Qualidade

- A configuração foi conferida nas quatro unidades ativas e na consulta pública anônima usada pelo site.

## [2.2.3-beta.24] - 2026-08-03

### Adicionado

- A página Fale Conosco agora publica automaticamente as unidades ativas cadastradas em Empresas e Polos, incluindo a unidade de Propriá.
- O complemento do endereço passou a ser persistido nos cadastros de empresa e polo e exibido no site público.

### Alterado

- Todas as unidades passaram a exibir os dois números oficiais de WhatsApp, com abertura direta da conversa.
- Endereços, contatos, imagens e horários públicos deixaram de ser duplicados no componente e agora usam uma consulta pública restrita aos campos necessários.
- A landing de cursos técnicos ganhou cards mais compactos, cidade do polo e chamadas de inscrição mais distintas, sem divulgar a quantidade de vagas.

### Corrigido

- A navegação móvel do aluno voltou a receber a permissão de calendário exigida pelo componente.
- Unidades sem horário configurado agora informam que o atendimento está sob consulta, sem exibir uma programação inventada.

### Qualidade

- TypeScript, lint e build de produção foram validados antes da publicação.

## [2.2.3-beta.23] - 2026-08-02

### Adicionado

- A Comunicação do gestor foi reorganizada em Atendimento, Atendimento por polo, Atrasados, Automações, Fluxos, Agentes e Canais e perfis.
- O atendimento público do aplicativo ganhou rota própria, protocolo e histórico persistente, sem exigir login.
- O aluno autenticado agora visualiza disponibilidade, horário e prazo médio do atendimento do seu polo, com criação segura de novas conversas.
- Foi criada a configuração de atendimento por polo, incluindo horários, estado on-line, mensagens, SLA, responsáveis e canais habilitados.

### Alterado

- Atendimento do portal/app e WhatsApp passaram a compartilhar a Central de Atendimento, preservando a identificação do canal de origem.
- Fluxos e automações passaram a apresentar a operação multicanal para mensagem no app, notificação no celular e WhatsApp.
- A navegação e as permissões do gestor foram alinhadas aos novos submódulos de Comunicação.

### Segurança e qualidade

- Abertura de chamados do aluno foi movida para funções atômicas protegidas, com RLS, validação de polo e metadados de protocolo.
- O suporte público usa função de borda, desafio antiabuso e token próprio de retomada, sem expor gravações diretas do banco.
- TypeScript, lint, build de produção e testes de autenticação, acesso e comunicação multicanal foram executados antes da publicação.

## [2.2.3-beta.22] - 2026-08-02

### Adicionado

- O aplicativo do aluno recebeu login exclusivo em `/aluno/login-app`, compacto, imersivo e separado do acesso público do site.
- O cadastro do aplicativo agora usa a rota `/aluno/cadastro-app`, dividida em três etapas próprias para celular: dados pessoais, acesso e endereço.

### Alterado

- Logout, expiração de sessão, recuperação de senha e confirmação de e-mail do aplicativo retornam ao novo login exclusivo.
- O aviso visual sobre proteção e criptografia foi removido da tela de login conforme revisão de interface.
- O cadastro público e o acesso do gestor continuam usando seus fluxos existentes, sem alterações visuais.

### Qualidade

- Build de produção, TypeScript, lint e testes de autenticação foram executados antes da publicação.

## [2.2.3-beta.21] - 2026-08-02

### Alterado

- O ícone instalável do `Universo CC` passou a usar fundo branco puro e totalmente opaco.
- A marca foi recortada pelo próprio contorno e centralizada no canvas, eliminando o deslocamento visual causado pelas margens transparentes do arquivo original.
- Foram gerados ícones versionados em 180, 192 e 512 pixels, com respiro uniforme e cache do aplicativo atualizado para `v3`.

### Qualidade

- A centralização foi validada pelas coordenadas do contorno visível, e os três arquivos foram confirmados sem canal alfa.
- Build de produção, TypeScript, lint e isolamento dos metadados do gestor foram verificados antes da publicação.

## [2.2.3-beta.20] - 2026-08-02

### Corrigido

- A instalação pelo Safari agora identifica corretamente o aplicativo do aluno como `Universo CC`, inclusive quando iniciada pelas páginas públicas de login, cadastro, confirmação ou recuperação de senha.
- O atalho instalado abre o escopo `/aluno/`; sessões válidas seguem para o início do aluno e sessões ausentes ou expiradas retornam para `/aluno/entrar`.
- O ícone do aplicativo passou a usar fundo azul-marinho institucional totalmente opaco, eliminando o fundo preto criado pelo iOS ao compor imagens transparentes.

### Segurança

- O manifesto, os ícones e o service worker permanecem exclusivos do aluno; site institucional, gestor e professor continuam usando os próprios metadados e não são controlados pelo escopo `/aluno/`.

### Qualidade

- Ícones versionados quebram o cache anterior do Safari, e o fluxo de autenticação realiza uma nova carga do documento antes de entrar no portal.
- Build de produção, TypeScript, lint, testes de autenticação e auditoria dos HTMLs gerados foram executados antes da publicação.

## [2.2.3-beta.19] - 2026-08-02

Esta versão consolida integralmente o conjunto de alterações acumuladas nos portais, módulos acadêmicos, financeiro, documentos, integrações, banco de dados, testes e materiais do projeto.

### Adicionado

- O Portal do Aluno agora possui experiência instalável exclusiva em `/aluno/`, com nome `Universo CC`, manifesto próprio, ícones regulares e maskable e tela de abertura institucional.
- A versão mobile recebeu navegação inferior com cinco acessos, componentes compactos por módulo e suporte às áreas seguras de Android e iPhone.

### Alterado

- O acesso do aluno abre em modo standalone quando instalado e preserva login, primeiro acesso, recuperação de senha e retorno seguro para a página solicitada.
- O botão Institucional permanece disponível no login público para acesso ao sistema de gestão em computador e celular.
- Foram incorporadas em uma única publicação as revisões pendentes dos fluxos do gestor, aluno, integrações financeiras, comunicação, secretaria e infraestrutura de dados.

### Removido

- Arquivos legados e materiais locais marcados para exclusão foram retirados do repositório, permanecendo recuperáveis pelo histórico do Git.

### Segurança

- O service worker permanece restrito ao caminho `/aluno/` e não intercepta gestor, professor, Supabase, pagamentos, documentos ou dados acadêmicos privados.
- Falhas temporárias de conexão não encerram a sessão; sessões realmente inválidas retornam ao login do aluno com o destino preservado.

### Qualidade

- Build de produção, TypeScript, lint e verificações de isolamento entre os manifestos do aluno e do gestor foram executados antes da publicação.

## [2.2.3-beta.18] - 2026-07-31

### Corrigido

- Os polos do Caixa passam a respeitar a ordem cronológica de cadastro, mantendo novas unidades ao final da lista.
- A lista de polos do Caixa e os seletores de usuários são atualizados imediatamente após criação ou alteração, sem aguardar a expiração do cache.
- O escopo de polos do Gestor passou a validar identificadores de forma compatível com UUIDs legados do PostgreSQL e permanece fechado diante de configurações ambíguas.

### Segurança

- Respostas dos RPCs do Caixa e do relatório mensal são validadas pelo polo e pela competência solicitados antes de entrarem no cache.
- Perfis globais continuam incluindo polos futuros, enquanto perfis restritos preservam somente as unidades explicitamente concedidas.
- A auditoria confirmou as guardas de autorização dos RPCs financeiros, RLS por polo e ausência de referências de polo órfãs nos usuários ativos.

### Qualidade

- Testes automatizados cobrem ordem de polos, chaves de cache, invalidação Realtime, escopo global/restrito e compatibilidade do polo matriz legado.
