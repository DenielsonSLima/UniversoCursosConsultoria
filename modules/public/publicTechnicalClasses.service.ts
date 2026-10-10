import { supabase } from '../../lib/supabase';
import { createPublicTechnicalClassesClient } from './publicTechnicalClasses.client';

export const publicTechnicalClassesService = createPublicTechnicalClassesClient(
  (name, args) => supabase.rpc(name, args),
);
