import { supabase } from '../../../../../lib/supabase';
import {
  BirthdayAgentSettings,
  BirthdayBankStats,
  BirthdayProjectionRow,
  DEFAULT_BIRTHDAY_SETTINGS,
  DEFAULT_BIRTHDAY_TEMPLATE,
} from './birthday.types';

const mapSettings = (row: any): BirthdayAgentSettings => ({
  id: row?.id,
  enabled: row?.enabled === true,
  sendTime: String(row?.send_time || DEFAULT_BIRTHDAY_SETTINGS.sendTime).slice(0, 5),
  modalities: row?.modalities?.length ? row.modalities : DEFAULT_BIRTHDAY_SETTINGS.modalities,
  enrollmentStatuses: row?.enrollment_statuses?.length
    ? row.enrollment_statuses
    : DEFAULT_BIRTHDAY_SETTINGS.enrollmentStatuses,
  schoolName: row?.school_name || DEFAULT_BIRTHDAY_SETTINGS.schoolName,
  messageTemplate: row?.message_template || DEFAULT_BIRTHDAY_TEMPLATE,
  quoteEnabled: row?.quote_enabled !== false,
  updatedAt: row?.updated_at,
});

export const birthdayAgentService = {
  async getSettings(): Promise<BirthdayAgentSettings> {
    const { data, error } = await supabase
      .from('whatsapp_birthday_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    return mapSettings(data);
  },

  async saveSettings(settings: BirthdayAgentSettings): Promise<BirthdayAgentSettings> {
    const { data, error } = await supabase
      .from('whatsapp_birthday_settings')
      .upsert({
        id: true,
        enabled: settings.enabled,
        send_time: settings.sendTime || DEFAULT_BIRTHDAY_SETTINGS.sendTime,
        modalities: settings.modalities,
        enrollment_statuses: settings.enrollmentStatuses,
        school_name: settings.schoolName || DEFAULT_BIRTHDAY_SETTINGS.schoolName,
        message_template: settings.messageTemplate || DEFAULT_BIRTHDAY_TEMPLATE,
        quote_enabled: settings.quoteEnabled !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return mapSettings(data);
  },

  async getProjection(year = new Date().getFullYear()): Promise<BirthdayProjectionRow[]> {
    const { data, error } = await supabase.rpc('whatsapp_birthday_monthly_projection', {
      p_year: year,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      month_num: Number(row.month_num),
      month_label: row.month_label,
      recipients_count: Number(row.recipients_count || 0),
      estimated_cost: Number(row.estimated_cost || 0),
      currency: row.currency || 'BRL',
    }));
  },

  async getBankStats(): Promise<BirthdayBankStats> {
    const [{ count, error: countError }, { count: quoteCount, error: quoteCountError }, { data, error: samplesError }] = await Promise.all([
      supabase
        .from('whatsapp_birthday_message_bank')
        .select('id', { count: 'exact', head: true })
        .eq('active', true),
      supabase
        .from('whatsapp_birthday_quote_bank')
        .select('id', { count: 'exact', head: true })
        .eq('active', true),
      supabase
        .from('whatsapp_birthday_quote_bank')
        .select('id, quote_text, author')
        .eq('active', true)
        .order('id', { ascending: true })
        .limit(3),
    ]);
    if (countError) throw countError;
    if (quoteCountError) throw quoteCountError;
    if (samplesError) throw samplesError;
    return {
      activeCount: count || 0,
      quoteCount: quoteCount || 0,
      samples: (data || []).map((row: any) => ({
        id: Number(row.id),
        content: `"${row.quote_text}" - ${row.author}`,
      })),
    };
  },
};
