#!/usr/bin/env tsx
/**
 * Set All Orders Tax Rate to Zero
 * 
 * This script sets the taxRate field to 0 for all orders in Supabase.
 */

import { createClient } from '@supabase/supabase-js';
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

async function setAllTaxRatesToZero() {
  console.log('=== Setting All Orders Tax Rate to 0 ===\n');
  
  // First, get count of orders
  const { count, error: countError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error('Error counting orders:', countError);
    process.exit(1);
  }
  
  console.log(`Found ${count} orders to update`);
  
  // Update all orders using a single SQL update
  console.log('\nUpdating all orders...');
  
  const { data, error } = await supabase
    .from('orders')
    .update({ taxRate: 0 })
    .neq('id', ''); // Update all rows (neq with empty string matches all)
  
  if (error) {
    console.error('Error updating orders:', error);
    
    // Fallback: Update in batches
    console.log('\nTrying batch updates...');
    const batchSize = 1000;
    let offset = 0;
    let updated = 0;
    
    while (true) {
      // Fetch a batch of order IDs
      const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id')
        .range(offset, offset + batchSize - 1);
      
      if (fetchError) {
        console.error('Error fetching orders:', fetchError);
        break;
      }
      
      if (!orders || orders.length === 0) {
        break;
      }
      
      // Update this batch
      const orderIds = orders.map(o => o.id);
      const { error: updateError } = await supabase
        .from('orders')
        .update({ taxRate: 0 })
        .in('id', orderIds);
      
      if (updateError) {
        console.error(`Error updating batch starting at ${offset}:`, updateError);
      } else {
        updated += orders.length;
        console.log(`Updated ${updated}/${count} orders`);
      }
      
      offset += batchSize;
      
      if (orders.length < batchSize) {
        break;
      }
    }
    
    console.log(`\n✓ Updated ${updated} orders`);
  } else {
    console.log(`\n✓ Successfully updated all ${count} orders`);
  }
  
  // Verify the update
  console.log('\n=== Verification ===');
  const { data: sampleOrders, error: verifyError } = await supabase
    .from('orders')
    .select('id, taxRate')
    .limit(10);
  
  if (verifyError) {
    console.error('Error verifying update:', verifyError);
  } else if (sampleOrders) {
    console.log('Sample orders tax rates:');
    sampleOrders.forEach(order => {
      console.log(`  Order ${order.id}: taxRate = ${order.taxRate}`);
    });
    
    // Check if any orders still have non-zero tax rate
    const { count: nonZeroCount, error: checkError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .neq('taxRate', 0);
    
    if (!checkError && nonZeroCount !== null) {
      if (nonZeroCount === 0) {
        console.log('\n✓ All orders have taxRate = 0');
      } else {
        console.log(`\n⚠ Warning: ${nonZeroCount} orders still have non-zero taxRate`);
      }
    }
  }
}

// Run the update
setAllTaxRatesToZero().catch((error) => {
  console.error('\n=== Update Failed ===');
  console.error(error);
  process.exit(1);
});

