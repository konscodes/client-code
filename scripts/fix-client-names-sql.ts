// Script to generate SQL UPDATE statements for fixing client names
// This uses direct SQL execution via Supabase MCP

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

function extractNameFromNotes(notes: string | null): string | null {
  if (!notes || notes.trim() === '' || notes === '[object Object]' || notes === '?') {
    return null;
  }

  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return null;

  const firstLine = lines[0];

  if (
    firstLine.match(/^[\d\s\+\-\(\)]+$/) ||
    firstLine.includes('@') ||
    firstLine.toLowerCase().includes('механик') ||
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

function extractNameFromText(text: string): string | null {
  if (!text || text.trim() === '') return null;

  let cleaned = text.trim();
  cleaned = cleaned.replace(/[\d\s\+\-\(\)]{8,}/g, '');
  cleaned = cleaned.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '');
  cleaned = cleaned.replace(/т\.\s*\+?[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/тел\.\s*:?\s*[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/M:\s*\+?[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/моб\.\s*:?\s*[\d\s\+\-\(\)]+/gi, '');
  
  const jobTitles = ['механик', 'директор', 'инженер', 'начальник', 'руководитель', 'заместитель', 'главный', 'водитель', 'юрист', 'контакт', 'ОМ', 'ОМТС', 'ММФ', 'ММф'];
  for (const title of jobTitles) {
    cleaned = cleaned.replace(new RegExp(`\\b${title}\\b`, 'gi'), '');
  }
  
  cleaned = cleaned.replace(/ООО\s*["']?[^"']*["']?/gi, '');
  cleaned = cleaned.replace(/["'][^"']*["']/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  if (cleaned.length < 2 || !/[А-Яа-яA-Za-z]/.test(cleaned)) return null;
  
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  const nameWords: string[] = [];
  
  for (const word of words) {
    if (word.match(/^[\d\+\-\(\)]+$/) || word.includes('@') || word.length > 20) break;
    nameWords.push(word);
    if (nameWords.length >= 3) break;
  }
  
  const extractedName = nameWords.join(' ').trim();
  if (extractedName.length >= 2 && extractedName.length <= 50 && /[А-Яа-яA-Za-z]/.test(extractedName)) {
    return extractedName;
  }
  
  return null;
}

async function main() {
  console.log('🔍 Fetching clients with "Unknown" names...\n');
  
  // Use a raw SQL query via the REST API
  const response = await fetch(`${supabaseUrl}/rest/v1/clients?select=id,name,notes&name=eq.Unknown`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });

  if (!response.ok) {
    console.error('❌ Error fetching clients:', response.statusText);
    // Fallback: try with Supabase client
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, notes');
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    const clients = (data || []).filter(c => c.name === 'Unknown');
    processClients(clients);
    return;
  }

  const clients = await response.json();
  processClients(clients);
}

function processClients(clients: Array<{ id: string; name: string; notes: string | null }>) {
  if (clients.length === 0) {
    console.log('✅ No clients with "Unknown" names found.');
    return;
  }

  console.log(`Found ${clients.length} clients with "Unknown" names\n`);
  
  const updates: Array<{ id: string; newName: string; sql: string }> = [];
  let skipped = 0;

  for (const client of clients) {
    const extractedName = extractNameFromNotes(client.notes);
    
    if (!extractedName) {
      skipped++;
      continue;
    }
    
    // Escape single quotes in the name for SQL
    const escapedName = extractedName.replace(/'/g, "''");
    const sql = `UPDATE clients SET name = '${escapedName}' WHERE id = '${client.id}';`;
    
    updates.push({
      id: client.id,
      newName: extractedName,
      sql
    });
  }

  console.log(`\n📊 Processing Summary:`);
  console.log(`   Total clients: ${clients.length}`);
  console.log(`   ✅ Can be updated: ${updates.length}`);
  console.log(`   ⏭️  Skipped (no name found): ${skipped}\n`);

  if (updates.length === 0) {
    console.log('No updates to perform.');
    return;
  }

  // Show sample updates
  console.log('📝 Sample updates (first 10):');
  updates.slice(0, 10).forEach(update => {
    console.log(`   ${update.id}: "${update.newName}"`);
  });
  if (updates.length > 10) {
    console.log(`   ... and ${updates.length - 10} more\n`);
  }

  // Generate SQL file
  const sqlContent = updates.map(u => u.sql).join('\n');
  const sqlPath = join(__dirname, 'fix-client-names-updates.sql');
  require('fs').writeFileSync(sqlPath, sqlContent, 'utf-8');
  
  console.log(`\n✅ Generated SQL file: ${sqlPath}`);
  console.log(`\nTo apply updates, execute the SQL file using Supabase MCP tools.`);
  console.log(`Or run: npx tsx scripts/apply-client-name-updates.ts\n`);
}

main().catch(console.error);

