import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage = import.meta.env.DEV
    ? 'Missing Supabase environment variables. Please check your .env.local file.'
    : 'Application configuration error. Please contact support.';
  logger.error('Supabase configuration error', new Error(errorMessage));
  throw new Error(errorMessage);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);



