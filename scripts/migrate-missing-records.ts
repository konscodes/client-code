#!/usr/bin/env tsx
/**
 * Selective Migration Script - Only Inserts Missing Records
 * 
 * This script migrates only NEW clients and orders from XML that don't exist in the database.
 * It does NOT update existing records - only inserts missing ones.
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
  
  const cleaned = dateStr.trim();
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
  const markup = (numRatio - 1) * 100;
  // Round to 2 decimal places to avoid floating-point precision errors
  return Math.round(markup * 100) / 100;
}

// Helper function to trim and clean string
function cleanString(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) {
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

interface XMLClient {
  ClientID: string;
  ClientCompany: string;
  ClientPhone?: string;
  ClientEmail?: string;
  ClientAddressReg?: string;
  ClientComments?: string;
  ClientInn?: string;
  ClientKpp?: string;
  ClientOgrn?: string;
  ClientBank?: string;
  ClientBankRasSchet?: string;
  ClientBankKorSchet?: string;
  ClientBankBik?: string;
  ClientAddTime?: string;
}

interface XMLContact {
  ContactClientID: string;
  ContactName?: string;
  ContactMobilePhone?: string;
  ContactEmail?: string;
  ContactAddTime?: string;
}

interface XMLOrder {
  OrderID: string;
  OrderClientID: string;
  OrderDate?: string;
  OrderAddTime?: string;
  OrderStatus?: string;
  OrderName?: string;
  OrderType?: string;
  OrderTime?: string;
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

// Fetch existing client IDs from database
async function getExistingClientIds(): Promise<Set<string>> {
  console.log('Fetching existing client IDs from database...');
  const existingIds = new Set<string>();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id')
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching clients:', error);
      break;
    }

    if (!clients || clients.length === 0) {
      break;
    }

    for (const client of clients) {
      const match = client.id.match(/^client-(\d+)$/);
      if (match) {
        existingIds.add(match[1]);
      }
    }

    offset += limit;
    if (clients.length < limit) {
      break;
    }
  }

  console.log(`Found ${existingIds.size} existing clients in database`);
  return existingIds;
}

// Fetch existing order IDs from database
async function getExistingOrderIds(): Promise<Set<string>> {
  console.log('Fetching existing order IDs from database...');
  const existingIds = new Set<string>();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id')
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching orders:', error);
      break;
    }

    if (!orders || orders.length === 0) {
      break;
    }

    for (const order of orders) {
      const match = order.id.match(/(?:order-|ORD-XML-)(\d+)/);
      if (match) {
        existingIds.add(match[1]);
      }
    }

    offset += limit;
    if (orders.length < limit) {
      break;
    }
  }

  console.log(`Found ${existingIds.size} existing orders in database`);
  return existingIds;
}

// Migrate only missing clients
async function migrateMissingClients(xmlData: any, existingClientIds: Set<string>): Promise<Map<string, string>> {
  console.log('\n=== Migrating Missing Clients ===');
  
  // First, build clientIdMap with ALL existing clients from database
  // This ensures orders can reference any client that exists in the database
  const clientIdMap = new Map<string, string>();
  for (const clientId of existingClientIds) {
    clientIdMap.set(clientId, `client-${clientId}`);
  }
  console.log(`Added ${existingClientIds.size} existing clients to client ID map`);
  
  let tblMain: XMLClient[] = [];
  if (xmlData?.dataroot?.tblMain) {
    tblMain = Array.isArray(xmlData.dataroot.tblMain) 
      ? xmlData.dataroot.tblMain 
      : [xmlData.dataroot.tblMain];
  }
  
  let tblContacts: XMLContact[] = [];
  if (xmlData?.dataroot?.tblContacts) {
    tblContacts = Array.isArray(xmlData.dataroot.tblContacts)
      ? xmlData.dataroot.tblContacts
      : [xmlData.dataroot.tblContacts];
  }
  
  // Group contacts by client ID
  const contactsByClient = new Map<string, XMLContact[]>();
  for (const contact of tblContacts) {
    const clientId = contact.ContactClientID;
    if (!contactsByClient.has(clientId)) {
      contactsByClient.set(clientId, []);
    }
    contactsByClient.get(clientId)!.push(contact);
  }
  
  // Sort contacts by ContactAddTime (most recent first)
  for (const [clientId, contacts] of contactsByClient.entries()) {
    contacts.sort((a, b) => {
      const timeA = a.ContactAddTime ? parseDate(a.ContactAddTime).getTime() : 0;
      const timeB = b.ContactAddTime ? parseDate(b.ContactAddTime).getTime() : 0;
      return timeB - timeA;
    });
  }
  
  const clientsToInsert: any[] = [];
  
  for (const client of tblMain) {
    const xmlClientId = client.ClientID?.toString();
    if (!xmlClientId) continue;
    
    // Skip if client already exists (but it's already in clientIdMap)
    if (existingClientIds.has(xmlClientId)) {
      continue;
    }
    
    // Add new client to map
    const supabaseClientId = `client-${xmlClientId}`;
    clientIdMap.set(xmlClientId, supabaseClientId);
    
    // Get most recent contact
    const contacts = contactsByClient.get(xmlClientId) || [];
    const primaryContact = contacts[0];
    const additionalContacts = contacts.slice(1);
    
    // Build name, phone, email
    const name = cleanString(primaryContact?.ContactName) || '';
    const phone = cleanString(primaryContact?.ContactMobilePhone) || cleanString(client.ClientPhone) || '';
    
    let email = '';
    if (primaryContact?.ContactEmail) {
      const contactEmail = primaryContact.ContactEmail;
      email = typeof contactEmail === 'string' ? contactEmail.trim() : '';
    }
    if (!email && client.ClientEmail) {
      const clientEmail = client.ClientEmail;
      email = typeof clientEmail === 'string' ? clientEmail.trim() : '';
    }
    
    // Use ClientAddTime from tblMain
    const createdAt = client.ClientAddTime 
      ? parseDate(client.ClientAddTime)
      : (primaryContact?.ContactAddTime 
          ? parseDate(primaryContact.ContactAddTime)
          : new Date());
    
    // Build notes with additional contacts
    let notes = cleanString(client.ClientComments);
    if (additionalContacts.length > 0) {
      const contactStrings = additionalContacts
        .map(c => {
          const parts: string[] = [];
          if (c.ContactName) parts.push(c.ContactName);
          const contactInfo: string[] = [];
          if (c.ContactMobilePhone) contactInfo.push(c.ContactMobilePhone);
          if (c.ContactEmail) contactInfo.push(c.ContactEmail);
          if (contactInfo.length > 0) {
            parts.push(`(${contactInfo.join(', ')})`);
          }
          return parts.join(' ');
        })
        .filter(s => s.length > 0);
      
      if (contactStrings.length > 0) {
        const prefix = contactStrings.length === 1 ? 'Additional contact: ' : 'Additional contacts: ';
        const additionalNotes = prefix + contactStrings.join(', ');
        notes = notes ? `${notes} | ${additionalNotes}` : additionalNotes;
      }
    }
    
    // Build bank object
    const bank: any = {};
    if (client.ClientBank) bank.name = cleanString(client.ClientBank);
    if (client.ClientBankRasSchet) bank.accountNumber = cleanString(client.ClientBankRasSchet);
    if (client.ClientBankKorSchet) bank.correspondentAccount = cleanString(client.ClientBankKorSchet);
    if (client.ClientBankBik) bank.bik = cleanString(client.ClientBankBik);
    
    const clientData: any = {
      id: supabaseClientId,
      name: name || 'Unknown',
      company: cleanString(client.ClientCompany) || 'Unknown',
      phone,
      email,
      address: cleanString(client.ClientAddressReg) || '',
      inn: cleanString(client.ClientInn),
      kpp: cleanString(client.ClientKpp),
      ogrn: cleanString(client.ClientOgrn),
      bank: Object.keys(bank).length > 0 ? bank : null,
      notes: notes || null,
      createdAt: createdAt.toISOString(),
    };
    
    clientsToInsert.push(clientData);
  }
  
  if (clientsToInsert.length === 0) {
    console.log('No new clients to insert');
    return clientIdMap;
  }
  
  console.log(`Prepared ${clientsToInsert.length} new clients to insert`);
  
  // Insert clients in batches using INSERT
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < clientsToInsert.length; i += batchSize) {
    const batch = clientsToInsert.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('clients')
      .insert(batch)
      .select();
    
    if (error) {
      // If error is about duplicate, that's fine - we're using insert to avoid updates
      if (error.code === '23505') { // Unique violation
        console.log(`Batch ${i / batchSize + 1}: Some clients already exist (skipped)`);
      } else {
        console.error(`Error inserting clients batch ${i / batchSize + 1}:`, error);
      }
    } else {
      const count = data?.length || 0;
      inserted += count;
      console.log(`Inserted ${inserted}/${clientsToInsert.length} new clients (batch had ${count} inserted)`);
    }
  }
  
  console.log(`✓ Migrated ${inserted} new clients`);
  return clientIdMap;
}

// Migrate only missing orders
async function migrateMissingOrders(xmlData: any, clientIdMap: Map<string, string>, existingOrderIds: Set<string>, xmlContent: string): Promise<void> {
  console.log('\n=== Migrating Missing Orders ===');
  
  let tblOrders: XMLOrder[] = [];
  if (xmlData?.dataroot?.tblOrders) {
    tblOrders = Array.isArray(xmlData.dataroot.tblOrders)
      ? xmlData.dataroot.tblOrders
      : [xmlData.dataroot.tblOrders];
  }
  
  let tblWorks: XMLWork[] = [];
  if (xmlData?.dataroot?.tblWorks) {
    tblWorks = Array.isArray(xmlData.dataroot.tblWorks)
      ? xmlData.dataroot.tblWorks
      : [xmlData.dataroot.tblWorks];
  }
  
  // If works not found, try regex fallback
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
  
  // Filter to only missing orders
  const ordersToInsert: any[] = [];
  
  for (const order of tblOrders) {
    const xmlOrderId = order.OrderID?.toString();
    if (!xmlOrderId) continue;
    
    // Skip if order already exists
    if (existingOrderIds.has(xmlOrderId)) {
      continue;
    }
    
    const xmlClientId = order.OrderClientID?.toString().trim();
    if (!xmlClientId) {
      console.warn(`Skipping order ${xmlOrderId}: missing client ID`);
      continue;
    }
    
    const supabaseClientId = clientIdMap.get(xmlClientId);
    
    if (!supabaseClientId) {
      console.warn(`Skipping order ${xmlOrderId}: client ${xmlClientId} not found in clientIdMap (map has ${clientIdMap.size} entries)`);
      continue;
    }
    
    const supabaseOrderId = `order-${xmlOrderId}`;
    const createdAt = parseDate(order.OrderDate);
    const updatedAt = parseDate(order.OrderAddTime || order.OrderDate);
    
    let timeEstimate: number | undefined;
    if (order.OrderTime) {
      const parsed = parseInt(order.OrderTime.toString().trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        timeEstimate = parsed;
      }
    }
    
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
    
    if (timeEstimate !== undefined) {
      orderData.timeEstimate = timeEstimate;
    }
    
    ordersToInsert.push(orderData);
  }
  
  if (ordersToInsert.length === 0) {
    console.log('No new orders to insert');
    return;
  }
  
  console.log(`Prepared ${ordersToInsert.length} new orders to insert`);
  
  // Insert orders in batches
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < ordersToInsert.length; i += batchSize) {
    const batch = ordersToInsert.slice(i, i + batchSize);
    const { error } = await supabase
      .from('orders')
      .insert(batch)
      .select();
    
    if (error) {
      if (error.code === '23505') {
        console.log(`Batch ${i / batchSize + 1}: Some orders already exist (skipped)`);
      } else {
        console.error(`Error inserting orders batch ${i / batchSize + 1}:`, error);
      }
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${ordersToInsert.length} new orders`);
    }
  }
  
  console.log(`✓ Migrated ${inserted} new orders`);
  
  // Now migrate order jobs for the new orders
  if (tblWorks.length > 0 && ordersToInsert.length > 0) {
    console.log('\n=== Migrating Order Jobs for New Orders ===');
    
    // Get the order IDs we just inserted
    const newOrderIds = new Set(ordersToInsert.map(o => o.id));
    
    // Create mapping: XML OrderID -> Supabase order ID
    const orderIdMap = new Map<string, string>();
    for (const orderData of ordersToInsert) {
      const match = orderData.id.match(/order-(\d+)/);
      if (match) {
        const xmlOrderId = match[1];
        orderIdMap.set(xmlOrderId, orderData.id);
      }
    }
    
    // Group works by order
    const worksByOrder = new Map<string, XMLWork[]>();
    for (const work of tblWorks) {
      const orderId = work.WorksOrderID?.toString().trim();
      if (orderId && orderIdMap.has(orderId)) {
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
      if (!supabaseOrderId) continue;
      
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
    }
    
    if (orderJobsToInsert.length > 0) {
      console.log(`Prepared ${orderJobsToInsert.length} order jobs to insert`);
      
      inserted = 0;
      for (let i = 0; i < orderJobsToInsert.length; i += batchSize) {
        const batch = orderJobsToInsert.slice(i, i + batchSize);
        const { error } = await supabase
          .from('order_jobs')
          .insert(batch)
          .select();
        
        if (error) {
          if (error.code === '23505') {
            console.log(`Batch ${i / batchSize + 1}: Some order jobs already exist (skipped)`);
          } else {
            console.error(`Error inserting order jobs batch ${i / batchSize + 1}:`, error);
          }
        } else {
          inserted += batch.length;
          if (inserted % 1000 === 0 || inserted === orderJobsToInsert.length) {
            console.log(`Inserted ${inserted}/${orderJobsToInsert.length} order jobs`);
          }
        }
      }
      
      console.log(`✓ Migrated ${inserted} order jobs`);
    }
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('SELECTIVE MIGRATION - Only Missing Records');
  console.log('='.repeat(80));
  console.log('This script will ONLY insert new records, NOT update existing ones.\n');
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  // Pre-process XML
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
  
  if (!xmlData?.dataroot) {
    console.error('Error: Invalid XML structure');
    process.exit(1);
  }
  
  try {
    // Step 1: Get existing IDs from database
    const existingClientIds = await getExistingClientIds();
    const existingOrderIds = await getExistingOrderIds();
    
    // Step 2: Migrate missing clients first
    const clientIdMap = await migrateMissingClients(xmlData, existingClientIds);
    
    // Step 3: Migrate missing orders (depends on clients)
    await migrateMissingOrders(xmlData, clientIdMap, existingOrderIds, fixedXmlContent);
    
    console.log('\n' + '='.repeat(80));
    console.log('=== Migration Complete ===');
    console.log('✓ Only new records were inserted');
    console.log('✓ Existing records were NOT modified');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n=== Migration Failed ===');
    console.error(error);
    process.exit(1);
  }
}

main();
