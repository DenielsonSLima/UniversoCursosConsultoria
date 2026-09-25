import { supabase } from '../../../../../../../lib/supabase';
import { createExternalTransferClient } from './external-transfer.client';

export const externalTransferService = createExternalTransferClient((name, params) => supabase.rpc(name, params));
