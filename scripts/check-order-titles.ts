#!/usr/bin/env tsx
/**
 * Check Order Titles Script
 * 
 * This script checks the orderType and orderTitle values for specific orders
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_ORDER_IDS = ['22639', '22640', '22641', '22642', '22643', '22644', '22645', '22646'];

async function main() {
  console.log('Checking order titles...\n');
  
  const supabaseOrderIds = TARGET_ORDER_IDS.map(id => `order-${id}`);
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, orderType, orderTitle')
    .in('id', supabaseOrderIds);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${orders?.length || 0} orders:\n`);
  
  for (const order of orders || []) {
    const match = order.id.match(/^order-(\d+)$/);
    const xmlOrderId = match ? match[1] : order.id;
    
    console.log(`Order ${xmlOrderId}:`);
    console.log(`  orderType: "${order.orderType || '(empty)'}"`);
    console.log(`  orderTitle: "${order.orderTitle || '(empty)'}"`);
    console.log('');
  }
}

main();

