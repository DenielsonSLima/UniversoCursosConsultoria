# Lote ativo

Lote: 2026-10-10-revisao-transferencia-cinco-etapas. Revisão solicitada pelo usuário após publicar 4.8.201, dentro do recebimento e ingresso técnico já autorizados para produção. Três frentes independentes: assistente/recuperação, financeiro e regra de 365 dias. Achado confirmado: reselecionar o mesmo aluno no recebimento pela Gestão apaga o rascunho e deixa financeiro sem contexto. Corrigir a seleção idempotente e proteger com teste do hook real. Publicar 4.8.202, preservando migrations e contratos do banco. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-10-revisao-transferencia-cinco-etapas.md`.

Segundo achado confirmado: desligar e religar uma opção financeira antes de aplicar cria uma alteração artificial e pode substituir parcelas personalizadas. Fazer as opções booleanas refletirem somente alterações efetivas e proteger essa preservação por teste.

Relato adicional do usuário durante a revisão: a etapa final rejeita o cronograma logo após conferir. Causa P1 confirmada por consulta do formato real no banco: a comparação por JSON.stringify depende da ordem das propriedades, que difere entre JSONB e o plano reconstruído no cliente. Comparar os campos do plano de forma semântica, preservando bloqueios para alterações reais e mudança da regra; testar resposta com a mesma ordem de propriedades do servidor.

Validação: testes de reprodução, regressões focadas e checks de publicação. O usuário realizará a conferência visual, conforme orientação anterior; não acessar o Safari após a recusa automática por possível conflito com outra automação. Não registrar matrícula ou cobrança real durante a revisão.
