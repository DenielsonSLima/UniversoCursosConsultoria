import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    // Carregue apenas variáveis explicitamente públicas. Segredos de serviços
    // externos nunca podem ser incorporados ao bundle do navegador.
    const env = loadEnv(mode, '.', ['VITE_', 'REACT_APP_SUPABASE_']);
    const supabaseUrl = env.VITE_SUPABASE_URL || env.REACT_APP_SUPABASE_URL || '';
    const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            nativeTurnstile: path.resolve(__dirname, 'native-turnstile.html'),
          },
        },
      },
      define: {
        'process.env.REACT_APP_SUPABASE_URL': JSON.stringify(supabaseUrl),
        'process.env.REACT_APP_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
        'import.meta.env.REACT_APP_SUPABASE_URL': JSON.stringify(supabaseUrl),
        'import.meta.env.REACT_APP_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
        // Modo da aplicação: 'development' (local) ou 'production' (Vercel)
        'import.meta.env.VITE_APP_MODE': JSON.stringify(env.VITE_APP_MODE || 'production'),
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-router', 'lucide-react']
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'react-router', 'lucide-react'],
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
