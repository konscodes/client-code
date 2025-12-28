#!/usr/bin/env tsx
/**
 * Compare XML Backup to Database Script
 * 
 * Compares XML backup file with Supabase database to identify:
 * - Missing clients (in XML but not in database)
 * - Missing orders (in XML but not in database)
 * - Order status discrepancies
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

async function compareOrderStatuses() {
  console.log('='.repeat(80));
  console.log('XML BACKUP vs PRODUCTION DATABASE COMPARISON');
  console.log('='.repeat(80));
  console.log();

  // Read XML file
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }

  console.log('Reading and parsing XML file...');
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');

  // Extract generation date
  const generatedMatch = xmlContent.match(/generated="([^"]+)"/);
  const generatedDate = generatedMatch ? generatedMatch[1] : 'unknown';
  console.log(`XML Backup Generated: ${generatedDate}\n`);

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

  // Extract clients from XML
  console.log('Extracting clients from XML...');
  let tblMain: any[] = [];
  if (xmlData?.dataroot?.tblMain) {
    tblMain = Array.isArray(xmlData.dataroot.tblMain)
      ? xmlData.dataroot.tblMain
      : [xmlData.dataroot.tblMain];
  }

  // Extract orders from XML
  console.log('Extracting orders from XML...');
  let tblOrders: any[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }

  console.log(`Found ${tblMain.length} clients in XML`);
  console.log(`Found ${tblOrders.length} orders in XML\n`);

  // Create mapping: XML OrderID -> Expected DB Status
  const xmlStatusMap = new Map<string, { xmlStatus: string; expectedDbStatus: string }>();
  for (const order of tblOrders) {
    const xmlOrderId = order.OrderID?.toString();
    const xmlStatus = order.OrderStatus?.toString() || '';
    if (xmlOrderId) {
      const expectedDbStatus = mapStatus(xmlStatus);
      xmlStatusMap.set(xmlOrderId, { xmlStatus, expectedDbStatus });
    }
  }

  console.log(`Created status map for ${xmlStatusMap.size} orders from XML\n`);

  // ============================================================================
  // CHECK FOR MISSING CLIENTS
  // ============================================================================
  console.log('='.repeat(80));
  console.log('CHECKING FOR MISSING CLIENTS');
  console.log('='.repeat(80));
  
  const xmlClientIds = new Set<string>();
  const xmlClientData = new Map<string, any>();
  for (const client of tblMain) {
    const clientId = client.ClientID?.toString();
    if (clientId) {
      xmlClientIds.add(clientId);
      xmlClientData.set(clientId, {
        ClientID: clientId,
        ClientCompany: cleanString(client.ClientCompany),
        ClientPhone: cleanString(client.ClientPhone),
        ClientEmail: cleanString(client.ClientEmail),
      });
    }
  }
  
  console.log(`Found ${xmlClientIds.size} unique clients in XML`);
  
  // Fetch all clients from database
  console.log('Fetching clients from database...');
  let allClients: any[] = [];
  let clientOffset = 0;
  const limit = 1000;

  while (true) {
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id')
      .range(clientOffset, clientOffset + limit - 1);

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      break;
    }

    if (!clients || clients.length === 0) {
      break;
    }

    allClients = allClients.concat(clients);
    clientOffset += limit;

    if (clients.length < limit) {
      break;
    }
  }
  
  const dbClientIds = new Set<string>();
  for (const client of allClients) {
    const match = client.id.match(/^client-(\d+)$/);
    if (match) {
      dbClientIds.add(match[1]);
    }
  }
  
  console.log(`Found ${dbClientIds.size} clients in database`);
  
  const missingClientIds = new Set<string>();
  for (const xmlClientId of xmlClientIds) {
    if (!dbClientIds.has(xmlClientId)) {
      missingClientIds.add(xmlClientId);
    }
  }
  
  if (missingClientIds.size > 0) {
    console.log(`\n⚠️  Found ${missingClientIds.size} clients in XML that are NOT in database:`);
    const missingList = Array.from(missingClientIds).slice(0, 20);
    for (const clientId of missingList) {
      const client = xmlClientData.get(clientId);
      if (client) {
        console.log(`  ClientID: ${clientId}`);
        console.log(`    Company: ${client.ClientCompany || 'N/A'}`);
        console.log(`    Phone: ${client.ClientPhone || 'N/A'}`);
        console.log(`    Email: ${client.ClientEmail || 'N/A'}`);
      }
    }
    if (missingClientIds.size > 20) {
      console.log(`  ... and ${missingClientIds.size - 20} more`);
    }
  } else {
    console.log('\n✓ All clients from XML are in database');
  }
  console.log();

  // ============================================================================
  // CHECK FOR MISSING ORDERS AND STATUS DISCREPANCIES
  // ============================================================================
  console.log('='.repeat(80));
  console.log('CHECKING FOR MISSING ORDERS AND STATUS DISCREPANCIES');
  console.log('='.repeat(80));
  console.log();

  // Fetch all migrated orders from database
  console.log('Fetching orders from database...');
  let allOrders: any[] = [];
  let offset = 0;

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

  // Compare statuses
  const discrepancies: Array<{
    orderId: string;
    xmlOrderId: string;
    xmlStatus: string;
    expectedDbStatus: string;
    actualDbStatus: string;
  }> = [];

  const matches = new Map<string, number>();
  matches.set('completed', 0);
  matches.set('in-progress', 0);
  matches.set('canceled', 0);
  matches.set('proposal', 0);

  for (const order of allOrders) {
    // Extract XML OrderID from Supabase ID (format: order-22637 or ORD-XML-22637)
    const match = order.id.match(/(?:order-|ORD-XML-)(\d+)/);
    if (match) {
      const xmlOrderId = match[1];
      const xmlData = xmlStatusMap.get(xmlOrderId);
      
      if (xmlData) {
        if (order.status !== xmlData.expectedDbStatus) {
          discrepancies.push({
            orderId: order.id,
            xmlOrderId,
            xmlStatus: xmlData.xmlStatus,
            expectedDbStatus: xmlData.expectedDbStatus,
            actualDbStatus: order.status,
          });
        } else {
          matches.set(order.status, (matches.get(order.status) || 0) + 1);
        }
      } else {
        // Order in DB but not in XML
        discrepancies.push({
          orderId: order.id,
          xmlOrderId,
          xmlStatus: 'NOT FOUND IN XML',
          expectedDbStatus: 'UNKNOWN',
          actualDbStatus: order.status,
        });
      }
    }
  }

  // Check for orders in XML but not in DB
  const dbOrderIds = new Set(allOrders.map(o => {
    const match = o.id.match(/(?:order-|ORD-XML-)(\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean));

  for (const [xmlOrderId, xmlData] of xmlStatusMap.entries()) {
    if (!dbOrderIds.has(xmlOrderId)) {
      discrepancies.push({
        orderId: `order-${xmlOrderId} (MISSING)`,
        xmlOrderId,
        xmlStatus: xmlData.xmlStatus,
        expectedDbStatus: xmlData.expectedDbStatus,
        actualDbStatus: 'NOT IN DATABASE',
      });
    }
  }

  // Separate missing orders from status discrepancies
  const missingOrders = discrepancies.filter(d => d.actualDbStatus === 'NOT IN DATABASE');
  const statusDiscrepancies = discrepancies.filter(d => d.actualDbStatus !== 'NOT IN DATABASE');

  // Print results
  console.log('='.repeat(80));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80));
  console.log(`\nXML Backup Date: ${generatedDate}`);
  console.log(`\nClients:`);
  console.log(`  XML: ${xmlClientIds.size}`);
  console.log(`  Database: ${dbClientIds.size}`);
  console.log(`  Missing: ${missingClientIds.size}`);
  console.log(`\nOrders:`);
  console.log(`  XML: ${xmlStatusMap.size}`);
  console.log(`  Database: ${allOrders.length}`);
  console.log(`  Missing: ${missingOrders.length}`);
  console.log(`\nMatching statuses:`);
  for (const [status, count] of matches.entries()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`\nStatus discrepancies: ${statusDiscrepancies.length}`);

  // Show missing orders
  if (missingOrders.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('MISSING ORDERS (in XML but not in database):');
    console.log('='.repeat(80));
    
    // Group by status
    const byStatus = new Map<string, typeof missingOrders>();
    for (const order of missingOrders) {
      const status = order.expectedDbStatus;
      if (!byStatus.has(status)) {
        byStatus.set(status, []);
      }
      byStatus.get(status)!.push(order);
    }

    for (const [status, items] of Array.from(byStatus.entries()).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n${status} (${items.length} orders):`);
      for (const item of items.slice(0, 10)) {
        console.log(`  OrderID: ${item.xmlOrderId}, Status: ${item.xmlStatus}`);
      }
      if (items.length > 10) {
        console.log(`  ... and ${items.length - 10} more`);
      }
    }
  }

  // Show status discrepancies
  if (statusDiscrepancies.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('STATUS DISCREPANCIES:');
    console.log('='.repeat(80));
    
    // Group by type
    const byType = new Map<string, typeof statusDiscrepancies>();
    for (const disc of statusDiscrepancies) {
      const key = `${disc.expectedDbStatus} -> ${disc.actualDbStatus}`;
      if (!byType.has(key)) {
        byType.set(key, []);
      }
      byType.get(key)!.push(disc);
    }

    for (const [type, items] of byType.entries()) {
      console.log(`\n${type} (${items.length} orders):`);
      for (const item of items.slice(0, 10)) {
        console.log(`  ${item.orderId}: XML="${item.xmlStatus}" Expected="${item.expectedDbStatus}" Actual="${item.actualDbStatus}"`);
      }
      if (items.length > 10) {
        console.log(`  ... and ${items.length - 10} more`);
      }
    }

    // Show summary by expected status
    console.log('\n' + '='.repeat(80));
    console.log('STATUS DISCREPANCY SUMMARY BY EXPECTED STATUS:');
    console.log('='.repeat(80));
    const byExpected = new Map<string, number>();
    for (const disc of statusDiscrepancies) {
      byExpected.set(disc.expectedDbStatus, (byExpected.get(disc.expectedDbStatus) || 0) + 1);
    }
    for (const [status, count] of Array.from(byExpected.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${status}: ${count} discrepancies`);
    }
  } else if (missingOrders.length === 0) {
    console.log('\n✓ All order statuses match perfectly!');
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nNew records to migrate:`);
  console.log(`  Clients: ${missingClientIds.size}`);
  console.log(`  Orders: ${missingOrders.length}`);
  
  if (missingClientIds.size > 0 || missingOrders.length > 0) {
    console.log(`\n⚠️  ACTION REQUIRED:`);
    console.log(`   Run the migration script to import new records:`);
    console.log(`   npx tsx scripts/migrate-xml-to-supabase.ts`);
  } else {
    console.log(`\n✓ Database is up to date with XML backup`);
  }

  console.log('\n' + '='.repeat(80));
}

compareOrderStatuses().catch(console.error);

