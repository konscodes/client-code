#!/usr/bin/env tsx
/**
 * Sync Order Time Estimate from XML - Batch Update
 * 
 * Updates all orders at once using a single SQL UPDATE with VALUES clause.
 * This is much faster than individual updates.
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

// SSH connection details
const SSH_HOST = process.env.SSH_HOST || 'yandex-vm';
const DOCKER_COMPOSE_PATH = '~/supabase/docker';

interface XMLOrder {
  OrderID: string;
  OrderTime?: string;
}

// Helper function to clean string
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

// Execute SQL on remote database using base64 to avoid quote issues
async function executeSQL(sql: string): Promise<{ stdout: string; stderr: string }> {
  const base64Sql = Buffer.from(sql).toString('base64');
  const command = `ssh ${SSH_HOST} "cd ${DOCKER_COMPOSE_PATH} && echo ${base64Sql} | base64 -d | sudo docker compose exec -T db psql -U postgres -d postgres"`;
  
  return execAsync(command);
}

async function syncOrderTimeEstimates() {
  console.log('Starting Order Time Estimate sync from XML (Batch Update)...\n');
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  let xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  console.log('Pre-processing XML to fix invalid tags...');
  // Pre-process XML to fix invalid tags
  xmlContent = xmlContent.replace(/<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)>/g, (match, email) => {
    return `<Email>${email}</Email>`;
  });
  xmlContent = xmlContent.replace(/<ClientEmail>([^<]*)<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)><\/ClientEmail>/g, 
    '<ClientEmail>$1$2</ClientEmail>');
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
    process.exit(1);
  }
  
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
  
  for (const order of tblOrders) {
    const orderId = cleanString(order.OrderID);
    const orderTime = cleanString(order.OrderTime);
    
    if (!orderId) continue;
    
    if (orderTime) {
      const parsed = parseInt(orderTime, 10);
      if (!isNaN(parsed) && parsed > 0) {
        orderTimeMap.set(orderId, parsed);
        validTimes++;
      }
    }
  }
  
  console.log(`OrderTime statistics:`);
  console.log(`  - Valid OrderTime values: ${validTimes}`);
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
  
  // Build VALUES clause for batch update
  console.log('Building batch UPDATE statement...');
  
  const values: Array<{ orderId: string; timeEstimate: number }> = [];
  
  // Get all order IDs from database and match with XML
  const { stdout: ordersStdout } = await executeSQL(`
    SELECT id FROM orders ORDER BY id;
  `);
  
  // Parse order IDs from output
  const orderIdLines = ordersStdout.split('\n').filter(line => line.trim().startsWith('order-'));
  
  for (const dbOrderId of orderIdLines) {
    const match = dbOrderId.match(/order-(\d+)/);
    if (!match) continue;
    
    const xmlOrderId = match[1];
    const orderTime = orderTimeMap.get(xmlOrderId);
    
    if (orderTime !== undefined) {
      values.push({
        orderId: dbOrderId.trim(),
        timeEstimate: orderTime,
      });
    }
  }
  
  console.log(`Found ${values.length} orders to update\n`);
  
  if (values.length === 0) {
    console.log('No updates needed.');
    return;
  }
  
  // Show sample
  console.log('Sample of updates to be applied:');
  for (let i = 0; i < Math.min(5, values.length); i++) {
    const v = values[i];
    const xmlOrderId = v.orderId.replace('order-', '');
    const orderTime = orderTimeMap.get(xmlOrderId);
    console.log(`  - ${v.orderId}: timeEstimate = ${v.timeEstimate} days (from XML OrderTime: ${orderTime})`);
  }
  if (values.length > 5) {
    console.log(`  ... and ${values.length - 5} more`);
  }
  console.log();
  
  // Build single UPDATE statement using UPDATE ... FROM VALUES
  // This updates all orders in one query, preserving updatedAt
  console.log('Executing batch UPDATE (this may take a moment)...');
  
  const valuesClause = values.map(v => {
    const escapedId = v.orderId.replace(/'/g, "''");
    return `('${escapedId}', ${v.timeEstimate})`;
  }).join(',\n    ');
  
  const sql = `
    UPDATE orders
    SET "timeEstimate" = updates.time_estimate
    FROM (VALUES
      ${valuesClause}
    ) AS updates(order_id, time_estimate)
    WHERE orders.id = updates.order_id
      AND orders."timeEstimate" IS DISTINCT FROM updates.time_estimate;
  `;
  
  try {
    const startTime = Date.now();
    const { stdout, stderr } = await executeSQL(sql);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Parse UPDATE count from PostgreSQL output
    const updateMatch = stdout.match(/UPDATE\s+(\d+)/i);
    const updatedCount = updateMatch ? parseInt(updateMatch[1], 10) : 0;
    
    console.log(`\n✓ Batch update complete in ${duration}s!`);
    console.log(`  - Orders updated: ${updatedCount}`);
    console.log(`  - Orders already had correct value: ${values.length - updatedCount}`);
    
    if (stderr && stderr.trim()) {
      console.warn(`  - Warnings: ${stderr.trim()}`);
    }
    
    // Verify a few updates
    console.log('\nVerifying updates...');
    const sampleIds = values.slice(0, 5).map(v => v.orderId);
    const verifySql = `
      SELECT id, "timeEstimate" 
      FROM orders 
      WHERE id IN (${sampleIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})
      ORDER BY id;
    `;
    
    try {
      const { stdout: verifyStdout } = await executeSQL(verifySql);
      console.log('Sample of updated orders:');
      console.log(verifyStdout);
    } catch (error: any) {
      console.warn('Could not verify updates:', error.message);
    }
    
  } catch (error: any) {
    console.error('\nError executing batch update:', error.message);
    console.error('This might be due to SQL size limits. Consider splitting into smaller batches.');
    process.exit(1);
  }
}

// Run the sync
syncOrderTimeEstimates().catch(error => {
  console.error('\n=== Sync Failed ===');
  console.error(error);
  process.exit(1);
});


