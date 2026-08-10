# Lote ativo

Estado: `PUBLICACAO_EM_ANDAMENTO`

## Lote: 2026-08-10-publicacao-4-2-0-beta-1

- Estado: PUBLICACAO_EM_ANDAMENTO.
- Objetivo: publicar a versão `4.2.0-beta.1` com os lotes concluídos de Patrimônio/Caixa e Financeiro Técnico, preservando a separação dos respectivos manifestos e validações.
- Escopo incluído: catálogo e ciclo de vida patrimonial com posição isolada no Caixa; criação e matrícula técnica em etapas; vencimento padrão; total nominal do curso; autorização segura de bolsa/incentivo; migrations, testes, versionamento e registros correspondentes.
- Fora de escopo até autorização específica: editor/modelo oficial de Contrato, compositor PDF e refinamentos de Plano de Curso; mudança em cobranças já emitidas; reprecificação de títulos históricos; gateways legados; artefatos de build, caches e documentos-fonte brutos.
- Estratégia de produção: expansão compatível no Supabase; publicação do frontend pela PR da versão; confirmação do deploy; revogação dos dois RPCs antigos de override somente depois do frontend novo estar ativo.
- Critérios de aceite: versão e changelog consistentes; migrations versionadas e aplicadas pelo MCP Supabase; TypeScript, testes focados e build aprovados; GitHub publicado por manifesto explícito; Preview/checks aprovados; produção HTTP 200 e smoke autenticado proporcional.
- Validação local: 111 testes focados de Patrimônio/Caixa e Financeiro Técnico aprovados, TypeScript global aprovado e build Vite de 3.445 módulos aprovado para `4.2.0-beta.1`; outros 44 testes locais de Contrato/Plano passaram, mas o lote permanece fora desta release até autorização específica.
- Banco: migration de expansão `secure_technical_individual_conditions` aplicada e verificada; tabelas de código/tentativas sem leitura direta, segredo em bcrypt, RPCs `SECURITY DEFINER` com `search_path` explícito e caminhos legados mantidos somente durante a janela de deploy.
- Responsável pela consolidação: Codex; revisão financeira, de UX e de segurança concluída por três agentes sem achado Critical/Important pendente.
- Pendências: publicar o frontend no GitHub/produção, confirmar os checks e o smoke, aplicar a migration de endurecimento pós-deploy e registrar os identificadores finais.
