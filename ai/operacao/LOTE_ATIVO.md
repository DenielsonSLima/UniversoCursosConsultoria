# Lote ativo

Estado: PUBLICAÇÃO — REDUÇÃO DE CHAMADAS OCIOSAS 4.8.91; AUTH 4.8.90 PUBLICADO

## Lote: 2026-09-25-reducao-chamadas-ociosas

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-25-reducao-chamadas-ociosas.md`.

- Continuação operacional do incidente: gate privado mantém cron push a cada minuto e evita invocação Edge sem trabalho; 39 cenários aprovados.
- Migration aplicada via MCP no ledger `20260926004328`; quatro pós-checagens aprovadas. Smoke de três execuções naturais às 00:44, 00:45 e 00:46Z aprovado; zero invocações Edge ociosas a partir de 00:44Z na janela observada.
- Manifesto: 8 arquivos; release 4.8.91 para cumprir o contrato de versão das alterações de banco. Preservar migrations aplicadas e publicar somente o manifesto sobre main remoto.

## Incidente anterior: 2026-09-25-incidente-login-logs

Registro e manifesto original: `ai/operacao/registros/alteracoes/2026-09-25-incidente-login-logs.md`.

- Pedido: investigar login travado e pico de ingestão com três agentes; corrigir causas comprovadas.
- Etapa 1: reprodução do bloqueio e agregação de logs por serviço, erro e horário.
- Etapa 2: login institucional e aluno publicados em 4.8.90 pelo PR182; Edge `portal-auth` v16 publicada e migration de validações permanentes aplicada com sucesso.
- Etapa 3: 81 testes integrados e CI aprovados; teste SQL remoto com quatro rejeições e rollback aprovado. Dois formulários aprovados no smoke local; login real às 21:23 locais confirmou recuperação antes da release nova. Produção 4.8.90 e configuração pública conferidas.
- Manifesto: 24 arquivos. Preservados o hotfix remoto 4.8.87 e as mudanças já presentes em main 4.8.89.
- Não emitir, cancelar ou baixar cobranças; preservar migrations aplicadas e alterações paralelas.
- Usuário autorizou corrigir e normalizar o ambiente. Reinício pelo painel expressamente autorizado como exceção ao MCP; causa física da indisponibilidade posterior ao loop segue não confirmada.
- Suporte Supabase acionado e envio confirmado; número não exibido, resposta pelo e-mail da conta, acesso adicional desativado.
- Lote anterior concluído: revisão de transferências, PR177, produção 4.8.85; registro anterior preservado.
