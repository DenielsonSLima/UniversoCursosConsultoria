
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { applicationReadCachePolicy } from './lib/query-cache-policy';
import './styles.css';

// A rota do aluno pertence ao React Router, não é um arquivo físico do pacote.
// O Capacitor deve carregar primeiro o index.html e então entrar nesta rota.
if (Capacitor.isNativePlatform() && ['/', '/index.html'].includes(window.location.pathname)) {
  window.history.replaceState({}, '', '/aluno/login-app');
  document.documentElement.setAttribute('data-aluno-bootstrap', 'true');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      ...applicationReadCachePolicy,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
