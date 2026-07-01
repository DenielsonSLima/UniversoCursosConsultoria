import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.REACT_APP_SUPABASE_URL;

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY for local compatibility.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
