# Padrão visual compacto do Portal Universo

Referência aprovada pelo usuário em 05–07/11/2026: fontes mais leves, menos altura e respiro útil; informações completas. Esta especificação mantém a identidade azul-marinho/azul do produto e as cores semânticas existentes.

| Elemento | Desktop | Móvel |
| --- | --- | --- |
| Corpo / controles | 13 px, peso 400/500 | 13–14 px; entrada 16 px |
| Metadados / rótulos | 12 px, contraste slate-500/600 | 12 px |
| Título de formulário | 18 px, peso 600 | 18 px |
| Título de página | 22–25 px, peso 500 | 20–22 px |
| Campo | branco, borda #dbe3ed, raio 8 px, altura 38 px | altura mínima 44 px |
| Contorno de foco | azul #4169e1, sombra suave ou outline | mesmo padrão |
| Cartão / formulário | borda #e3e9ee, raio 12–14 px, sombra discreta | ocupa largura disponível |
| Espaçamento entre campos | 12–16 px | 12–16 px |
| Abas | linha ativa inferior 2 px, texto 13 px | rolagem acessível ou seletor próprio |

## Composição

- Cabeçalho curto com título, descrição útil e fechamento acessível.
- Etapas visíveis sem círculos e barras decorativas grandes; não remover progresso nem etapas.
- Agrupamento por assunto, bordas suaves e ícones alinhados ao centro do bloco.
- Botões primários e secundários claros, mantendo ação de voltar/cancelar e bloqueios durante gravação.
- Cartões de Parceiros: quatro colunas a partir do breakpoint XL; três no desktop menor, duas no tablet e uma no celular. Nome completo pode quebrar linha; identidade e contato continuam presentes.
- Não reduzir fonte até tornar CPF, status ou ajuda ilegíveis; ajustar largura, quebra e hierarquia primeiro.
- Não aplicar estilos de tela aos PDFs, documentos de impressão ou captura de modelos.

## Interação dos seletores

`InstitutionalSelect` mantém opção selecionada por ID, pesquisa local com acentos, teclado, ARIA, opção desabilitada, lista vazia, carregamento, erro e validação de obrigatório. Seu painel é próprio do sistema e usa portal para evitar recorte.

Catálogos que admitem texto livre usam `EditableCombobox`; não transformar um campo de vínculo obrigatório em texto livre. Opções autorizadas continuam vindo do serviço existente.

## Referências de implementação

- `modules/shared/components/InstitutionalSelect.tsx` e `institutional-select.css`.
- `modules/gestor/financeiro/components/FinancialSelect.tsx` e `FinancialUnderlineTabs.tsx`.
- `modules/gestor/parceiros/components/formularioparceiros/partner-registration.css`.
- `modules/gestor/parceiros/components/cards/partner-cards.css`.
- Skill versionada: `ai/operacao/skills/universo-interface-compacta/SKILL.md`.

## Aceite

Todos os campos, avisos, status e ações continuam disponíveis. Seletores do escopo não abrem menus nativos. Não há sobreposição, texto recortado ou rolagem horizontal da página no móvel. O smoke exercita os componentes reais; fixtures locais não autorizam dados de produção nem substituem a conferência autenticada.
