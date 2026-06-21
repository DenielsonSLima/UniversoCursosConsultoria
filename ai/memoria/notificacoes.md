# Diretrizes de Notificação do Sistema (Notification Guidelines)

## Regra Fundamental / Core Rule
**PT-BR**: O sistema **NUNCA** deve emitir notificações genéricas no navegador (usando APIs como `new Notification()`, `Notification.requestPermission()`, `alert()`, `confirm()`, etc.).
**EN**: The system **MUST NEVER** emit generic browser notifications (using native APIs like `new Notification()`, `Notification.requestPermission()`, `alert()`, `confirm()`, etc.).

---

## Padrão Existente / Existing Pattern
**PT-BR**: Use sempre o sistema de notificações Toast customizado (`ToastNotification` e `useToast`) já existente no projeto.
**EN**: Always use the custom Toast notification system (`ToastNotification` and `useToast`) already built into the project.

### Componente Principal / Main Component
- **Caminho / Path**: [ToastNotification.tsx](file:///Users/denielson/Desktop/universo-cursos-e-consultoria/modules/gestor/components/ToastNotification.tsx)
- **Caminho Alternativo (Parceiros) / Alternate Path**: [ToastNotification.tsx](file:///Users/denielson/Desktop/universo-cursos-e-consultoria/modules/gestor/parceiros/components/shared/ToastNotification.tsx)

---

## Como Utilizar / How to Use

### 1. Importação / Import
```tsx
import ToastNotification, { useToast } from '../../components/ToastNotification';
// Ou ajuste o caminho relativo conforme o arquivo
```

### 2. Inicialização / Initialization
No seu componente React, obtenha a lista de toasts e funções usando o hook `useToast()`:
```tsx
const { toasts, removeToast, toast } = useToast();
```

### 3. Exibição do Componente no JSX / Rendering the Component
Renderize o container de toasts no retorno do seu componente JSX (geralmente no topo ou final do retorno principal):
```tsx
return (
  <div>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    {/* Resto do seu JSX */}
  </div>
);
```

### 4. Disparando Notificações / Triggering Notifications
Dispare mensagens de sucesso, erro ou informação de forma programática:
```tsx
// Sucesso
toast.success('Título de Sucesso', 'Mensagem detalhada opcional');

// Erro
toast.error('Título de Erro', 'Mensagem detalhada do erro');

// Informação
toast.info('Título Informativo', 'Mensagem informativa opcional');
```

---

## Por que seguir este padrão? / Why follow this pattern?
- **Consistência Visual**: O design do ToastNotification segue a identidade visual do projeto, com suporte a micro-animações elegantes.
- **Experiência do Usuário (UX)**: Notificações nativas de navegador pedem permissões invasivas e têm aparências que variam por sistema operacional, poluindo a interface e gerando atritos para o usuário.
