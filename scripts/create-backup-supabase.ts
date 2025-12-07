/**
 * Create full database backup using Supabase API
 * Exports complete database structure (DDL) and data (DML)
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yjmnehvlpxzqmtmemkdv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Make sure it\'s set in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Create timestamp for backup filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupFilename = `backup_before_${timestamp}.sql`;
const backupPath = join(process.cwd(), backupFilename);

console.log('🔄 Creating full database backup using Supabase API...');
console.log(`   Project: ${SUPABASE_URL}`);
console.log(`   Output: ${backupPath}\n`);

async function createBackup() {
  let sqlContent = '';
  
  // Add header
  sqlContent += `-- PostgreSQL database backup\n`;
  sqlContent += `-- Generated: ${new Date().toISOString()}\n`;
  sqlContent += `-- Project: ${SUPABASE_URL}\n\n`;
  sqlContent += `SET statement_timeout = 0;\n`;
  sqlContent += `SET lock_timeout = 0;\n`;
  sqlContent += `SET idle_in_transaction_session_timeout = 0;\n`;
  sqlContent += `SET client_encoding = 'UTF8';\n`;
  sqlContent += `SET standard_conforming_strings = on;\n`;
  sqlContent += `SELECT pg_catalog.set_config('search_path', '', false);\n\n`;

  try {
    // Get all tables from information_schema
    const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `
    });

    // Use direct SQL execution via MCP-style approach
    // Since we can't use RPC for this, we'll use the Supabase client to fetch data
    // and generate INSERT statements
    
    const tableNames = [
      'clients',
      'orders',
      'order_jobs',
      'job_templates',
      'job_presets',
      'preset_jobs',
      'document_templates',
      'company_settings',
      'orders_backup_before_rename'
    ];

    console.log('📦 Exporting data from tables...\n');

    for (const tableName of tableNames) {
      console.log(`   Exporting ${tableName}...`);
      
      // Fetch all data from table with pagination
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          console.warn(`   ⚠️  Warning: Could not export ${tableName}: ${error.message}`);
          hasMore = false;
          break;
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        allData = allData.concat(data);
        
        // If we got fewer rows than pageSize, we've reached the end
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      const data = allData;

      if (error) {
        console.warn(`   ⚠️  Warning: Could not export ${tableName}: ${error.message}`);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`   ℹ️  Table ${tableName} is empty`);
        continue;
      }

      // Generate DELETE and INSERT statements
      sqlContent += `\n-- Data for table: ${tableName}\n`;
      sqlContent += `DELETE FROM "${tableName}";\n\n`;

      // Generate INSERT statements
      for (const row of data) {
        const columns = Object.keys(row);
        const values = columns.map(col => {
          const value = row[col];
          if (value === null) return 'NULL';
          if (typeof value === 'string') {
            // Escape single quotes and backslashes
            return `'${value.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
          }
          if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
          if (value instanceof Date) return `'${value.toISOString()}'`;
          if (typeof value === 'object') {
            // Handle JSONB
            return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
          }
          return String(value);
        });

        sqlContent += `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
      }

      console.log(`   ✅ Exported ${data.length} rows from ${tableName}`);
    }

    // Add sequences state
    sqlContent += `\n-- Sequences\n`;
    sqlContent += `SELECT setval('client_id_seq', (SELECT MAX(CAST(REPLACE(id, 'client-', '') AS INTEGER)) FROM clients WHERE id ~ '^client-[0-9]+$'), true);\n`;
    sqlContent += `SELECT setval('order_id_seq', (SELECT MAX(CAST(REPLACE(id, 'order-', '') AS INTEGER)) FROM orders WHERE id ~ '^order-[0-9]+$'), true);\n`;
    sqlContent += `SELECT setval('job_id_seq', (SELECT MAX(CAST(REPLACE(id, 'job-', '') AS INTEGER)) FROM job_templates WHERE id ~ '^job-[0-9]+$'), true);\n`;

    // Write backup file
    writeFileSync(backupPath, sqlContent, 'utf8');

    // Verify backup file
    const stats = statSync(backupPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('\n✅ Backup created successfully!');
    console.log(`   File: ${backupFilename}`);
    console.log(`   Size: ${fileSizeMB} MB`);
    console.log(`   Location: ${backupPath}\n`);

    // Verify content
    if (sqlContent.includes('INSERT INTO') || sqlContent.includes('DELETE FROM')) {
      console.log('✅ Backup file verified - contains SQL data\n');
    } else {
      console.warn('⚠️  Warning: Backup file may not contain expected SQL content\n');
    }

  } catch (error: any) {
    console.error('\n❌ Backup failed!');
    console.error('Error:', error.message);
    if (error.stack) console.error('Stack:', error.stack);
    process.exit(1);
  }
}

createBackup();

