import { supabaseUrl, supabasePublishableKey } from './supabase-config.js';

export async function connectEmailAuth() {
  if (!supabaseUrl || !supabasePublishableKey) return null;

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0/+esm');
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { flowType: 'pkce', storageKey: 'meme-room-auth' },
  });
}
