#!/usr/bin/env tsx
/**
 * Fix Order Job Unit Prices Script (Bulk)
 * 
 * This script fixes incorrect unitPrice values in Supabase by converting them
 * from prices WITH markup to base prices WITHOUT markup.
 * 
 * Issue: Original migration used WorksPrice (with markup) instead of WorksFirstPrice (base price)
 * Fix: Calculate base price = unitPrice / (1 + lineMarkup/100)
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yjmnehvlpxzqmtmemkdv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixUnitPrices() {
  console.log('=== Fixing Order Job Unit Prices (Bulk) ===\n');
  
  // Fetch all order jobs
  console.log('Fetching all order jobs from Supabase...');
  let allJobs: any[] = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: jobs, error: jobsError } = await supabase
      .from('order_jobs')
      .select('id, unitPrice, lineMarkup')
      .range(offset, offset + limit - 1);
    
    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      break;
    }
    
    if (!jobs || jobs.length === 0) {
      break;
    }
    
    allJobs = allJobs.concat(jobs);
    offset += limit;
    
    if (jobs.length < limit) {
      break;
    }
  }
  
  console.log(`Found ${allJobs.length} jobs`);
  
  // Prepare updates: calculate base price from current price and markup
  console.log('\nPreparing update data...');
  const updates = new Map<string, number>();
  let totalToFix = 0;
  let skipped = 0;
  
  for (const job of allJobs) {
    const currentPrice = parseFloat(job.unitPrice) || 0;
    const markup = parseFloat(job.lineMarkup) || 0;
    
    // Skip if no price or no markup
    if (currentPrice === 0 || markup === 0) {
      skipped++;
      continue;
    }
    
    // Calculate base price: basePrice = currentPrice / (1 + markup/100)
    const basePrice = currentPrice / (1 + markup / 100);
    
    // Only update if there's a significant difference (more than 0.01)
    const priceDiff = Math.abs(currentPrice - basePrice);
    if (priceDiff > 0.01) {
      updates.set(job.id, basePrice);
      totalToFix++;
    }
  }
  
  console.log(`Prepared ${updates.size} updates out of ${allJobs.length} jobs`);
  console.log(`Skipped ${skipped} jobs (no price or no markup)`);
  
  if (updates.size === 0) {
    console.log('\nNo updates needed!');
    return;
  }
  
  // Execute bulk updates
  console.log('\nExecuting bulk updates...');
  const batchSize = 500;
  const jobIds = Array.from(updates.keys());
  let updated = 0;
  
  for (let i = 0; i < jobIds.length; i += batchSize) {
    const batch = jobIds.slice(i, i + batchSize);
    
    // Use Promise.all for parallel updates within the batch
    const updatePromises = batch.map(jobId => {
      const basePrice = updates.get(jobId)!;
      return supabase
        .from('order_jobs')
        .update({ unitPrice: basePrice })
        .eq('id', jobId);
    });
    
    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => !r.error).length;
    updated += successCount;
    
    if (successCount < batch.length) {
      const errors = results.filter(r => r.error);
      console.warn(`Batch ${Math.floor(i / batchSize) + 1}: ${successCount}/${batch.length} succeeded, ${errors.length} failed`);
    }
    
    if ((i + batchSize) % (batchSize * 10) === 0 || i + batchSize >= jobIds.length) {
      console.log(`Progress: ${updated}/${updates.size} jobs updated (${Math.round((updated / updates.size) * 100)}%)`);
    }
  }
  
  console.log('\n=== Fix Complete ===');
  console.log(`Jobs updated: ${updated}/${updates.size}`);
  
  // Verify a few orders
  console.log('\n=== Verification ===');
  
  // Check order 22597
  const { data: order22597 } = await supabase
    .from('order_jobs')
    .select('id, jobName, quantity, unitPrice, lineMarkup')
    .eq('orderId', 'order-22597')
    .order('position', { ascending: true });
  
  if (order22597 && order22597.length > 0) {
    console.log('\nOrder 22597 unit prices (should be base prices now):');
    order22597.forEach((job, i) => {
      const finalPrice = parseFloat(job.unitPrice) * (1 + parseFloat(job.lineMarkup) / 100);
      console.log(`  Job ${i + 1}: ${job.jobName.substring(0, 40)}...`);
      console.log(`    Base Price: ${job.unitPrice}, Markup: ${job.lineMarkup}%, Final: ${finalPrice.toFixed(2)}`);
    });
  }
  
  // Check order 27193
  const { data: order27193 } = await supabase
    .from('order_jobs')
    .select('id, jobName, quantity, unitPrice, lineMarkup')
    .eq('orderId', 'order-27193')
    .order('position', { ascending: true });
  
  if (order27193 && order27193.length > 0) {
    console.log('\nOrder 27193 unit prices:');
    order27193.forEach((job, i) => {
      const finalPrice = parseFloat(job.unitPrice) * (1 + parseFloat(job.lineMarkup) / 100);
      console.log(`  Job ${i + 1}: ${job.jobName.substring(0, 40)}...`);
      console.log(`    Base Price: ${job.unitPrice}, Markup: ${job.lineMarkup}%, Final: ${finalPrice.toFixed(2)}`);
    });
  }
}

// Run the fix
fixUnitPrices().catch((error) => {
  console.error('\n=== Fix Failed ===');
  console.error(error);
  process.exit(1);
});

