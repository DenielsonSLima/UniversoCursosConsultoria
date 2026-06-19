import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.REACT_APP_SUPABASE_URL': JSON.stringify(env.REACT_APP_SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://kfekgwyqozhicpfuunpo.supabase.co'),
        'process.env.REACT_APP_SUPABASE_ANON_KEY': JSON.stringify(env.REACT_APP_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_EHuK9E4fljLZSess2H9voQ_0nxt-x3a'),
        // Modo da aplicação: 'development' (local) ou 'production' (Vercel)
        'import.meta.env.VITE_APP_MODE': JSON.stringify(env.VITE_APP_MODE || 'production'),
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-router-dom', 'lucide-react']
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
