
import { createClient } from '@supabase/supabase-js';

// Substitua pelas suas variáveis de ambiente reais quando for conectar
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://sua-url-supabase.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sua-chave-anonima';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
