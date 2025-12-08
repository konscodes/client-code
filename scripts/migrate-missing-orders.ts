#!/usr/bin/env tsx
/**
 * Migrate Missing Orders Script
 * 
 * This script migrates only the 8 missing orders identified by the comparison script.
 * Order IDs: 22639, 22640, 22641, 22642, 22643, 22644, 22645, 22646
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

// Missing order IDs to migrate
const MISSING_ORDER_IDS = ['22639', '22640', '22641', '22642', '22643', '22644', '22645', '22646'];

// Status mapping (Russian → English)
const STATUS_MAP: Record<string, string> = {
  'Выполнен': 'completed',
  'Принят': 'in-progress',
  'Отменен': 'canceled',
  'Предложение': 'proposal',
};

function mapStatus(russianStatus: string): string {
  return STATUS_MAP[russianStatus] || 'proposal';
}

// Helper function to parse date
function parseDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  
  // Convert to string if it's not already
  const dateString = typeof dateStr === 'string' ? dateStr : String(dateStr);
  const cleaned = dateString.trim();
  
  if (cleaned.length === 10) {
    return new Date(cleaned + 'T00:00:00Z');
  } else if (cleaned.length >= 19) {
    return new Date(cleaned.replace(' ', 'T') + 'Z');
  }
  
  return new Date(cleaned);
}

// Helper function to parse number with comma decimal separator
function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  return parseFloat(value.toString().replace(',', '.'));
}

// Helper function to convert markup ratio
function convertMarkup(ratio: string | undefined): number {
  if (!ratio) return 0;
  const numRatio = parseNumber(ratio);
  return (numRatio - 1) * 100;
}

// Helper function to trim and clean string
function cleanString(value: string | undefined): string {
  if (!value) return '';
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
  OrderClientID: string;
  OrderDate?: string;
  OrderAddTime?: string;
  OrderStatus?: string;
  OrderName?: string;
  OrderType?: string;
  OrderComments?: string;
}

interface XMLWork {
  WorksOrderID: string;
  WorksName?: string;
  WorksPrice?: string;
  WorksFirstPrice?: string;
  WorksQuantity?: string;
  WorksRatio?: string;
  WorksCWorksID?: string;
  ID?: string;
}

/**
 * Fetch client ID mapping from Supabase
 */
async function fetchClientIdMap(): Promise<Map<string, string>> {
  console.log('\n=== Fetching Client ID Mapping ===');
  
  const clientIdMap = new Map<string, string>();
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id')
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
    
    if (!clients || clients.length === 0) {
      break;
    }
    
    for (const client of clients) {
      const match = client.id.match(/^client-(\d+)$/);
      if (match) {
        const xmlClientId = match[1];
        clientIdMap.set(xmlClientId, client.id);
        // Also set with string version to handle any type mismatches
        clientIdMap.set(xmlClientId.toString(), client.id);
      } else {
        // Log non-standard client IDs for debugging
        console.warn(`   Non-standard client ID format: ${client.id}`);
      }
    }
    
    offset += limit;
    
    if (clients.length < limit) {
      break;
    }
  }
  
  console.log(`Found ${clientIdMap.size} clients in Supabase`);
  return clientIdMap;
}

/**
 * Migrate specific orders
 */
async function migrateOrders(
  xmlData: any,
  clientIdMap: Map<string, string>,
  xmlContent: string
): Promise<void> {
  console.log('\n=== Migrating Missing Orders ===');
  
  // Handle both array and single object cases
  let tblOrders: XMLOrder[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }
  
  // Filter to only missing orders
  const ordersToMigrate = tblOrders.filter(order => {
    const orderId = order.OrderID?.toString().trim();
    return orderId && MISSING_ORDER_IDS.includes(orderId);
  });
  
  console.log(`Found ${ordersToMigrate.length} orders to migrate (out of ${MISSING_ORDER_IDS.length} requested)`);
  
  if (ordersToMigrate.length === 0) {
    console.log('No orders found to migrate. Exiting.');
    return;
  }
  
  // First, insert orders
  const ordersToInsert: any[] = [];
  
  for (const order of ordersToMigrate) {
    const xmlClientId = order.OrderClientID?.toString().trim();
    if (!xmlClientId) {
      console.warn(`⚠️  Skipping order ${order.OrderID}: no client ID in XML`);
      continue;
    }
    
    const supabaseClientId = clientIdMap.get(xmlClientId);
    
    if (!supabaseClientId) {
      console.warn(`⚠️  Skipping order ${order.OrderID}: client ${xmlClientId} not found in Supabase`);
      console.warn(`   Available client IDs in map: ${Array.from(clientIdMap.keys()).slice(0, 10).join(', ')}...`);
      continue;
    }
    
    const supabaseOrderId = `order-${order.OrderID}`;
    const createdAt = parseDate(order.OrderDate);
    const updatedAt = parseDate(order.OrderAddTime || order.OrderDate);
    
    const orderData: any = {
      id: supabaseOrderId,
      clientId: supabaseClientId,
      status: mapStatus(order.OrderStatus || ''),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      taxRate: 0,
      globalMarkup: 20,
      currency: 'USD',
      orderType: cleanString(order.OrderType) || '',
      orderTitle: cleanString(order.OrderName) || '',
    };
    
    ordersToInsert.push(orderData);
    console.log(`  ✓ Prepared order ${order.OrderID}: ${order.OrderName || 'Unknown'}`);
  }
  
  // Insert orders
  if (ordersToInsert.length > 0) {
    const { error } = await supabase
      .from('orders')
      .upsert(ordersToInsert, { onConflict: 'id' });
    
    if (error) {
      console.error('Error inserting orders:', error);
      throw error;
    }
    
    console.log(`✓ Migrated ${ordersToInsert.length} orders`);
  }
  
  // Now migrate order jobs for these orders
  let tblWorks: XMLWork[] = [];
  if (xmlData?.dataroot?.tblWorks) {
    tblWorks = Array.isArray(xmlData.dataroot.tblWorks)
      ? xmlData.dataroot.tblWorks
      : [xmlData.dataroot.tblWorks];
  }
  
  // If works not found in main parse, try parsing works section separately using regex
  if (tblWorks.length === 0) {
    console.log('Works not found in main parse, extracting works section separately...');
    const worksMatch = xmlContent.match(/<tblWorks>[\s\S]*?<\/tblWorks>/g);
    
    if (worksMatch && worksMatch.length > 0) {
      const worksSection = worksMatch.join('\n');
      const wrappedWorks = `<dataroot>${worksSection}</dataroot>`;
      
      try {
        const worksParser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '',
          textNodeName: '_text',
          parseAttributeValue: true,
          trimValues: true,
          isArray: (name) => name === 'tblWorks',
        });
        
        const worksData = worksParser.parse(wrappedWorks);
        if (worksData?.dataroot?.tblWorks) {
          tblWorks = Array.isArray(worksData.dataroot.tblWorks)
            ? worksData.dataroot.tblWorks
            : [worksData.dataroot.tblWorks];
        }
      } catch (err) {
        console.error('Error parsing works section separately:', err);
      }
    }
  }
  
  // Filter works to only those for the orders we're migrating
  const worksForOrders = tblWorks.filter(work => {
    const orderId = work.WorksOrderID?.toString().trim();
    return orderId && MISSING_ORDER_IDS.includes(orderId);
  });
  
  console.log(`\n=== Migrating Order Jobs ===`);
  console.log(`Found ${worksForOrders.length} works for the orders being migrated`);
  
  if (worksForOrders.length > 0) {
    // Create mapping: XML OrderID -> Supabase order ID
    const orderIdMap = new Map<string, string>();
    for (const orderId of MISSING_ORDER_IDS) {
      orderIdMap.set(orderId, `order-${orderId}`);
    }
    
    // Group works by order and process
    const worksByOrder = new Map<string, XMLWork[]>();
    for (const work of worksForOrders) {
      const orderId = work.WorksOrderID?.toString().trim();
      if (orderId) {
        if (!worksByOrder.has(orderId)) {
          worksByOrder.set(orderId, []);
        }
        worksByOrder.get(orderId)!.push(work);
      }
    }
    
    // Sort works by ID within each order
    for (const [orderId, works] of worksByOrder.entries()) {
      works.sort((a, b) => {
        const idA = parseInt(a.ID || '0', 10);
        const idB = parseInt(b.ID || '0', 10);
        return idA - idB;
      });
    }
    
    const orderJobsToInsert: any[] = [];
    
    for (const [xmlOrderId, works] of worksByOrder.entries()) {
      const supabaseOrderId = orderIdMap.get(xmlOrderId);
      
      if (!supabaseOrderId) {
        console.warn(`⚠️  Skipping works for order ${xmlOrderId}: order not found`);
        continue;
      }
      
      for (let i = 0; i < works.length; i++) {
        const work = works[i];
        const jobId = `oj-${xmlOrderId}-${i + 1}`;
        
        const lineMarkup = convertMarkup(work.WorksRatio);
        
        const jobData: any = {
          id: jobId,
          orderId: supabaseOrderId,
          jobId: cleanString(work.WorksCWorksID) || '',
          jobName: cleanString(work.WorksName) || 'Unknown',
          description: cleanString(work.WorksName) || 'Unknown',
          quantity: parseNumber(work.WorksQuantity),
          unitPrice: parseNumber(work.WorksFirstPrice) || parseNumber(work.WorksPrice),
          lineMarkup: lineMarkup,
          taxApplicable: true,
          position: i,
        };
        
        orderJobsToInsert.push(jobData);
      }
      
      console.log(`  ✓ Prepared ${works.length} jobs for order ${xmlOrderId}`);
    }
    
    // Insert order jobs
    if (orderJobsToInsert.length > 0) {
      const { error } = await supabase
        .from('order_jobs')
        .upsert(orderJobsToInsert, { onConflict: 'id' });
      
      if (error) {
        console.error('Error inserting order jobs:', error);
        throw error;
      }
      
      console.log(`✓ Migrated ${orderJobsToInsert.length} order jobs`);
    }
  }
}

async function main() {
  console.log('Starting migration of missing orders...\n');
  console.log(`Target Order IDs: ${MISSING_ORDER_IDS.join(', ')}\n`);
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  console.log('Parsing XML...');
  
  // Pre-process XML to fix invalid tags (email addresses as tag names)
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
    console.error('Line:', parseError.lineNumber);
    throw parseError;
  }
  
  if (!xmlData?.dataroot) {
    console.error('Error: Could not parse XML data root');
    process.exit(1);
  }
  
  try {
    // Fetch client ID mapping
    const clientIdMap = await fetchClientIdMap();
    
    // Migrate orders
    await migrateOrders(xmlData, clientIdMap, fixedXmlContent);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration Complete!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n=== Migration Failed ===');
    console.error(error);
    process.exit(1);
  }
}

main();

