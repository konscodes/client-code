// Script to normalize phone numbers in the database
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '.env.local');
const envFile = readFileSync(envPath, 'utf-8');
const envVars = envFile.split('\n').reduce((acc, line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').replace(/^["']|["']$/g, '');
    if (key && value) {
      acc[key] = value;
    }
  }
  return acc;
}, {} as Record<string, string>);

process.env = { ...process.env, ...envVars };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function normalizePhoneNumber(phone: string | null): string {
  if (!phone) return '';
  
  let digits = phone.replace(/\D/g, '');
  
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.substring(1);
  } else if (digits.startsWith('7') && digits.length === 11) {
    digits = digits;
  } else if (digits.length === 10) {
    digits = '7' + digits;
  } else if (digits.length > 11) {
    digits = digits.substring(0, 11);
  } else if (digits.length < 10) {
    return phone; // Return original if too short
  }
  
  if (digits.startsWith('7') && digits.length === 11) {
    return digits;
  }
  
  return phone; // Return original if can't normalize
}

async function normalizePhoneNumbers() {
  console.log('🔍 Fetching all clients with phone numbers...\n');
  
  const { data: clients, error: fetchError } = await supabase
    .from('clients')
    .select('id, phone')
    .not('phone', 'is', null)
    .neq('phone', '');
  
  if (fetchError) {
    console.error('❌ Error fetching clients:', fetchError);
    return;
  }
  
  if (!clients || clients.length === 0) {
    console.log('✅ No clients with phone numbers found.');
    return;
  }
  
  console.log(`Found ${clients.length} clients with phone numbers\n`);
  
  let updated = 0;
  let skipped = 0;
  const updates: Array<{ id: string; oldPhone: string; newPhone: string }> = [];
  
  console.log('Processing phone numbers...\n');
  
  for (const client of clients) {
    const normalized = normalizePhoneNumber(client.phone);
    
    if (normalized === client.phone) {
      skipped++;
      continue;
    }
    
    const { error: updateError } = await supabase
      .from('clients')
      .update({ phone: normalized })
      .eq('id', client.id);
    
    if (updateError) {
      console.error(`❌ Error updating ${client.id}:`, updateError.message);
      continue;
    }
    
    updated++;
    updates.push({
      id: client.id,
      oldPhone: client.phone,
      newPhone: normalized
    });
    
    if (updates.length <= 10) {
      console.log(`✅ ${client.id}: "${client.phone}" → "${normalized}"`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total clients processed: ${clients.length}`);
  console.log(`   ✅ Successfully updated: ${updated}`);
  console.log(`   ⏭️  Skipped (already normalized): ${skipped}`);
  console.log('='.repeat(60));
  
  if (updates.length > 10) {
    console.log(`\n... and ${updates.length - 10} more updates`);
  }
}

// Also normalize company_settings phone
async function normalizeCompanySettingsPhone() {
  console.log('\n🔍 Checking company settings phone...\n');
  
  const { data: settings, error: fetchError } = await supabase
    .from('company_settings')
    .select('id, phone')
    .eq('id', 'default')
    .single();
  
  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('❌ Error fetching company settings:', fetchError);
    return;
  }
  
  if (!settings || !settings.phone) {
    console.log('✅ No company phone to normalize.');
    return;
  }
  
  const normalized = normalizePhoneNumber(settings.phone);
  
  if (normalized === settings.phone) {
    console.log('✅ Company phone already normalized.');
    return;
  }
  
  const { error: updateError } = await supabase
    .from('company_settings')
    .update({ phone: normalized })
    .eq('id', 'default');
  
  if (updateError) {
    console.error('❌ Error updating company phone:', updateError);
    return;
  }
  
  console.log(`✅ Company phone: "${settings.phone}" → "${normalized}"`);
}

normalizePhoneNumbers()
  .then(() => normalizeCompanySettingsPhone())
  .then(() => {
    console.log('\n✅ Phone number normalization completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

