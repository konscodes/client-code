#!/usr/bin/env tsx
/**
 * Fix Order Statuses Script
 * 
 * This script corrects order statuses in the database based on the XML data.
 * Maps orders back to their correct statuses from the XML migration.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yjmnehvlpxzqmtmemkdv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Status mapping (Russian → English) - matches the new mapping
const STATUS_MAP: Record<string, string> = {
  'Выполнен': 'completed',
  'Принят': 'in-progress',
  'Отменен': 'canceled',
  'Предложение': 'proposal',
};

function mapStatus(russianStatus: string): string {
  return STATUS_MAP[russianStatus] || 'proposal';
}

async function fixOrderStatuses() {
  console.log('Starting order status correction...\n');

  // Read XML file
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }

  console.log('Reading and parsing XML file...');
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');

  // Pre-process XML to fix invalid tags
  let fixedXmlContent = xmlContent.replace(/<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)>/g, (match, email) => {
    return `<Email>${email}</Email>`;
  });
  fixedXmlContent = fixedXmlContent.replace(/<ClientEmail>([^<]*)<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)><\/ClientEmail>/g, 
    '<ClientEmail>$1$2</ClientEmail>');
  fixedXmlContent = fixedXmlContent.replace(/<([^>]*@[^>]*)>/g, (match) => {
    const emailMatch = match.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)/);
    if (emailMatch) {
      return emailMatch[1];
    }
    return match;
  });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
    trimValues: true,
    isArray: (name) => {
      const tableNames = ['tblMain', 'tblContacts', 'tblOrders', 'tblWorks'];
      if (tableNames.includes(name)) {
        return true;
      }
      return false;
    },
  });

  let xmlData;
  try {
    xmlData = parser.parse(fixedXmlContent);
  } catch (parseError: any) {
    console.error('XML Parse Error:', parseError.message);
    process.exit(1);
  }

  // Extract orders from XML
  let tblOrders: any[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }

  console.log(`Found ${tblOrders.length} orders in XML\n`);

  // Create mapping: XML OrderID -> Status
  const orderStatusMap = new Map<string, string>();
  for (const order of tblOrders) {
    const xmlOrderId = order.OrderID?.toString();
    const xmlStatus = order.OrderStatus?.toString() || '';
    if (xmlOrderId) {
      const dbStatus = mapStatus(xmlStatus);
      orderStatusMap.set(xmlOrderId, dbStatus);
    }
  }

  console.log(`Created status map for ${orderStatusMap.size} orders\n`);

  // Fetch all migrated orders from database
  console.log('Fetching orders from database...');
  let allOrders: any[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, status')
      .or('id.like.ORD-XML-%,id.like.order-%')
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

  console.log(`Found ${allOrders.length} migrated orders in database\n`);

  // Prepare updates
  const updates: Array<{ id: string; status: string }> = [];
  let unchanged = 0;
  let changed = 0;

  for (const order of allOrders) {
    // Extract XML OrderID from Supabase ID (format: order-22637 or ORD-XML-22637)
    const match = order.id.match(/(?:order-|ORD-XML-)(\d+)/);
    if (match) {
      const xmlOrderId = match[1];
      const correctStatus = orderStatusMap.get(xmlOrderId);
      
      if (correctStatus && order.status !== correctStatus) {
        updates.push({ id: order.id, status: correctStatus });
        changed++;
      } else {
        unchanged++;
      }
    }
  }

  console.log(`Status update summary:`);
  console.log(`- Orders to update: ${changed}`);
  console.log(`- Orders unchanged: ${unchanged}\n`);

  if (updates.length === 0) {
    console.log('No updates needed. All orders have correct statuses.');
    return;
  }

  // Update orders in batches grouped by status (more efficient)
  const batchSize = 100;
  let updated = 0;
  const failedUpdates: Array<{ id: string; status: string }> = [];

  console.log('Updating order statuses...');
  
  // Group updates by status for batch updates
  const updatesByStatus = new Map<string, string[]>();
  for (const update of updates) {
    if (!updatesByStatus.has(update.status)) {
      updatesByStatus.set(update.status, []);
    }
    updatesByStatus.get(update.status)!.push(update.id);
  }

  // Update by status groups using .in() for batch updates
  for (const [status, orderIds] of updatesByStatus.entries()) {
    console.log(`Updating ${orderIds.length} orders to status '${status}'...`);
    
    // Process in batches (Supabase .in() has limits)
    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batch = orderIds.slice(i, i + batchSize);
      
      let retries = 3;
      let success = false;
      
      while (retries > 0 && !success) {
        const { error } = await supabase
          .from('orders')
          .update({ status })
          .in('id', batch);

        if (error) {
          retries--;
          if (retries > 0) {
            console.log(`  Retry ${3 - retries}/3 for batch ${Math.floor(i / batchSize) + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          } else {
            console.error(`  Failed to update batch ${Math.floor(i / batchSize) + 1}:`, error.message);
            // Add failed orders to retry list
            for (const id of batch) {
              failedUpdates.push({ id, status });
            }
          }
        } else {
          success = true;
          updated += batch.length;
          if (updated % 100 === 0 || updated === updates.length) {
            console.log(`  Updated ${updated}/${updates.length} orders...`);
          }
        }
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < orderIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Retry failed updates individually with delays
  if (failedUpdates.length > 0) {
    console.log(`\nRetrying ${failedUpdates.length} failed updates individually...`);
    for (const update of failedUpdates) {
      let retries = 3;
      let success = false;
      
      while (retries > 0 && !success) {
        const { error } = await supabase
          .from('orders')
          .update({ status: update.status })
          .eq('id', update.id);

        if (error) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          } else {
            console.error(`  Failed to update order ${update.id} after 3 retries:`, error.message);
          }
        } else {
          success = true;
          updated++;
          if (updated % 50 === 0) {
            console.log(`  Retry updated ${updated}/${updates.length} orders...`);
          }
        }
      }
      
      // Small delay between individual updates
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`\n✓ Successfully updated ${updated} order statuses`);
  
  // Verify final status distribution
  console.log('\nFinal status distribution:');
  const { data: statusCounts } = await supabase
    .from('orders')
    .select('status')
    .or('id.like.ORD-XML-%,id.like.order-%');

  if (statusCounts) {
    const counts: Record<string, number> = {};
    for (const order of statusCounts) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    for (const [status, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${status}: ${count}`);
    }
  }
}

fixOrderStatuses().catch(console.error);

