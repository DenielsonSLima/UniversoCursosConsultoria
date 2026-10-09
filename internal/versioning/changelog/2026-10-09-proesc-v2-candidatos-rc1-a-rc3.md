# Proesc V2: candidatos anteriores

## [4.8.196-rc.3] - 2026-10-09

- Prepara migration atômica com ativação desligada, preservando a continuidade dos hashes de evidência.
- Valida rollback integral quando um leitor ou escritor diverge e executa o arquivo real em PostgreSQL 17 descartável.
- Instalação, validação do histórico e ativação continuam dependendo de autorização específica.

## [4.8.196-rc.2] - 2026-10-09

- Inclui no inventário exato o leitor de revisão do Caixa encontrado no catálogo, sem alterar sua regra financeira.
- Amplia testes com RLS/ACL observadas, gatilhos reais dos snapshots e concorrência entre página e chave OFF.
- Mantém a implantação e a ativação bloqueadas até autorização própria; não altera dados de produção.

## [4.8.196-rc.1] - 2026-10-09

- Candidato de revisão para compartilhar payloads Proesc V2 repetidos, preservando observações por execução e evidência financeira.
- Validação isolada de SQL, concorrência PostgreSQL 17 e arquivo recuperável com dados sintéticos.
- Recursos permanecem desligados; não aplica migrations, não envia arquivos ao Storage e não remove histórico de produção.

