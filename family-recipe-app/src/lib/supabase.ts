import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// These are baked in at build time. If a host builds without them the app used
// to throw right here, during module evaluation -- React never mounted and the
// result was a blank white page with nothing to diagnose from, on a phone with
// no dev tools. Report the state instead and let App render an explanation.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const missingSupabaseVars = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[];

// A placeholder keeps createClient from throwing on its own required-argument
// check when the real values are absent. Nothing using it will succeed, but
// the app boots far enough to say why.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.invalid',
  supabaseAnonKey || 'placeholder-anon-key',
);
