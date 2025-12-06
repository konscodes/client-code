#!/usr/bin/env tsx
/**
 * Get maximum IDs from database to determine next ID numbers
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getMaxIds() {
  // Get max client number
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .or('id.like.client-xml-%,id.like.client-%');
  
  let maxClientNum = 0;
  if (clients) {
    for (const client of clients) {
      // Support both old (client-xml-*) and new (client-*) formats
      const match = client.id.match(/^client(?:-xml)?-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxClientNum) maxClientNum = num;
      }
    }
  }
  
  // Get max order number
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .or('id.like.ORD-XML-%,id.like.order-%');
  
  let maxOrderNum = 0;
  if (orders) {
    for (const order of orders) {
      // Support both old (ORD-XML-*) and new (order-*) formats
      const match = order.id.match(/^(?:ORD-XML-|order-)(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxOrderNum) maxOrderNum = num;
      }
    }
  }
  
  // Get max job number (more complex - job-timestamp-number)
  const { data: jobs } = await supabase
    .from('job_templates')
    .select('id')
    .like('id', 'job-%');
  
  let maxJobNum = 0;
  if (jobs) {
    for (const job of jobs) {
      const match = job.id.match(/^job-(\d+)-(\d+)$/);
      if (match) {
        const num = parseInt(match[2], 10);
        if (num > maxJobNum) maxJobNum = num;
      }
    }
  }
  
  console.log('Current maximum IDs:');
  console.log(`  Clients: client-${maxClientNum} (next: client-${maxClientNum + 1})`);
  console.log(`  Orders: order-${maxOrderNum} (next: order-${maxOrderNum + 1})`);
  console.log(`  Jobs: job-{timestamp}-${maxJobNum} (next: job-{timestamp}-${String(maxJobNum + 1).padStart(6, '0')})`);
  console.log('\nThese values should be used to initialize ID generation counters.');
}

getMaxIds()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

