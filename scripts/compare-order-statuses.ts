#!/usr/bin/env tsx
/**
 * Compare Order Statuses Script
 * 
 * Compares order statuses between XML file and Supabase database
 * to identify any discrepancies.
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

async function compareOrderStatuses() {
  console.log('Starting order status comparison...\n');

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

  // Print results
  console.log('='.repeat(80));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80));
  console.log(`\nTotal orders in XML: ${xmlStatusMap.size}`);
  console.log(`Total orders in DB: ${allOrders.length}`);
  console.log(`\nMatching statuses:`);
  for (const [status, count] of matches.entries()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`\nDiscrepancies found: ${discrepancies.length}`);

  if (discrepancies.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('DISCREPANCIES:');
    console.log('='.repeat(80));
    
    // Group by type
    const byType = new Map<string, typeof discrepancies>();
    for (const disc of discrepancies) {
      const key = `${disc.expectedDbStatus} -> ${disc.actualDbStatus}`;
      if (!byType.has(key)) {
        byType.set(key, []);
      }
      byType.get(key)!.push(disc);
    }

    for (const [type, items] of byType.entries()) {
      console.log(`\n${type} (${items.length} orders):`);
      for (const item of items.slice(0, 10)) { // Show first 10
        console.log(`  ${item.orderId}: XML="${item.xmlStatus}" Expected="${item.expectedDbStatus}" Actual="${item.actualDbStatus}"`);
      }
      if (items.length > 10) {
        console.log(`  ... and ${items.length - 10} more`);
      }
    }

    // Show summary by expected status
    console.log('\n' + '='.repeat(80));
    console.log('DISCREPANCY SUMMARY BY EXPECTED STATUS:');
    console.log('='.repeat(80));
    const byExpected = new Map<string, number>();
    for (const disc of discrepancies) {
      byExpected.set(disc.expectedDbStatus, (byExpected.get(disc.expectedDbStatus) || 0) + 1);
    }
    for (const [status, count] of Array.from(byExpected.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${status}: ${count} discrepancies`);
    }
  } else {
    console.log('\n✓ All order statuses match perfectly!');
  }

  console.log('\n' + '='.repeat(80));
}

compareOrderStatuses().catch(console.error);

