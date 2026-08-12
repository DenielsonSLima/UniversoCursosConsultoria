# Histórico de alterações

Este arquivo registra as mudanças publicadas no sistema. A entrada mais recente deve sempre corresponder ao arquivo `system-version.json`.

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
