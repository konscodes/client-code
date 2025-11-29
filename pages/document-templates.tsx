// Document templates page - manage invoice and PO templates
import { useState } from 'react';
import { useApp } from '../lib/app-context';
import { formatDate } from '../lib/utils';
import { FileText, Eye, Edit } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

interface DocumentTemplatesProps {
  onNavigate: (page: string, id?: string) => void;
}

export function DocumentTemplates({ onNavigate }: DocumentTemplatesProps) {
  const { documentTemplates, companySettings } = useApp();
  const [activeType, setActiveType] = useState<'invoice' | 'purchase-order'>('invoice');
  
  const invoiceTemplates = documentTemplates.filter(t => t.type === 'invoice');
  const poTemplates = documentTemplates.filter(t => t.type === 'purchase-order');
  
  const currentTemplates = activeType === 'invoice' ? invoiceTemplates : poTemplates;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">Document Templates</h1>
          <p className="text-[#555A60]">Customize invoice and purchase order templates.</p>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeType} onValueChange={(v) => setActiveType(v as 'invoice' | 'purchase-order')}>
        <TabsList>
          <TabsTrigger value="invoice">Invoice Templates</TabsTrigger>
          <TabsTrigger value="purchase-order">Purchase Order Templates</TabsTrigger>
        </TabsList>
        
        <TabsContent value="invoice" className="mt-6">
          <div className="space-y-6">
            {/* Template Preview */}
            <div className="bg-white rounded-xl border border-[#E4E7E7] p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[#1E2025]">Invoice Template Preview</h2>
                <button
                  onClick={() => toast.info('Template editing coming soon')}
                  className="flex items-center gap-2 px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <Edit size={18} aria-hidden="true" />
                  Edit Template
                </button>
              </div>
              
              {/* Sample Invoice */}
              <div className="border-2 border-[#E4E7E7] rounded-lg p-8 bg-white">
                <div className="mb-8">
                  <h3 className="text-[#1E2025] mb-2">INVOICE</h3>
                  <p className="text-[#555A60]">Invoice #: INV-2025-001</p>
                  <p className="text-[#555A60]">Date: {formatDate(new Date())}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <h4 className="text-[#555A60] mb-2">From:</h4>
                    <p className="text-[#1E2025]">{companySettings.name}</p>
                    <p className="text-[#555A60]">{companySettings.address}</p>
                    <p className="text-[#555A60]">{companySettings.phone}</p>
                    <p className="text-[#555A60]">{companySettings.email}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-[#555A60] mb-2">Bill To:</h4>
                    <p className="text-[#1E2025]">{'[Client Name]'}</p>
                    <p className="text-[#555A60]">{'[Client Company]'}</p>
                    <p className="text-[#555A60]">{'[Client Address]'}</p>
                    <p className="text-[#555A60]">{'[Client Email]'}</p>
                  </div>
                </div>
                
                <table className="w-full mb-8">
                  <thead className="border-b-2 border-[#E4E7E7]">
                    <tr>
                      <th className="text-left py-3 text-[#555A60]">Description</th>
                      <th className="text-right py-3 text-[#555A60]">Qty</th>
                      <th className="text-right py-3 text-[#555A60]">Rate</th>
                      <th className="text-right py-3 text-[#555A60]">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7E7]">
                    <tr>
                      <td className="py-3 text-[#1E2025]">{'[Job Name]'}</td>
                      <td className="text-right py-3 text-[#555A60]">{'[Qty]'}</td>
                      <td className="text-right py-3 text-[#555A60]">{'[Rate]'}</td>
                      <td className="text-right py-3 text-[#1E2025]">{'[Amount]'}</td>
                    </tr>
                  </tbody>
                </table>
                
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-[#555A60]">
                      <span>Subtotal:</span>
                      <span>{'[Subtotal]'}</span>
                    </div>
                    <div className="flex justify-between text-[#555A60]">
                      <span>Tax ({companySettings.defaultTaxRate}%):</span>
                      <span>{'[Tax]'}</span>
                    </div>
                    <div className="flex justify-between text-[#1E2025] pt-2 border-t border-[#E4E7E7]">
                      <span>Total:</span>
                      <span>{'[Total]'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-8 border-t border-[#E4E7E7]">
                  <p className="text-[#7C8085]">
                    Payment is due within 30 days. Thank you for your business!
                  </p>
                </div>
              </div>
            </div>
            
            {/* Variables Reference */}
            <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
              <h3 className="text-[#1E2025] mb-4">Available Variables</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="text-[#555A60] mb-3">Company</h4>
                  <ul className="space-y-2 text-[#7C8085]">
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{company.name}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{company.address}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{company.phone}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{company.email}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{company.taxId}}'}</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="text-[#555A60] mb-3">Client</h4>
                  <ul className="space-y-2 text-[#7C8085]">
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{client.name}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{client.company}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{client.address}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{client.email}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{client.phone}}'}</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="text-[#555A60] mb-3">Order</h4>
                  <ul className="space-y-2 text-[#7C8085]">
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{order.id}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{order.date}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{order.subtotal}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{order.tax}}'}</li>
                    <li className="font-mono bg-[#F2F4F4] px-2 py-1 rounded">{'{{order.total}}'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="purchase-order" className="mt-6">
          <div className="space-y-6">
            {/* Template Preview */}
            <div className="bg-white rounded-xl border border-[#E4E7E7] p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[#1E2025]">Purchase Order Template Preview</h2>
                <button
                  onClick={() => toast.info('Template editing coming soon')}
                  className="flex items-center gap-2 px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <Edit size={18} aria-hidden="true" />
                  Edit Template
                </button>
              </div>
              
              {/* Sample PO */}
              <div className="border-2 border-[#E4E7E7] rounded-lg p-8 bg-white">
                <div className="mb-8">
                  <h3 className="text-[#1E2025] mb-2">PURCHASE ORDER</h3>
                  <p className="text-[#555A60]">PO #: PO-2025-001</p>
                  <p className="text-[#555A60]">Date: {formatDate(new Date())}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <h4 className="text-[#555A60] mb-2">Vendor:</h4>
                    <p className="text-[#1E2025]">{companySettings.name}</p>
                    <p className="text-[#555A60]">{companySettings.address}</p>
                    <p className="text-[#555A60]">{companySettings.phone}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-[#555A60] mb-2">Ship To:</h4>
                    <p className="text-[#1E2025]">{'[Client Name]'}</p>
                    <p className="text-[#555A60]">{'[Client Company]'}</p>
                    <p className="text-[#555A60]">{'[Client Address]'}</p>
                  </div>
                </div>
                
                <table className="w-full mb-8">
                  <thead className="border-b-2 border-[#E4E7E7]">
                    <tr>
                      <th className="text-left py-3 text-[#555A60]">Item Description</th>
                      <th className="text-right py-3 text-[#555A60]">Quantity</th>
                      <th className="text-right py-3 text-[#555A60]">Unit Price</th>
                      <th className="text-right py-3 text-[#555A60]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7E7]">
                    <tr>
                      <td className="py-3 text-[#1E2025]">{'[Job Name]'}</td>
                      <td className="text-right py-3 text-[#555A60]">{'[Qty]'}</td>
                      <td className="text-right py-3 text-[#555A60]">{'[Price]'}</td>
                      <td className="text-right py-3 text-[#1E2025]">{'[Total]'}</td>
                    </tr>
                  </tbody>
                </table>
                
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-[#555A60]">
                      <span>Subtotal:</span>
                      <span>{'[Subtotal]'}</span>
                    </div>
                    <div className="flex justify-between text-[#555A60]">
                      <span>Tax:</span>
                      <span>{'[Tax]'}</span>
                    </div>
                    <div className="flex justify-between text-[#1E2025] pt-2 border-t border-[#E4E7E7]">
                      <span>Total:</span>
                      <span>{'[Total]'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
