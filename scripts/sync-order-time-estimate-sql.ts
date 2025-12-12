#!/usr/bin/env tsx
/**
 * Sync Order Time Estimate from XML using Raw SQL
 * 
 * This script updates existing orders in Supabase with OrderTime values from servicemk3.xml.
 * Uses raw SQL executed directly on the database to ensure updatedAt is preserved.
 */

import { XMLParser } from 'fast-xml-parser';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSH connection details - adjust these if needed
const SSH_HOST = process.env.SSH_HOST || 'yandex-vm';
const DOCKER_COMPOSE_PATH = '~/supabase/docker';

interface XMLOrder {
  OrderID: string;
  OrderTime?: string;
}

// Helper function to clean string (handle arrays from XML parser)
function cleanString(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]).trim() : '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
}

// Execute SQL on remote database
async function executeSQL(sql: string): Promise<{ stdout: string; stderr: string }> {
  // Use base64 encoding to avoid quote escaping issues
  const base64Sql = Buffer.from(sql).toString('base64');
  const command = `ssh ${SSH_HOST} "cd ${DOCKER_COMPOSE_PATH} && echo ${base64Sql} | base64 -d | sudo docker compose exec -T db psql -U postgres -d postgres"`;
  
  return execAsync(command);
}

async function syncOrderTimeEstimates() {
  console.log('Starting Order Time Estimate sync from XML using raw SQL...\n');
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  let xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  console.log('Pre-processing XML to fix invalid tags...');
  // Pre-process XML to fix invalid tags (email addresses as tag names)
  xmlContent = xmlContent.replace(/<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)>/g, (match, email) => {
    return `<Email>${email}</Email>`;
  });
  
  // Also fix unclosed email tags in ClientEmail fields
  xmlContent = xmlContent.replace(/<ClientEmail>([^<]*)<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)><\/ClientEmail>/g, 
    '<ClientEmail>$1$2</ClientEmail>');
  
  // Fix any remaining invalid XML tags
  xmlContent = xmlContent.replace(/<([^>]*@[^>]*)>/g, (match) => {
    const emailMatch = match.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)/);
    if (emailMatch) {
      return emailMatch[1];
    }
    return match;
  });
  
  console.log('Parsing XML...');
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
    trimValues: true,
    alwaysCreateTextNode: false,
    stopNodes: [],
    processEntities: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    parseTagValue: true,
    isArray: (name, jPath, isLeafNode, isAttribute) => {
      const tableNames = ['tblMain', 'tblContacts', 'tblOrders', 'tblWorks', 
                          'tblCatalogMatarials', 'tblCatalogWorks', 'tblContracts',
                          'tblMaterials', 'tblSettings', 'tblDocs', 'tblProcedures',
                          'tblUsers', 'tblEmployees'];
      if (tableNames.includes(name)) {
        return true;
      }
      if (jPath && tableNames.some(tn => jPath.includes(tn))) {
        return true;
      }
      return false;
    },
  });
  
  let xmlData;
  try {
    xmlData = parser.parse(xmlContent);
  } catch (parseError: any) {
    console.error('XML Parse Error:', parseError.message);
    console.error('Line:', parseError.lineNumber);
    process.exit(1);
  }
  
  // Check if we got data
  if (!xmlData?.dataroot) {
    console.error('Error: Could not parse XML data root');
    process.exit(1);
  }
  
  // Handle both array and single object cases
  let tblOrders: XMLOrder[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }
  
  console.log(`Found ${tblOrders.length} orders in XML\n`);
  
  // Build map of OrderID -> OrderTime
  const orderTimeMap = new Map<string, number>();
  let validTimes = 0;
  let invalidTimes = 0;
  
  for (const order of tblOrders) {
    const orderId = cleanString(order.OrderID);
    const orderTime = cleanString(order.OrderTime);
    
    if (!orderId) {
      continue;
    }
    
    if (orderTime) {
      const parsed = parseInt(orderTime, 10);
      if (!isNaN(parsed) && parsed > 0) {
        orderTimeMap.set(orderId, parsed);
        validTimes++;
      } else {
        invalidTimes++;
      }
    } else {
      invalidTimes++;
    }
  }
  
  console.log(`OrderTime statistics:`);
  console.log(`  - Valid OrderTime values: ${validTimes}`);
  console.log(`  - Missing/Invalid OrderTime values: ${invalidTimes}`);
  console.log(`  - Total orders in XML: ${tblOrders.length}\n`);
  
  // Test database connection
  console.log('Testing database connection...');
  try {
    const { stdout } = await executeSQL('SELECT COUNT(*) as total FROM orders;');
    const match = stdout.match(/\s+(\d+)\s+/);
    const totalOrders = match ? parseInt(match[1], 10) : 0;
    console.log(`✓ Connected. Found ${totalOrders} orders in database\n`);
  } catch (error: any) {
    console.error('Error connecting to database:', error.message);
    process.exit(1);
  }
  
  // Build SQL UPDATE statements
  // We'll use a single UPDATE with CASE statements to update all orders at once
  // This explicitly only updates timeEstimate, preserving updatedAt
  console.log('Building SQL update statements...');
  
  const updates: Array<{ orderId: string; timeEstimate: number }> = [];
  
  // Get all order IDs from database and match with XML
  const { stdout: ordersStdout } = await executeSQL(`
    SELECT id FROM orders ORDER BY id;
  `);
  
  // Parse order IDs from output
  const orderIdLines = ordersStdout.split('\n').filter(line => line.trim().startsWith('order-'));
  const dbOrderIds = new Set(orderIdLines.map(line => line.trim()));
  
  for (const dbOrderId of dbOrderIds) {
    const match = dbOrderId.match(/order-(\d+)/);
    if (!match) continue;
    
    const xmlOrderId = match[1];
    const orderTime = orderTimeMap.get(xmlOrderId);
    
    if (orderTime !== undefined) {
      updates.push({
        orderId: dbOrderId,
        timeEstimate: orderTime,
      });
    }
  }
  
  console.log(`Found ${updates.length} orders to update\n`);
  
  if (updates.length === 0) {
    console.log('No updates needed. All orders already have correct timeEstimate values.');
    return;
  }
  
  // Show sample of updates
  console.log('Sample of updates to be applied:');
  const sampleSize = Math.min(10, updates.length);
  for (let i = 0; i < sampleSize; i++) {
    const update = updates[i];
    const xmlOrderId = update.orderId.replace('order-', '');
    const orderTime = orderTimeMap.get(xmlOrderId);
    console.log(`  - ${update.orderId}: timeEstimate = ${update.timeEstimate} days (from XML OrderTime: ${orderTime})`);
  }
  if (updates.length > sampleSize) {
    console.log(`  ... and ${updates.length - sampleSize} more`);
  }
  console.log();
  
  // Update in batches using raw SQL
  // We'll use UPDATE with CASE to update multiple orders at once
  const batchSize = 500; // Larger batches for SQL
  let updated = 0;
  let errors = 0;
  
  console.log(`Updating ${updates.length} orders using raw SQL (preserving updatedAt)...\n`);
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    
    // Build SQL with CASE statement for batch update
    // This only updates timeEstimate, explicitly preserving updatedAt
    const caseStatements = batch.map(update => {
      const escapedId = update.orderId.replace(/'/g, "''");
      return `WHEN id = '${escapedId}' THEN ${update.timeEstimate}`;
    }).join(' ');
    
    const orderIds = batch.map(update => {
      const escapedId = update.orderId.replace(/'/g, "''");
      return `'${escapedId}'`;
    }).join(', ');
    
    // Update each order individually to avoid SQL escaping issues
    // This ensures updatedAt is preserved (only timeEstimate is updated)
    let batchUpdated = 0;
    for (let j = 0; j < batch.length; j++) {
      const update = batch[j];
      const sql = `UPDATE orders SET "timeEstimate" = ${update.timeEstimate} WHERE id = '${update.orderId.replace(/'/g, "''")}' AND "timeEstimate" IS DISTINCT FROM ${update.timeEstimate};`;
      
      try {
        const { stdout } = await executeSQL(sql);
        const updateMatch = stdout.match(/UPDATE\s+(\d+)/i);
        const count = updateMatch ? parseInt(updateMatch[1], 10) : 0;
        if (count > 0) {
          batchUpdated++;
          updated++;
        }
        
        // Show progress every 10 orders
        if ((j + 1) % 10 === 0 || j === batch.length - 1) {
          process.stdout.write(`\r  Processing batch ${Math.floor(i / batchSize) + 1}: ${j + 1}/${batch.length} orders (Total: ${updated}/${updates.length})`);
        }
      } catch (error: any) {
        console.error(`\nError updating ${update.orderId}:`, error.message);
        errors++;
      }
    }
    process.stdout.write('\n'); // New line after batch
    
    const sql = `SELECT 1;`; // Dummy SQL for compatibility
    
    try {
      await executeSQL(sql); // Execute dummy SQL (actual updates done above)
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: Updated ${batchUpdated}/${batch.length} orders (Total: ${updated}/${updates.length})`);
    } catch (error: any) {
      // Ignore dummy SQL errors
    }
  }
  
  console.log(`\n✓ Sync complete!`);
  console.log(`  - Successfully updated: ${updated}`);
  console.log(`  - Errors: ${errors}`);
  
  // Verify a few updates
  console.log('\nVerifying updates...');
  const sampleIds = updates.slice(0, 5).map(u => u.orderId);
  const verifySql = `
    SELECT id, "timeEstimate" 
    FROM orders 
    WHERE id IN (${sampleIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})
    ORDER BY id;
  `;
  
  try {
    const { stdout } = await executeSQL(verifySql);
    console.log('Sample of updated orders:');
    console.log(stdout);
  } catch (error: any) {
    console.warn('Could not verify updates:', error.message);
  }
}

// Run the sync
syncOrderTimeEstimates().catch(error => {
  console.error('\n=== Sync Failed ===');
  console.error(error);
  process.exit(1);
});

