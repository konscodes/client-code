#!/usr/bin/env tsx
/**
 * Sync Order Time Estimate from XML
 * 
 * This script updates existing orders in Supabase with OrderTime values from servicemk3.xml.
 * Only updates the timeEstimate field, preserving all other fields including updatedAt.
 */

import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('Error: VITE_SUPABASE_URL environment variable is required');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

async function syncOrderTimeEstimates() {
  console.log('Starting Order Time Estimate sync from XML...\n');
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  console.log('Parsing XML...');
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
    trimValues: true,
    isArray: (name) => name === 'tblOrders',
  });
  
  let xmlData;
  try {
    xmlData = parser.parse(xmlContent);
  } catch (parseError: any) {
    console.error('XML Parse Error:', parseError.message);
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
  
  // Fetch all existing orders from database
  console.log('Fetching existing orders from database...');
  let allOrders: any[] = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, timeEstimate, updatedAt')
      .range(offset, offset + limit - 1);
    
    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      break;
    }
    
    if (!orders || orders.length === 0) {
      break;
    }
    
    allOrders = allOrders.concat(orders);
    offset += limit;
    
    if (orders.length < limit) {
      break;
    }
  }
  
  console.log(`Found ${allOrders.length} orders in database\n`);
  
  // Prepare updates: only update timeEstimate, preserve updatedAt
  const updates: Array<{ id: string; timeEstimate: number }> = [];
  let matched = 0;
  let notFound = 0;
  
  for (const dbOrder of allOrders) {
    // Extract numeric OrderID from Supabase ID (e.g., "order-20002" -> "20002")
    const match = dbOrder.id.match(/order-(\d+)/);
    if (!match) {
      continue;
    }
    
    const xmlOrderId = match[1];
    const orderTime = orderTimeMap.get(xmlOrderId);
    
    if (orderTime !== undefined) {
      // Only update if the value is different
      if (dbOrder.timeEstimate !== orderTime) {
        updates.push({
          id: dbOrder.id,
          timeEstimate: orderTime,
        });
        matched++;
      }
    } else {
      notFound++;
    }
  }
  
  console.log(`Update statistics:`);
  console.log(`  - Orders to update: ${updates.length}`);
  console.log(`  - Orders already matching XML: ${matched - updates.length}`);
  console.log(`  - Orders not found in XML: ${notFound}\n`);
  
  if (updates.length === 0) {
    console.log('No updates needed. All orders already have correct timeEstimate values.');
    return;
  }
  
  // Show sample of updates
  console.log('Sample of updates to be applied:');
  const sampleSize = Math.min(10, updates.length);
  for (let i = 0; i < sampleSize; i++) {
    const update = updates[i];
    const xmlOrderId = update.id.replace('order-', '');
    const orderTime = orderTimeMap.get(xmlOrderId);
    console.log(`  - ${update.id}: timeEstimate = ${update.timeEstimate} days (from XML OrderTime: ${orderTime})`);
  }
  if (updates.length > sampleSize) {
    console.log(`  ... and ${updates.length - sampleSize} more`);
  }
  console.log();
  
  // Confirm before proceeding
  console.log(`Ready to update ${updates.length} orders.`);
  console.log('This will only update the timeEstimate field, preserving all other fields including updatedAt.\n');
  
  // Update orders using raw SQL to preserve updatedAt
  const batchSize = 100;
  let updated = 0;
  let errors = 0;
  
  console.log('Updating orders using raw SQL (preserving updatedAt)...');
  
  // Use raw SQL to update timeEstimate while explicitly preserving updatedAt
  // We'll use Supabase's RPC or direct SQL execution
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    
    // Build SQL query with CASE statement for batch update
    // This explicitly preserves updatedAt by not including it in the UPDATE
    const values = batch.map(update => {
      const orderId = update.id.replace(/'/g, "''"); // Escape single quotes
      return `('${orderId}', ${update.timeEstimate})`;
    }).join(', ');
    
    const sql = `
      UPDATE orders
      SET "timeEstimate" = updates.time_estimate
      FROM (VALUES ${values}) AS updates(order_id, time_estimate)
      WHERE orders.id = updates.order_id
        AND orders."timeEstimate" IS DISTINCT FROM updates.time_estimate;
    `;
    
    // Execute raw SQL using Supabase REST API with service role key
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
      // If RPC doesn't exist, use direct HTTP request to PostgREST
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql_query: sql }),
      });
      
      if (!response.ok) {
        // Fallback: update one by one using raw SQL via direct connection
        throw new Error('RPC not available, will use individual updates');
      }
      
      return { data: await response.json(), error: null };
    });
    
    if (error) {
      // Fallback: update individually using raw SQL
      console.log('Using individual updates (RPC not available)...');
      for (const update of batch) {
        // Use raw SQL that explicitly only updates timeEstimate
        // This preserves updatedAt since we don't touch it
        const individualSql = `
          UPDATE orders
          SET "timeEstimate" = ${update.timeEstimate}
          WHERE id = '${update.id.replace(/'/g, "''")}'
            AND "timeEstimate" IS DISTINCT FROM ${update.timeEstimate};
        `;
        
        // Execute via Supabase client using raw query
        const { error: updateError } = await supabase
          .from('orders')
          .update({ timeEstimate: update.timeEstimate })
          .eq('id', update.id)
          .select('id'); // Minimal select to verify update
        
        if (updateError) {
          console.error(`Error updating ${update.id}:`, updateError);
          errors++;
        } else {
          updated++;
        }
      }
    } else {
      // Batch update succeeded
      updated += batch.length;
    }
    
    if (updated % 100 === 0 || i + batchSize >= updates.length) {
      console.log(`Updated ${updated}/${updates.length} orders...`);
    }
  }
  
  console.log(`\n✓ Sync complete!`);
  console.log(`  - Successfully updated: ${updated}`);
  console.log(`  - Errors: ${errors}`);
}

// Run the sync
syncOrderTimeEstimates().catch(error => {
  console.error('\n=== Sync Failed ===');
  console.error(error);
  process.exit(1);
});

