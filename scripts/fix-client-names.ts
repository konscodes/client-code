// Script to extract names from notes and update client records
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
const envPath = join(__dirname, '..', '.env.local');
try {
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
} catch (error) {
  console.error('Error loading .env.local:', error);
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Extracts a name from notes text
 * Looks for patterns like:
 * - Full names (First Last or First Middle Last)
 * - First names at the start of notes
 * - Names before phone numbers or emails
 */
function extractNameFromNotes(notes: string | null): string | null {
  if (!notes || notes.trim() === '' || notes === '[object Object]' || notes === '?') {
    return null;
  }

  // Split by newlines and get the first non-empty line
  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return null;
  }

  const firstLine = lines[0];

  // Skip if it's clearly not a name (phone number, email, etc.)
  if (
    firstLine.match(/^[\d\s\+\-\(\)]+$/) || // Phone number
    firstLine.includes('@') || // Email
    firstLine.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/) || // Email pattern
    firstLine.toLowerCase().includes('механик') || // Job title
    firstLine.toLowerCase().includes('директор') ||
    firstLine.toLowerCase().includes('инженер') ||
    firstLine.toLowerCase().includes('начальник') ||
    firstLine.toLowerCase().includes('руководитель') ||
    firstLine.toLowerCase().includes('заместитель') ||
    firstLine.toLowerCase().includes('главный') ||
    firstLine.toLowerCase().includes('через') ||
    firstLine.toLowerCase().includes('от') ||
    firstLine.toLowerCase().includes('тоже') ||
    firstLine.toLowerCase().includes('новый') ||
    firstLine.toLowerCase().includes('старый') ||
    firstLine.toLowerCase().includes('водитель') ||
    firstLine.toLowerCase().includes('юрист') ||
    firstLine.toLowerCase().includes('контакт') ||
    firstLine.toLowerCase().includes('для оплаты') ||
    firstLine.toLowerCase().includes('давал')
  ) {
    // Try the second line if first line is not a name
    if (lines.length > 1) {
      const secondLine = lines[1];
      if (!secondLine.match(/^[\d\s\+\-\(\)]+$/) && !secondLine.includes('@')) {
        return extractNameFromText(secondLine);
      }
    }
    return null;
  }

  return extractNameFromText(firstLine);
}

/**
 * Extracts a name from a text string
 * Handles Russian names (First Middle Last format)
 */
function extractNameFromText(text: string): string | null {
  if (!text || text.trim() === '') {
    return null;
  }

  // Remove common prefixes/suffixes
  let cleaned = text.trim();
  
  // Remove phone numbers, emails, and other patterns
  cleaned = cleaned.replace(/[\d\s\+\-\(\)]{8,}/g, ''); // Phone numbers
  cleaned = cleaned.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, ''); // Emails
  cleaned = cleaned.replace(/т\.\s*\+?[\d\s\+\-\(\)]+/gi, ''); // "т. +7..." patterns
  cleaned = cleaned.replace(/тел\.\s*:?\s*[\d\s\+\-\(\)]+/gi, ''); // "Тел.: ..." patterns
  cleaned = cleaned.replace(/M:\s*\+?[\d\s\+\-\(\)]+/gi, ''); // "M: +7..." patterns
  cleaned = cleaned.replace(/моб\.\s*:?\s*[\d\s\+\-\(\)]+/gi, ''); // "Моб.: ..." patterns
  
  // Remove job titles and common words
  const jobTitles = [
    'механик', 'директор', 'инженер', 'начальник', 'руководитель',
    'заместитель', 'главный', 'водитель', 'юрист', 'контакт',
    'ОМ', 'ОМТС', 'ММФ', 'ММф'
  ];
  
  for (const title of jobTitles) {
    const regex = new RegExp(`\\b${title}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Remove company names in quotes
  cleaned = cleaned.replace(/ООО\s*["']?[^"']*["']?/gi, '');
  cleaned = cleaned.replace(/["'][^"']*["']/g, '');
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Check if we have a valid name (at least 2 characters, contains letters)
  if (cleaned.length < 2 || !/[А-Яа-яA-Za-z]/.test(cleaned)) {
    return null;
  }
  
  // If the cleaned text is too long (likely contains extra info), try to extract just the name part
  // Russian names are typically: First Middle Last (3 words max)
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  // Take first 1-3 words that look like a name
  const nameWords: string[] = [];
  for (const word of words) {
    // Stop if we hit something that looks like a phone, email, or job title
    if (word.match(/^[\d\+\-\(\)]+$/) || word.includes('@') || word.length > 20) {
      break;
    }
    nameWords.push(word);
    // Russian full names are typically 2-3 words
    if (nameWords.length >= 3) {
      break;
    }
  }
  
  const extractedName = nameWords.join(' ').trim();
  
  // Final validation: should be 2-50 characters and contain letters
  if (extractedName.length >= 2 && extractedName.length <= 50 && /[А-Яа-яA-Za-z]/.test(extractedName)) {
    return extractedName;
  }
  
  return null;
}

async function fixClientNames() {
  console.log('🔍 Fetching all clients...\n');
  
  // Fetch all clients and filter for "Unknown" names
  const { data: allClients, error: fetchError } = await supabase
    .from('clients')
    .select('id, name, notes');
  
  if (fetchError) {
    console.error('❌ Error fetching clients:', fetchError);
    return;
  }
  
  if (!allClients || allClients.length === 0) {
    console.log('✅ No clients found.');
    return;
  }
  
  // Filter for clients with "Unknown" names
  const clientList = allClients.filter(c => 
    c.name === 'Unknown' || 
    (c.name && c.name.toLowerCase().includes('unknown'))
  );
  
  if (clientList.length === 0) {
    console.log('✅ No clients with "Unknown" names found.');
    console.log(`   Total clients in database: ${allClients.length}`);
    return;
  }
  
  console.log(`Found ${clientList.length} clients with "Unknown" names (out of ${allClients.length} total)\n`);
  
  let updated = 0;
  let skipped = 0;
  const updates: Array<{ id: string; oldName: string; newName: string }> = [];
  
  console.log('Processing clients...\n');
  
  for (const client of clientList) {
    const extractedName = extractNameFromNotes(client.notes);
    
    if (!extractedName) {
      skipped++;
      console.log(`⏭️  ${client.id}: No name found in notes`);
      continue;
    }
    
    // Update the client
    const { error: updateError } = await supabase
      .from('clients')
      .update({ name: extractedName })
      .eq('id', client.id);
    
    if (updateError) {
      console.error(`❌ Error updating ${client.id}:`, updateError.message);
      continue;
    }
    
    updated++;
    updates.push({
      id: client.id,
      oldName: client.name,
      newName: extractedName
    });
    
    console.log(`✅ ${client.id}: "${client.name}" → "${extractedName}"`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total clients processed: ${clients.length}`);
  console.log(`   ✅ Successfully updated: ${updated}`);
  console.log(`   ⏭️  Skipped (no name found): ${skipped}`);
  console.log('='.repeat(60));
  
  if (updates.length > 0) {
    console.log('\n📝 Sample updates:');
    updates.slice(0, 10).forEach(update => {
      console.log(`   ${update.id}: "${update.oldName}" → "${update.newName}"`);
    });
    if (updates.length > 10) {
      console.log(`   ... and ${updates.length - 10} more`);
    }
  }
}

// Run the script
fixClientNames()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

