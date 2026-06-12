
import { supabase } from '../../lib/supabase';
import { LoginCredentials, AuthResponse } from './login.types';

export const loginService = {
  async login({ email, password }: LoginCredentials): Promise<AuthResponse> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: error.message,
      };
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    };
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  
  // Função auxiliar para recuperar sessão atual (útil para persistência)
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }
};
