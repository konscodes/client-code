#!/usr/bin/env tsx
/**
 * XML to Supabase Migration Script
 * 
 * This script migrates data from servicemk3.xml to Supabase database.
 * Follows the mapping rules defined in XML_MIGRATION_GUIDE.md
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yjmnehvlpxzqmtmemkdv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  // Default to 'proposal' for unknown statuses instead of 'completed'
  return STATUS_MAP[russianStatus] || 'proposal';
}

// Helper function to parse date
function parseDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  
  // Handle formats: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
  const cleaned = dateStr.trim();
  if (cleaned.length === 10) {
    // YYYY-MM-DD
    return new Date(cleaned + 'T00:00:00Z');
  } else if (cleaned.length >= 19) {
    // YYYY-MM-DD HH:MM:SS
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
// XML format: WorksRatio = "1,5" means 1.5x multiplier = 50% markup
// Supabase format: lineMarkup = 50 means 50% markup
function convertMarkup(ratio: string | undefined): number {
  if (!ratio) return 0;
  const numRatio = parseNumber(ratio);
  // Convert ratio (1.5) to percentage markup (50%)
  return (numRatio - 1) * 100;
}

// Helper function to trim and clean string
function cleanString(value: string | undefined): string {
  if (!value) return '';
  // If value is already a string, use it directly
  if (typeof value === 'string') {
    return value.trim();
  }
  // If it's an object, return empty string (don't convert to [object Object])
  if (typeof value === 'object') {
    console.warn('Warning: Attempted to clean an object as string, returning empty string');
    return '';
  }
  // For other types, convert to string
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

async function migrateClients(xmlData: any): Promise<Map<string, string>> {
  console.log('\n=== Migrating Clients ===');
  
  // Handle both array and single object cases
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
  
  console.log(`Found ${tblMain.length} clients and ${tblContacts.length} contacts in XML`);
  
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
  
  const clientIdMap = new Map<string, string>(); // XML ClientID → Supabase ID
  const clientsToInsert: any[] = [];
  
  for (const client of tblMain) {
    const xmlClientId = client.ClientID;
    const supabaseClientId = `client-${xmlClientId}`;
    clientIdMap.set(xmlClientId, supabaseClientId);
    
    // Get most recent contact
    const contacts = contactsByClient.get(xmlClientId) || [];
    const primaryContact = contacts[0];
    
    // Get additional contacts (skip the first one)
    const additionalContacts = contacts.slice(1);
    
    // Build name, phone, email from primary contact or fallback
    const name = cleanString(primaryContact?.ContactName) || '';
    const phone = cleanString(primaryContact?.ContactMobilePhone) || cleanString(client.ClientPhone) || '';
    
    // Extract email more carefully - ensure it's a string
    let email = '';
    if (primaryContact?.ContactEmail) {
      const contactEmail = primaryContact.ContactEmail;
      email = typeof contactEmail === 'string' ? contactEmail.trim() : '';
    }
    if (!email && client.ClientEmail) {
      const clientEmail = client.ClientEmail;
      email = typeof clientEmail === 'string' ? clientEmail.trim() : '';
    }
    const createdAt = primaryContact?.ContactAddTime 
      ? parseDate(primaryContact.ContactAddTime)
      : new Date();
    
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
  
  // Insert clients in batches
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < clientsToInsert.length; i += batchSize) {
    const batch = clientsToInsert.slice(i, i + batchSize);
    const { error } = await supabase
      .from('clients')
      .upsert(batch, { onConflict: 'id' });
    
    if (error) {
      console.error(`Error inserting clients batch ${i / batchSize + 1}:`, error);
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${clientsToInsert.length} clients`);
    }
  }
  
  console.log(`✓ Migrated ${inserted} clients`);
  return clientIdMap;
}

async function migrateOrders(xmlData: any, clientIdMap: Map<string, string>, xmlContent: string): Promise<void> {
  console.log('\n=== Migrating Orders ===');
  
  // Handle both array and single object cases
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
  
  // If works not found in main parse, try parsing works section separately using regex
  if (tblWorks.length === 0) {
    console.log('Works not found in main parse, extracting works section separately...');
    const worksMatch = xmlContent.match(/<tblWorks>[\s\S]*?<\/tblWorks>/g);
    
    if (worksMatch && worksMatch.length > 0) {
      console.log(`Found ${worksMatch.length} tblWorks entries via regex`);
      
      // Extract works section and wrap in dataroot
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
  
  console.log(`Found ${tblOrders.length} orders and ${tblWorks.length} works in XML`);
  console.log(`Client ID map has ${clientIdMap.size} entries`);
  
  // First, insert orders
  const ordersToInsert: any[] = [];
  
  for (const order of tblOrders) {
    const xmlClientId = order.OrderClientID;
    const supabaseClientId = clientIdMap.get(xmlClientId);
    
    if (!supabaseClientId) {
      console.warn(`Skipping order ${order.OrderID}: client ${xmlClientId} not found`);
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
      taxRate: 8.5,
      globalMarkup: 20,
      currency: 'USD',
      notesInternal: [
        order.OrderID,
        cleanString(order.OrderType),
        cleanString(order.OrderComments),
      ].filter(s => s).join(' | ') || '',
      notesPublic: cleanString(order.OrderName) || '',
    };
    
    ordersToInsert.push(orderData);
  }
  
  // Insert orders in batches
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < ordersToInsert.length; i += batchSize) {
    const batch = ordersToInsert.slice(i, i + batchSize);
    const { error } = await supabase
      .from('orders')
      .upsert(batch, { onConflict: 'id' });
    
    if (error) {
      console.error(`Error inserting orders batch ${i / batchSize + 1}:`, error);
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${ordersToInsert.length} orders`);
    }
  }
  
  console.log(`✓ Migrated ${inserted} orders`);
  
  // Now migrate order jobs - need to fetch all orders to create mapping
  if (tblWorks.length > 0) {
    console.log('\n=== Migrating Order Jobs ===');
    
    // Fetch all orders to create mapping
    let allOrders: any[] = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id')
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
    
    // Create mapping: XML OrderID -> Supabase order ID
    const orderIdMap = new Map<string, string>();
    for (const order of allOrders) {
      const match = order.id.match(/order-(\d+)/);
      if (match) {
        const xmlOrderId = match[1];
        orderIdMap.set(xmlOrderId, order.id);
        orderIdMap.set(xmlOrderId.toString(), order.id);
      }
    }
    
    // Group works by order and process
    const worksByOrder = new Map<string, XMLWork[]>();
    for (const work of tblWorks) {
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
    let skipped = 0;
    
    for (const [xmlOrderId, works] of worksByOrder.entries()) {
      const supabaseOrderId = orderIdMap.get(xmlOrderId) || orderIdMap.get(xmlOrderId.toString());
      
      if (!supabaseOrderId) {
        skipped += works.length;
        continue;
      }
      
      for (let i = 0; i < works.length; i++) {
        const work = works[i];
        const jobId = `oj-${xmlOrderId}-${i + 1}`;
        
        // Convert WorksRatio to markup percentage
        // WorksRatio = "1,5" means 1.5x multiplier = 50% markup
        const lineMarkup = convertMarkup(work.WorksRatio);
        
        const jobData: any = {
          id: jobId,
          orderId: supabaseOrderId,
          jobId: cleanString(work.WorksCWorksID) || '',
          jobName: cleanString(work.WorksName) || 'Unknown',
          description: cleanString(work.WorksName) || 'Unknown',
          quantity: parseNumber(work.WorksQuantity),
          // Use WorksFirstPrice (base price) instead of WorksPrice (price with markup)
          // WorksPrice = WorksFirstPrice * WorksRatio, so we store the base price
          unitPrice: parseNumber(work.WorksFirstPrice) || parseNumber(work.WorksPrice),
          lineMarkup: lineMarkup,
          taxApplicable: true,
          position: i,
        };
        
        orderJobsToInsert.push(jobData);
      }
    }
    
    console.log(`Prepared ${orderJobsToInsert.length} order jobs to insert`);
    if (skipped > 0) {
      console.log(`Skipped ${skipped} works (order not found)`);
    }
    
    // Insert order jobs in batches
    inserted = 0;
    for (let i = 0; i < orderJobsToInsert.length; i += batchSize) {
      const batch = orderJobsToInsert.slice(i, i + batchSize);
      const { error } = await supabase
        .from('order_jobs')
        .upsert(batch, { onConflict: 'id' });
      
      if (error) {
        console.error(`Error inserting order jobs batch ${i / batchSize + 1}:`, error);
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

async function main() {
  console.log('Starting XML to Supabase migration...\n');
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
  console.log('Parsing XML...');
  
  // Pre-process XML to fix invalid tags (email addresses as tag names)
  console.log('Pre-processing XML to fix invalid tags...');
  let fixedXmlContent = xmlContent.replace(/<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)>/g, (match, email) => {
    // Replace invalid email tag with a valid tag containing the email as text
    return `<Email>${email}</Email>`;
  });
  
  // Also fix unclosed email tags in ClientEmail fields - handle cases like <ClientEmail>Text <email@domain.com></ClientEmail>
  fixedXmlContent = fixedXmlContent.replace(/<ClientEmail>([^<]*)<([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)><\/ClientEmail>/g, 
    '<ClientEmail>$1$2</ClientEmail>');
  
  // Fix any remaining invalid XML tags that might be email addresses or other invalid characters
  // This is a more aggressive fix for any remaining issues
  fixedXmlContent = fixedXmlContent.replace(/<([^>]*@[^>]*)>/g, (match) => {
    // If it looks like an email in a tag, escape it or remove the tag markers
    const emailMatch = match.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)/);
    if (emailMatch) {
      return emailMatch[1]; // Just return the email without tag markers
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
    stopNodes: [], // Don't stop parsing on any nodes
    processEntities: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    parseTagValue: true,
    isArray: (name, jPath, isLeafNode, isAttribute) => {
      // Force arrays for table elements - they always appear multiple times
      const tableNames = ['tblMain', 'tblContacts', 'tblOrders', 'tblWorks', 
                          'tblCatalogMatarials', 'tblCatalogWorks', 'tblContracts',
                          'tblMaterials', 'tblSettings', 'tblDocs', 'tblProcedures',
                          'tblUsers', 'tblEmployees'];
      if (tableNames.includes(name)) {
        return true;
      }
      // Also check if path contains the table name
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
  
  // Check if we got partial data
  if (!xmlData?.dataroot) {
    console.error('Error: Could not parse XML data root');
    process.exit(1);
  }
  
  if (!xmlData?.dataroot) {
    console.error('Error: Invalid XML structure. Expected <dataroot> root element.');
    process.exit(1);
  }
  
  // Check structure (minimal logging for production)
  const dataroot = xmlData.dataroot;
  console.log('XML Structure check:');
  console.log(`- tblMain: ${Array.isArray(dataroot.tblMain) ? dataroot.tblMain.length : (dataroot.tblMain ? 1 : 0)} entries`);
  console.log(`- tblOrders: ${Array.isArray(dataroot.tblOrders) ? dataroot.tblOrders.length : (dataroot.tblOrders ? 1 : 0)} entries`);
  console.log(`- tblWorks: ${Array.isArray(dataroot.tblWorks) ? dataroot.tblWorks.length : (dataroot.tblWorks ? 1 : 0)} entries (will try fallback parsing if 0)`);
  
  try {
    // Migrate clients first
    const clientIdMap = await migrateClients(xmlData);
    
    // Migrate orders (depends on clients) - pass xmlContent for works parsing fallback
    await migrateOrders(xmlData, clientIdMap, fixedXmlContent);
    
    console.log('\n=== Migration Complete ===');
    console.log('✓ All data migrated successfully');
    
  } catch (error) {
    console.error('\n=== Migration Failed ===');
    console.error(error);
    process.exit(1);
  }
}

main();

