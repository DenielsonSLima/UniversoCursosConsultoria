
import { User, Session } from '@supabase/supabase-js';

export interface LoginCredentials {
  email: string;
  password?: string;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: string | null;
}
