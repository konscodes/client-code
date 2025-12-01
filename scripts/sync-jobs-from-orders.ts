// Script to sync jobs from orders to job catalog and create presets
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to generate ID
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Categorize jobs based on keywords
function categorizeJob(jobName: string, description: string): string {
  const name = (jobName + ' ' + description).toLowerCase();
  
  if (name.includes('расточка') || name.includes('наплавка') || name.includes('фрезеровка')) {
    return 'Обработка';
  }
  if (name.includes('замена') || name.includes('изготовление')) {
    if (name.includes('втулк') || name.includes('палец') || name.includes('коронк')) {
      return 'Замена деталей';
    }
    if (name.includes('уплотнен') || name.includes('стопор')) {
      return 'Замена уплотнений';
    }
    return 'Изготовление/Замена';
  }
  if (name.includes('восстановление')) {
    return 'Восстановление';
  }
  if (name.includes('демонтаж') || name.includes('монтаж') || name.includes('разборка') || name.includes('сборка')) {
    return 'Монтаж/Демонтаж';
  }
  if (name.includes('панель') || name.includes('плита') || name.includes('направляющ')) {
    return 'Изготовление деталей';
  }
  if (name.includes('болт') || name.includes('гайка') || name.includes('шайба') || name.includes('винт')) {
    return 'Крепеж';
  }
  if (name.includes('гидроцилиндр') || name.includes('грейфер') || name.includes('лепесток')) {
    return 'Гидравлика';
  }
  if (name.includes('командировочн') || name.includes('транспортн') || name.includes('материал')) {
    return 'Расходы';
  }
  if (name.includes('покраска') || name.includes('сварка')) {
    return 'Обработка поверхности';
  }
  
  return 'Прочее';
}

async function syncJobsFromOrders() {
  console.log('🔄 Starting job sync from orders...\n');

  // Step 1: Get all unique jobs from orders
  console.log('📊 Fetching unique jobs from orders...');
  const { data: orderJobs, error: jobsError } = await supabase
    .from('order_jobs')
    .select('"jobName", description, "unitPrice", quantity')
    .order('"jobName"');

  if (jobsError) {
    console.error('❌ Error fetching order jobs:', jobsError);
    return;
  }

  console.log(`   Found ${orderJobs.length} order job entries\n`);

  // Step 2: Group by job name and description to get unique jobs
  const uniqueJobsMap = new Map<string, {
    name: string;
    description: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    usageCount: number;
    avgQuantity: number;
  }>();

  for (const job of orderJobs) {
    const key = `${job.jobName}|${job.description || ''}`;
    const price = parseFloat(job.unitPrice || '0');
    const qty = parseFloat(job.quantity || '0');

    if (uniqueJobsMap.has(key)) {
      const existing = uniqueJobsMap.get(key)!;
      existing.usageCount++;
      existing.avgPrice = (existing.avgPrice * (existing.usageCount - 1) + price) / existing.usageCount;
      existing.avgQuantity = (existing.avgQuantity * (existing.usageCount - 1) + qty) / existing.usageCount;
      if (price > 0) {
        existing.minPrice = Math.min(existing.minPrice || price, price);
        existing.maxPrice = Math.max(existing.maxPrice || price, price);
      }
    } else {
      uniqueJobsMap.set(key, {
        name: job.jobName,
        description: job.description || job.jobName,
        avgPrice: price,
        minPrice: price > 0 ? price : 0,
        maxPrice: price > 0 ? price : 0,
        usageCount: 1,
        avgQuantity: qty,
      });
    }
  }

  const uniqueJobs = Array.from(uniqueJobsMap.values());
  console.log(`   Found ${uniqueJobs.length} unique jobs\n`);

  // Step 3: Get existing job templates
  console.log('📋 Checking existing job templates...');
  const { data: existingTemplates, error: templatesError } = await supabase
    .from('job_templates')
    .select('id, name, description');

  if (templatesError) {
    console.error('❌ Error fetching job templates:', templatesError);
    return;
  }

  const existingJobsSet = new Set(
    (existingTemplates || []).map(t => `${t.name}|${t.description || ''}`)
  );
  console.log(`   Found ${existingTemplates?.length || 0} existing templates\n`);

  // Step 4: Create missing jobs
  console.log('➕ Creating missing jobs in catalog...');
  let created = 0;
  let skipped = 0;

  for (const job of uniqueJobs) {
    const key = `${job.name}|${job.description}`;
    
    if (existingJobsSet.has(key)) {
      skipped++;
      continue;
    }

    const category = categorizeJob(job.name, job.description);
    const unitPrice = job.avgPrice > 0 ? Math.round(job.avgPrice) : 0;
    
    // Determine unit of measure based on job type
    let unitOfMeasure = 'шт';
    if (job.name.toLowerCase().includes('час') || job.name.toLowerCase().includes('hour')) {
      unitOfMeasure = 'час';
    } else if (job.avgQuantity > 1 && job.avgQuantity < 100) {
      unitOfMeasure = 'шт';
    }

    const newJob = {
      id: generateId('job'),
      name: job.name,
      description: job.description,
      category,
      unitPrice,
      unitOfMeasure,
      defaultTax: true,
      lastUpdated: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('job_templates')
      .insert(newJob);

    if (insertError) {
      console.error(`   ❌ Error creating job "${job.name}":`, insertError.message);
    } else {
      created++;
      if (created % 50 === 0) {
        console.log(`   ✓ Created ${created} jobs...`);
      }
    }
  }

  console.log(`\n✅ Created ${created} new jobs, skipped ${skipped} existing jobs\n`);

  return { created, skipped, total: uniqueJobs.length };
}

async function analyzeJobPatterns() {
  console.log('🔍 Analyzing job patterns for presets...\n');

  // Get orders with their jobs
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, status, "clientId"')
    .limit(1000);

  if (ordersError) {
    console.error('❌ Error fetching orders:', ordersError);
    return;
  }

  console.log(`   Analyzing ${orders.length} orders...\n`);

  // Get all order jobs grouped by order
  const orderJobsMap = new Map<string, string[]>();

  for (const order of orders) {
    const { data: jobs, error: jobsError } = await supabase
      .from('order_jobs')
      .select('"jobName"')
      .eq('orderId', order.id);

    if (!jobsError && jobs) {
      const jobNames = jobs.map(j => j.jobName).sort();
      orderJobsMap.set(order.id, jobNames);
    }
  }

  // Find common job combinations
  const jobCombinations = new Map<string, { count: number; orders: string[] }>();

  for (const [orderId, jobNames] of orderJobsMap.entries()) {
    if (jobNames.length < 2) continue;

    // Create combinations of 2-5 jobs
    for (let size = 2; size <= Math.min(5, jobNames.length); size++) {
      for (let i = 0; i <= jobNames.length - size; i++) {
        const combination = jobNames.slice(i, i + size).join('|');
        if (jobCombinations.has(combination)) {
          const existing = jobCombinations.get(combination)!;
          if (!existing.orders.includes(orderId)) {
            existing.count++;
            existing.orders.push(orderId);
          }
        } else {
          jobCombinations.set(combination, {
            count: 1,
            orders: [orderId],
          });
        }
      }
    }
  }

  // Filter combinations that appear in at least 3 orders
  const commonCombinations = Array.from(jobCombinations.entries())
    .filter(([_, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20); // Top 20 combinations

  console.log(`   Found ${commonCombinations.length} common job combinations\n`);

  return commonCombinations;
}

async function createPresetsFromPatterns() {
  console.log('📦 Creating presets from patterns...\n');

  const patterns = await analyzeJobPatterns();
  
  if (patterns.length === 0) {
    console.log('   No patterns found to create presets\n');
    return;
  }

  // Get all job templates to map names to IDs
  const { data: jobTemplates, error: templatesError } = await supabase
    .from('job_templates')
    .select('id, name');

  if (templatesError) {
    console.error('❌ Error fetching job templates:', templatesError);
    return;
  }

  const jobNameToId = new Map(
    jobTemplates.map(j => [j.name, j.id])
  );

  // Get existing presets
  const { data: existingPresets, error: presetsError } = await supabase
    .from('job_presets')
    .select('name');

  if (presetsError) {
    console.error('❌ Error fetching presets:', presetsError);
    return;
  }

  const existingPresetNames = new Set((existingPresets || []).map(p => p.name));

  let created = 0;

  for (const [combination, data] of patterns) {
    const jobNames = combination.split('|');
    
    // Find job IDs
    const jobIds: string[] = [];
    for (const name of jobNames) {
      const id = jobNameToId.get(name);
      if (id) {
        jobIds.push(id);
      }
    }

    if (jobIds.length < 2) continue; // Need at least 2 jobs

    // Create preset name
    const presetName = `Набор: ${jobNames[0]}${jobNames.length > 1 ? ' + ещё' : ''}`;
    
    if (existingPresetNames.has(presetName)) {
      continue;
    }

    const category = categorizeJob(jobNames[0], '');
    const presetId = generateId('preset');

    // Create preset
    const { error: presetError } = await supabase
      .from('job_presets')
      .insert({
        id: presetId,
        name: presetName,
        description: `Часто используемый набор из ${jobIds.length} работ. Используется в ${data.count} заказах.`,
        category,
        lastUpdated: new Date().toISOString(),
      });

    if (presetError) {
      console.error(`   ❌ Error creating preset "${presetName}":`, presetError.message);
      continue;
    }

    // Create preset jobs
    const presetJobs = jobIds.map((jobId, index) => ({
      presetId,
      jobId,
      defaultQty: 1,
      position: index,
    }));

    const { error: jobsError } = await supabase
      .from('preset_jobs')
      .insert(presetJobs);

    if (jobsError) {
      console.error(`   ❌ Error creating preset jobs for "${presetName}":`, jobsError.message);
      // Clean up preset
      await supabase.from('job_presets').delete().eq('id', presetId);
      continue;
    }

    created++;
    console.log(`   ✓ Created preset: "${presetName}" (${jobIds.length} jobs, used in ${data.count} orders)`);
  }

  console.log(`\n✅ Created ${created} new presets\n`);
}

async function main() {
  try {
    // Step 1: Sync jobs from orders
    const syncResult = await syncJobsFromOrders();
    
    if (!syncResult) {
      console.error('❌ Job sync failed');
      return;
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Step 2: Create presets from patterns
    await createPresetsFromPatterns();

    console.log('='.repeat(60));
    console.log('\n✨ Job sync and preset creation completed!\n');
    console.log(`📊 Summary:`);
    console.log(`   - Total unique jobs found: ${syncResult.total}`);
    console.log(`   - New jobs created: ${syncResult.created}`);
    console.log(`   - Existing jobs skipped: ${syncResult.skipped}\n`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();


