// Test script to verify document generation API
const testData = {
  type: 'invoice',
  company: {
    name: 'Premium Welding & Fabrication',
    address: '2500 Industrial Park Dr, Detroit, MI 48210',
    phone: '(555) 987-6543',
    email: 'info@premiumwelding.com',
    taxId: '38-9876543'
  },
  client: {
    name: 'John Doe',
    company: 'ABC Manufacturing',
    address: '123 Main St, Detroit, MI 48201',
    phone: '(555) 123-4567',
    email: 'john@abcmanufacturing.com'
  },
  order: {
    id: 'ORD-2025-001',
    date: 'Jan 15, 2025',
    invoiceNumber: 'INV-2025-001',
    subtotal: '1000.00',
    tax: '85.00',
    total: '1085.00'
  },
  jobs: [
    {
      code: 'JOB-001',
      name: 'Welding Service',
      qty: '10',
      unit: 'hours',
      unitPrice: '50.00',
      lineTotal: '500.00'
    },
    {
      code: 'JOB-002',
      name: 'Fabrication Work',
      qty: '5',
      unit: 'hours',
      unitPrice: '100.00',
      lineTotal: '500.00'
    }
  ]
};

async function testDocumentGeneration() {
  console.log('Testing document generation...');
  console.log('Service URL: http://localhost:5001/generate');
  console.log('Test data:', JSON.stringify(testData, null, 2));
  
  try {
    const response = await fetch('http://localhost:5001/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const blob = await response.blob();
    console.log('✅ Document generated successfully!');
    console.log(`File size: ${blob.size} bytes`);
    console.log(`Content type: ${blob.type}`);
    
    // Save to file (Node.js environment)
    if (typeof require !== 'undefined') {
      const fs = require('fs');
      const buffer = Buffer.from(await blob.arrayBuffer());
      fs.writeFileSync('test-invoice.docx', buffer);
      console.log('✅ Saved to test-invoice.docx');
    }
    
  } catch (error) {
    console.error('❌ Error generating document:', error.message);
    if (error.message.includes('fetch')) {
      console.error('Make sure the Python service is running on port 5001');
    }
  }
}

// Run test
testDocumentGeneration();


