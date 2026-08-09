# Otimização da operação de agentes

Data: 2026-08-09

## Resultado

- Ajustes rápidos passaram a usar um agente, sem memória, lote, RAG, histórico, build ou suíte global.
- Ajustes visuais focados em PDF nativo carregam somente a política de PDFs e validam o exportador/página afetados.
- Mudanças padrão e críticas carregam contexto progressivamente e delegam apenas frentes independentes.
- O lote ativo voltou a conter apenas trabalho corrente; os 16 lotes anteriores foram preservados em `registros/LOTES_ATE_2026-08-09.md`.
- O corpus RAG caiu de 203 para 59 trechos e `search` tornou-se estritamente somente leitura.
- Skills Universo tiveram gatilhos estreitados para não se encadearem automaticamente.

## Limpeza

- Removidos 13 MB de PDFs, PNGs e harnesses regeneráveis de `tmp/`.
- Removidos `ai/memoria/`, `ai/rag/` e `ai/skil/`, duplicatas legadas não autoritativas.
- Nenhum teste-fonte ou migration foi removido: permaneceram 38 testes Supabase e 677 migrations.
- `tmp/` permanece ignorado pelo Git, TypeScript e RAG; validações paralelas podem recriá-lo e a limpeza deve ocorrer somente depois que terminarem.

## PDFs

- A proibição passou a abranger screenshot da página inteira, inclusive pipeline híbrido com texto vetorial/invisível sobre a imagem.
- Canvas permanece permitido somente para recurso isolado, como foto, assinatura, logo, marca-d'água ou QR.
- O teste deixou de chamar o híbrido de aprovado, bloqueia novos usos e registra nove fluxos não conformes em `registros/PDFS_RASTER_LEGADOS.md`.
- Os nove fluxos antigos não foram reescritos neste lote operacional para evitar uma migração ampla sem inspeção individual do PDF real.

## Validações

- TypeScript sem emissão: aprovado.
- Contrato de exportações PDF: aprovado, com nove dívidas legadas explicitamente inventariadas.
- Sintaxe e manifesto RAG: aprovados.
- Frontmatter e YAML das quatro skills Universo: aprovados.
- Índice RAG final atualizado e busca sem mutação: aprovados.

## Verificação controlada posterior

- Um agente com contexto novo localizou o rótulo `Baixar PDF` em um único arquivo e não leu memória, lote, RAG, histórico ou skills.
- A primeira busca desse agente ainda foi mais ampla que o módulo nomeado; AGENTS passou a exigir que a busca inicial fique na pasta indicada.
- No cenário PDF focado, o agente abriu apenas a política PDF e o gerador vetorial do calendário, encontrou a coordenada correta e não carregou memória, lote, RAG, histórico, skill ou build.
- Uma escrita paralela voltou a deixar dois lotes no arquivo ativo; o lote concluído, já preservado em registro próprio, foi retirado e um contrato automático passou a rejeitar mais de um lote.
- `npm run test:agent-operations`: aprovado com um lote, bootstrap local de 10.805 bytes, 11 fontes/59 trechos e busca RAG em aproximadamente 29 ms sem mutação.

## Publicação

Nenhuma operação GitHub, Vercel, Supabase ou produção foi executada.
