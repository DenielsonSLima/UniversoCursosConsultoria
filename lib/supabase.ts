
import { createClient } from '@supabase/supabase-js';

// Busca as variáveis do Vite (import.meta.env) ou do Node/define (process.env)
// Caso não estejam definidas (como no Vercel sem envs configuradas), usa as credenciais de produção como fallback.
const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 
  (typeof process !== 'undefined' ? process.env.REACT_APP_SUPABASE_URL : undefined) || 
  'https://kfekgwyqozhicpfuunpo.supabase.co';

const supabaseAnonKey = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 
  (typeof process !== 'undefined' ? process.env.REACT_APP_SUPABASE_ANON_KEY : undefined) || 
  'sb_publishable_EHuK9E4fljLZSess2H9voQ_0nxt-x3a';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

