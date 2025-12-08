#!/usr/bin/env tsx
/**
 * XML to Supabase Comparison Script
 * 
 * This script compares data from servicemk3.xml to Supabase database
 * and lists any missing clients and orders that need to be migrated.
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

interface XMLClient {
  ClientID: string;
  ClientCompany?: string;
  ClientName?: string;
}

interface XMLOrder {
  OrderID: string;
  OrderClientID: string;
  OrderName?: string;
  OrderDate?: string;
}

/**
 * Extract all client IDs from XML
 */
async function extractXMLClients(xmlData: any): Promise<Map<string, XMLClient>> {
  console.log('\n=== Extracting Clients from XML ===');
  
  let tblMain: XMLClient[] = [];
  if (xmlData?.dataroot?.tblMain) {
    tblMain = Array.isArray(xmlData.dataroot.tblMain) 
      ? xmlData.dataroot.tblMain 
      : [xmlData.dataroot.tblMain];
  }
  
  const clientMap = new Map<string, XMLClient>();
  for (const client of tblMain) {
    const clientId = client.ClientID?.toString().trim();
    if (clientId) {
      clientMap.set(clientId, client);
    }
  }
  
  console.log(`Found ${clientMap.size} clients in XML`);
  return clientMap;
}

/**
 * Extract all order IDs from XML
 */
async function extractXMLOrders(xmlData: any): Promise<Map<string, XMLOrder>> {
  console.log('\n=== Extracting Orders from XML ===');
  
  let tblOrders: XMLOrder[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }
  
  const orderMap = new Map<string, XMLOrder>();
  for (const order of tblOrders) {
    const orderId = order.OrderID?.toString().trim();
    if (orderId) {
      orderMap.set(orderId, order);
    }
  }
  
  console.log(`Found ${orderMap.size} orders in XML`);
  return orderMap;
}

/**
 * Fetch all clients from Supabase
 */
async function fetchSupabaseClients(): Promise<Set<string>> {
  console.log('\n=== Fetching Clients from Supabase ===');
  
  const clientIds = new Set<string>();
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
    
    // Extract XML ClientID from Supabase ID (format: "client-{ClientID}")
    for (const client of clients) {
      const match = client.id.match(/^client-(\d+)$/);
      if (match) {
        const xmlClientId = match[1];
        clientIds.add(xmlClientId);
      } else {
        // Also track non-standard IDs
        clientIds.add(client.id);
      }
    }
    
    offset += limit;
    
    if (clients.length < limit) {
      break;
    }
  }
  
  console.log(`Found ${clientIds.size} clients in Supabase`);
  return clientIds;
}

/**
 * Fetch all orders from Supabase
 */
async function fetchSupabaseOrders(): Promise<Set<string>> {
  console.log('\n=== Fetching Orders from Supabase ===');
  
  const orderIds = new Set<string>();
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id')
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
    
    if (!orders || orders.length === 0) {
      break;
    }
    
    // Extract XML OrderID from Supabase ID (format: "order-{OrderID}")
    for (const order of orders) {
      const match = order.id.match(/^order-(\d+)$/);
      if (match) {
        const xmlOrderId = match[1];
        orderIds.add(xmlOrderId);
      } else {
        // Also track non-standard IDs
        orderIds.add(order.id);
      }
    }
    
    offset += limit;
    
    if (orders.length < limit) {
      break;
    }
  }
  
  console.log(`Found ${orderIds.size} orders in Supabase`);
  return orderIds;
}

/**
 * Compare and list missing clients
 */
function compareClients(
  xmlClients: Map<string, XMLClient>,
  supabaseClientIds: Set<string>
): XMLClient[] {
  console.log('\n=== Comparing Clients ===');
  
  const missingClients: XMLClient[] = [];
  
  for (const [xmlClientId, client] of xmlClients.entries()) {
    if (!supabaseClientIds.has(xmlClientId)) {
      missingClients.push(client);
    }
  }
  
  return missingClients;
}

/**
 * Compare and list missing orders
 */
function compareOrders(
  xmlOrders: Map<string, XMLOrder>,
  supabaseOrderIds: Set<string>
): XMLOrder[] {
  console.log('\n=== Comparing Orders ===');
  
  const missingOrders: XMLOrder[] = [];
  
  for (const [xmlOrderId, order] of xmlOrders.entries()) {
    if (!supabaseOrderIds.has(xmlOrderId)) {
      missingOrders.push(order);
    }
  }
  
  return missingOrders;
}

async function main() {
  console.log('Starting XML to Supabase comparison...\n');
  
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
    // Extract data from XML
    const xmlClients = await extractXMLClients(xmlData);
    const xmlOrders = await extractXMLOrders(xmlData);
    
    // Fetch data from Supabase
    const supabaseClientIds = await fetchSupabaseClients();
    const supabaseOrderIds = await fetchSupabaseOrders();
    
    // Compare and find missing items
    const missingClients = compareClients(xmlClients, supabaseClientIds);
    const missingOrders = compareOrders(xmlOrders, supabaseOrderIds);
    
    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`   XML Clients: ${xmlClients.size}`);
    console.log(`   Supabase Clients: ${supabaseClientIds.size}`);
    console.log(`   Missing Clients: ${missingClients.length}`);
    console.log(`   XML Orders: ${xmlOrders.size}`);
    console.log(`   Supabase Orders: ${supabaseOrderIds.size}`);
    console.log(`   Missing Orders: ${missingOrders.length}`);
    
    if (missingClients.length > 0) {
      console.log(`\n❌ Missing Clients (${missingClients.length}):`);
      console.log('─'.repeat(60));
      missingClients.slice(0, 50).forEach((client, index) => {
        const name = client.ClientCompany || client.ClientName || 'Unknown';
        console.log(`   ${index + 1}. ClientID: ${client.ClientID} - ${name}`);
      });
      if (missingClients.length > 50) {
        console.log(`   ... and ${missingClients.length - 50} more`);
      }
      
      // Also output full list to console for easy copy-paste
      console.log(`\n📋 All Missing Client IDs:`);
      console.log(missingClients.map(c => c.ClientID).join(', '));
    } else {
      console.log(`\n✅ All clients are migrated!`);
    }
    
    if (missingOrders.length > 0) {
      console.log(`\n❌ Missing Orders (${missingOrders.length}):`);
      console.log('─'.repeat(60));
      missingOrders.slice(0, 50).forEach((order, index) => {
        const name = order.OrderName || 'Unknown';
        const date = order.OrderDate ? new Date(order.OrderDate).toLocaleDateString() : 'N/A';
        console.log(`   ${index + 1}. OrderID: ${order.OrderID} - ${name} (Client: ${order.OrderClientID}, Date: ${date})`);
      });
      if (missingOrders.length > 50) {
        console.log(`   ... and ${missingOrders.length - 50} more`);
      }
      
      // Also output full list to console for easy copy-paste
      console.log(`\n📋 All Missing Order IDs:`);
      console.log(missingOrders.map(o => o.OrderID).join(', '));
    } else {
      console.log(`\n✅ All orders are migrated!`);
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n=== Comparison Failed ===');
    console.error(error);
    process.exit(1);
  }
}

main();

