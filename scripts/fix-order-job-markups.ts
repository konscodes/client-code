#!/usr/bin/env tsx
/**
 * Fix Order Job Markups Script
 * 
 * This script fixes incorrect markup values in Supabase by reading the correct
 * WorksRatio values from XML and updating the order_jobs table.
 * 
 * The issue: The original migration used incorrect formula (numRatio - 100) / 10
 * instead of (numRatio - 1) * 100, resulting in negative markup values.
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

// Helper function to parse number with comma decimal separator
function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  return parseFloat(value.toString().replace(',', '.'));
}

// Helper function to convert markup ratio (correct formula)
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
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'object') {
    return '';
  }
  return String(value).trim();
}

interface XMLWork {
  WorksOrderID: string;
  WorksName?: string;
  WorksPrice?: string;
  WorksQuantity?: string;
  WorksRatio?: string;
  WorksCWorksID?: string;
  ID?: string;
}

async function loadXMLData(): Promise<Map<string, XMLWork[]>> {
  console.log('Loading XML data...');
  
  const xmlFilePath = path.join(__dirname, '../servicemk3.xml');
  
  if (!fs.existsSync(xmlFilePath)) {
    console.error(`Error: XML file not found at ${xmlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Reading XML file: ${xmlFilePath}`);
  const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');
  
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
    isArray: (name, jPath) => {
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
  
  // Extract works
  let tblWorks: XMLWork[] = [];
  if (xmlData?.dataroot?.tblWorks) {
    tblWorks = Array.isArray(xmlData.dataroot.tblWorks)
      ? xmlData.dataroot.tblWorks
      : [xmlData.dataroot.tblWorks];
  }
  
  // If works not found in main parse, try parsing works section separately
  if (tblWorks.length === 0) {
    console.log('Works not found in main parse, extracting works section separately...');
    const worksMatch = fixedXmlContent.match(/<tblWorks>[\s\S]*?<\/tblWorks>/g);
    
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
  
  console.log(`Found ${tblWorks.length} works in XML`);
  
  // Group works by order ID
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
  
  console.log(`Grouped into ${worksByOrder.size} orders`);
  return worksByOrder;
}

async function fixMarkups() {
  console.log('\n=== Fixing Order Job Markups ===\n');
  
  // Load XML data
  const xmlWorksByOrder = await loadXMLData();
  
  // Fetch all orders from Supabase to create mapping
  console.log('\nFetching orders from Supabase...');
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
  
  console.log(`Found ${orderIdMap.size} orders in Supabase`);
  
  // Process each order
  let totalFixed = 0;
  let totalSkipped = 0;
  let ordersProcessed = 0;
  
  for (const [xmlOrderId, xmlWorks] of xmlWorksByOrder.entries()) {
    const supabaseOrderId = orderIdMap.get(xmlOrderId) || orderIdMap.get(xmlOrderId.toString());
    
    if (!supabaseOrderId) {
      totalSkipped += xmlWorks.length;
      continue;
    }
    
    // Fetch order jobs from Supabase
    const { data: supabaseJobs, error: jobsError } = await supabase
      .from('order_jobs')
      .select('*')
      .eq('orderId', supabaseOrderId)
      .order('position', { ascending: true });
    
    if (jobsError) {
      console.error(`Error fetching jobs for order ${xmlOrderId}:`, jobsError);
      continue;
    }
    
    if (!supabaseJobs || supabaseJobs.length === 0) {
      continue;
    }
    
    // Match XML works with Supabase jobs by position
    // Both are sorted by ID/position, so they should align
    const updates: any[] = [];
    const usedJobIds = new Set<string>();
    
    for (let i = 0; i < Math.min(xmlWorks.length, supabaseJobs.length); i++) {
      const xmlWork = xmlWorks[i];
      const supabaseJob = supabaseJobs[i];
      
      // Skip if this job was already matched
      if (usedJobIds.has(supabaseJob.id)) {
        continue;
      }
      
      // Calculate correct markup from XML
      const correctMarkup = convertMarkup(xmlWork.WorksRatio);
      
      // Check if markup needs to be fixed
      const currentMarkup = parseFloat(supabaseJob.lineMarkup) || 0;
      const markupDiff = Math.abs(currentMarkup - correctMarkup);
      
      // Only update if difference is significant (more than 0.1%)
      if (markupDiff > 0.1) {
        updates.push({
          id: supabaseJob.id,
          lineMarkup: correctMarkup,
        });
        usedJobIds.add(supabaseJob.id);
      }
    }
    
    // Update jobs one by one (using update instead of upsert to avoid null constraint issues)
    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('order_jobs')
          .update({ lineMarkup: update.lineMarkup })
          .eq('id', update.id);
        
        if (updateError) {
          console.error(`Error updating job ${update.id} for order ${xmlOrderId}:`, updateError);
        } else {
          totalFixed++;
        }
      }
      
      ordersProcessed++;
      if (ordersProcessed % 100 === 0) {
        console.log(`Processed ${ordersProcessed} orders, fixed ${totalFixed} jobs`);
      }
    }
  }
  
  console.log('\n=== Fix Complete ===');
  console.log(`Orders processed: ${ordersProcessed}`);
  console.log(`Jobs fixed: ${totalFixed}`);
  console.log(`Jobs skipped (order not found): ${totalSkipped}`);
  
  // Verify a few orders
  console.log('\n=== Verification ===');
  
  // Check order 22597
  const { data: order22597 } = await supabase
    .from('order_jobs')
    .select('*')
    .eq('orderId', 'order-22597')
    .order('position', { ascending: true });
  
  if (order22597 && order22597.length > 0) {
    console.log('\nOrder 22597 markups:');
    order22597.forEach((job, i) => {
      console.log(`  Job ${i + 1}: ${job.jobName.substring(0, 40)}... - Markup: ${job.lineMarkup}%`);
    });
  }
  
  // Check order 27193 (should remain unchanged)
  const { data: order27193 } = await supabase
    .from('order_jobs')
    .select('*')
    .eq('orderId', 'order-27193')
    .order('position', { ascending: true });
  
  if (order27193 && order27193.length > 0) {
    console.log('\nOrder 27193 markups (should be unchanged):');
    order27193.forEach((job, i) => {
      console.log(`  Job ${i + 1}: ${job.jobName.substring(0, 40)}... - Markup: ${job.lineMarkup}%`);
    });
  }
}

// Run the fix
fixMarkups().catch((error) => {
  console.error('\n=== Fix Failed ===');
  console.error(error);
  process.exit(1);
});

