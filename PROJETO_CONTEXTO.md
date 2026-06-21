# Universo Cursos e Consultoria — Contexto do Sistema (RAG Memory)

## O que é este projeto
Plataforma online de gestão acadêmica e escolar para controle de alunos, polos, cursos (EAD, presenciais, especializações), matrículas, geração de documentos (carteirinhas de estudante, declarações de matrícula, demonstrativos de IRPF, termos de estágio, crachás) e assinaturas autorizadas.

## Stack tecnológica
- Frontend: React + TypeScript + Vite
- Estilo: TailwindCSS (onde aplicável) / Vanilla CSS (nos layouts/documentos)
- Banco de dados: Supabase (PostgreSQL + RLS + Storage para uploads de imagens/PDFs)
- Estado e Sincronização: TanStack Query + Zustand

## Arquitetura e estrutura de pastas
- `/modules`: Componentes e views de negócio divididos por área (gestor, secretaria, public, etc.)
- `/modules/gestor/cadastros/modelos-documentos`: Editores visuais interativos e previews de documentos.
- `/lib`: Utilitários acadêmicos e auxiliares (ex: `academicUtils.ts` para formatação de matrículas).

## Decisões técnicas importantes
- **Persistência Online (Supabase):** PROIBIDO usar `localStorage` para persistir configurações de polo, templates, layouts, assinaturas digitalizadas ou qualquer parâmetro de negócio. A plataforma é escolar online e multi-usuário, devendo usar exclusivamente o Supabase para persistir dados estruturais globalmente.
- **Cálculos via Supabase RPC:** O frontend é puramente visual e burro. Nenhuma regra de cálculo (financeiro, acadêmico ou regras de negócio críticas) deve ser programada no cliente. Toda a lógica de cálculo deve ser executada no banco de dados via RPC (Remote Procedure Calls / Stored Procedures / Database Functions).
- **Sincronização Realtime e TanStack Query:** Para manter o estado sincronizado e ágil, utilizamos atualizações em tempo real (Supabase realtime subscriptions) para invalidar chaves de cache no TanStack Query (`@tanstack/react-query`), que centraliza o controle de cache do servidor no frontend.
- **Tabela de templates (`documentos_templates`):** Criada no Supabase para guardar as configurações JSON dos modelos (`carteirinha`, `cracha`, `diplomas`, `assinaturas`, `academicos_config`, `declaracao_*`, `irpf_*`, `estagio_*`).
- **Comunicação por Agentes e RAG:** A IA opera com agentes e subagentes autônomos. Toda alteração estrutural deve atualizar os arquivos de RAG (`PROJETO_CONTEXTO.md` e `PROJETO_ALTERACOES.md`) para que o conhecimento persista entre as chamadas do modelo.

## Erros comuns — não repita
- **Mensagens Genéricas do Navegador:** Nunca use `alert()`, `confirm()` ou `prompt()` do navegador. Mensagens genéricas violam a estética da UI e o controle do sistema. Use o padrão de toast da UI (`useToast`).
- **Cálculos no Frontend:** Evite fazer adições, multiplicações financeiras ou validações complexas de data/valores diretamente em componentes. Chame um RPC do Supabase para processar e retornar o resultado de forma transacional segura.
- **LocalStorage Stale:** Nunca assuma que os valores no `localStorage` estão atualizados ou confie neles para regras de negócio. Use `sessionStorage` para sessões locais e a base do Supabase para toda persistência.
