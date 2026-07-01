global.WebSocket = class {};

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para executar este script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  try {
    const { data: allData, error: allErr } = await supabase
      .from('documentos_validacao')
      .select('*')
      .limit(10);

    if (allErr) {
      console.error('Error fetching all:', allErr);
      return;
    }

    console.log('Total documents found (first 10):');
    allData.forEach(d => {
      console.log(`- Cod: ${d.codigo}, Doc: ${d.documento}, Polo: ${d.polo_id}, Aluno: ${d.aluno_id}`);
    });

  } catch (e) {
    console.error('Unexpected error:', e);
  }
}

check();
