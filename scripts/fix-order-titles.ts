#!/usr/bin/env tsx
/**
 * Fix Order Titles Script
 * 
 * This script updates all orders that were migrated with notesInternal/notesPublic
 * to use the correct orderType and orderTitle fields.
 * 
 * It reads from the XML to get the correct OrderType and OrderName values
 * and updates the Supabase orders table.
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
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Specific order IDs to update
const TARGET_ORDER_IDS = ['22639', '22640', '22641', '22642', '22643', '22644', '22645', '22646'];

// Helper function to trim and clean string
function cleanString(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) {
    // Take first element if array
    return value[0] ? String(value[0]).trim() : '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'object') {
    return '';
  }
  return String(value).trim();
}

interface XMLOrder {
  OrderID: string;
  OrderName?: string;
  OrderType?: string;
  OrderComments?: string;
}

async function main() {
  console.log('Starting order title fix...\n');
  
  // Step 1: Parse XML to get order data
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  console.log('Parsing XML...');
  
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
    xmlData = parser.parse(fixedXmlContent);
  } catch (parseError: any) {
    console.error('XML Parse Error:', parseError.message);
    throw parseError;
  }
  
  if (!xmlData?.dataroot) {
    console.error('Error: Could not parse XML data root');
    process.exit(1);
  }
  
  // Extract orders from XML
  let tblOrders: XMLOrder[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }
  
  console.log(`Found ${tblOrders.length} orders in XML\n`);
  
  // Step 2: Create mapping from XML OrderID to OrderType and OrderName
  const xmlOrderMap = new Map<string, { orderType: string; orderTitle: string }>();
  
  for (const order of tblOrders) {
    const orderId = order.OrderID?.toString().trim();
    if (orderId) {
      const orderType = cleanString(order.OrderType) || '';
      const orderTitle = cleanString(order.OrderName) || '';
      
      // Debug for target orders
      if (TARGET_ORDER_IDS.includes(orderId)) {
        console.log(`XML Order ${orderId}:`);
        console.log(`  Raw OrderType: ${JSON.stringify(order.OrderType)}`);
        console.log(`  Raw OrderName: ${JSON.stringify(order.OrderName)}`);
        console.log(`  Cleaned Type: "${orderType}"`);
        console.log(`  Cleaned Title: "${orderTitle}"`);
        console.log('');
      }
      
      xmlOrderMap.set(orderId, {
        orderType,
        orderTitle,
      });
    }
  }
  
  console.log(`Created mapping for ${xmlOrderMap.size} orders from XML\n`);
  
  // Step 3: Fetch only target orders from Supabase
  console.log(`Fetching target orders from Supabase (${TARGET_ORDER_IDS.length} orders)...`);
  const ordersToUpdate: any[] = [];
  
  // Build list of Supabase order IDs
  const supabaseOrderIds = TARGET_ORDER_IDS.map(id => `order-${id}`);
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, orderType, orderTitle')
    .in('id', supabaseOrderIds);
  
  if (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
  
  if (!orders || orders.length === 0) {
    console.log('No orders found with the specified IDs');
    return;
  }
  
  console.log(`Found ${orders.length} orders in Supabase\n`);
  
  for (const order of orders) {
    // Extract XML OrderID from Supabase ID (format: "order-{OrderID}")
    const match = order.id.match(/^order-(\d+)$/);
    if (match) {
      const xmlOrderId = match[1];
      const xmlData = xmlOrderMap.get(xmlOrderId);
      
      if (xmlData) {
        // Always update if XML has data (even if it matches, to ensure it's set)
        const currentType = order.orderType || '';
        const currentTitle = order.orderTitle || '';
        
        // Check if XML has data to use
        if (xmlData.orderType || xmlData.orderTitle) {
          ordersToUpdate.push({
            id: order.id,
            orderType: xmlData.orderType,
            orderTitle: xmlData.orderTitle,
          });
          console.log(`  Order ${xmlOrderId}:`);
          console.log(`    Title: "${currentTitle || '(empty)'}" → "${xmlData.orderTitle || '(empty)'}"`);
          console.log(`    Type: "${currentType || '(empty)'}" → "${xmlData.orderType || '(empty)'}"`);
        } else {
          console.warn(`  Order ${xmlOrderId}: No data in XML (OrderName/OrderType empty)`);
        }
      } else {
        console.warn(`  Order ${xmlOrderId}: Not found in XML`);
      }
    }
  }
  
  console.log(`Found ${ordersToUpdate.length} orders that need updating\n`);
  
  if (ordersToUpdate.length === 0) {
    console.log('✅ All orders already have correct titles and types!');
    return;
  }
  
  // Step 4: Update orders individually
  console.log('Updating orders...');
  let updated = 0;
  
  for (const order of ordersToUpdate) {
    const { error } = await supabase
      .from('orders')
      .update({
        orderType: order.orderType,
        orderTitle: order.orderTitle,
      })
      .eq('id', order.id);
    
    if (error) {
      console.error(`Error updating order ${order.id}:`, error);
    } else {
      updated++;
      if (updated % 10 === 0 || updated === ordersToUpdate.length) {
        console.log(`  Updated ${updated}/${ordersToUpdate.length} orders...`);
      }
    }
  }
  
  console.log(`\n✅ Successfully updated ${updated} orders!`);
  console.log(`   - orderType: Set from XML OrderType`);
  console.log(`   - orderTitle: Set from XML OrderName`);
}

main().catch((error) => {
  console.error('\n=== Script Failed ===');
  console.error(error);
  process.exit(1);
});

