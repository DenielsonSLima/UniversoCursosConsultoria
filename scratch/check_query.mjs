global.WebSocket = class {};

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kfekgwyqozhicpfuunpo.supabase.co';
const supabaseAnonKey = 'sb_publishable_EHuK9E4fljLZSess2H9voQ_0nxt-x3a';
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
