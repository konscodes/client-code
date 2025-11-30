// Order detail page - create and manage orders with job line items
import { useState, useMemo } from 'react';
import { useApp } from '../lib/app-context';
import { StatusPill } from '../components/status-pill';
import { 
  formatCurrency, 
  formatDate,
  calculateLineTotal,
  getOrderTotals,
  generateOrderId,
  generateId
} from '../lib/utils';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save,
  FileText,
  Layers
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select';
import type { Order, OrderJob, OrderStatus } from '../lib/types';
import { toast } from 'sonner';

interface OrderDetailProps {
  orderId: string;
  onNavigate: (page: string, id?: string) => void;
}

export function OrderDetail({ orderId, onNavigate }: OrderDetailProps) {
  const { orders, clients, jobTemplates, jobPresets, addOrder, updateOrder } = useApp();
  
  const isNewOrder = orderId === 'new';
  const existingOrder = useMemo(() => 
    isNewOrder ? null : orders.find(o => o.id === orderId),
    [orders, orderId, isNewOrder]
  );
  
  const [formData, setFormData] = useState<Partial<Order>>(
    existingOrder || {
      id: generateOrderId(),
      clientId: '',
      status: 'draft',
      taxRate: 8.5,
      globalMarkup: 20,
      currency: 'USD',
      notesInternal: '',
      notesPublic: '',
      jobs: [],
    }
  );
  
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  
  const selectedClient = useMemo(() => 
    formData.clientId ? clients.find(c => c.id === formData.clientId) : null,
    [clients, formData.clientId]
  );
  
  const totals = useMemo(() => 
    getOrderTotals(formData as Order),
    [formData]
  );
  
  const handleSave = () => {
    if (!formData.clientId) {
      toast.error('Please select a client');
      return;
    }
    
    const orderData: Order = {
      id: formData.id || generateOrderId(),
      clientId: formData.clientId,
      status: formData.status as OrderStatus || 'draft',
      createdAt: existingOrder?.createdAt || new Date(),
      updatedAt: new Date(),
      taxRate: formData.taxRate || 8.5,
      globalMarkup: formData.globalMarkup || 0,
      currency: formData.currency || 'USD',
      notesInternal: formData.notesInternal || '',
      notesPublic: formData.notesPublic || '',
      jobs: formData.jobs || [],
    };
    
    if (isNewOrder) {
      addOrder(orderData);
      toast.success('Order created successfully');
      onNavigate('order-detail', orderData.id);
    } else {
      updateOrder(orderData.id, orderData);
      toast.success('Order updated successfully');
    }
  };
  
  const handleAddJob = (jobId: string) => {
    const job = jobTemplates.find(j => j.id === jobId);
    if (!job) return;
    
    const newJob: OrderJob = {
      id: generateId('job'),
      jobId: job.id,
      jobName: job.name,
      description: job.description,
      quantity: 1,
      unitPrice: job.unitPrice,
      lineMarkup: formData.globalMarkup || 0,
      taxApplicable: job.defaultTax,
      position: formData.jobs?.length || 0,
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), newJob],
    });
    
    toast.success(`Added ${job.name}`);
  };
  
  const handleAddPreset = (presetId: string) => {
    const preset = jobPresets.find(p => p.id === presetId);
    if (!preset) return;
    
    const newJobs: OrderJob[] = preset.jobs.map((presetJob, index) => {
      const job = jobTemplates.find(j => j.id === presetJob.jobId);
      if (!job) return null;
      
      return {
        id: generateId('job'),
        jobId: job.id,
        jobName: job.name,
        description: job.description,
        quantity: presetJob.defaultQty,
        unitPrice: job.unitPrice,
        lineMarkup: formData.globalMarkup || 0,
        taxApplicable: job.defaultTax,
        position: (formData.jobs?.length || 0) + index,
      };
    }).filter(Boolean) as OrderJob[];
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), ...newJobs],
    });
    
    setShowPresetPicker(false);
    toast.success(`Added ${preset.name} preset`);
  };
  
  const handleRemoveJob = (jobId: string) => {
    setFormData({
      ...formData,
      jobs: formData.jobs?.filter(j => j.id !== jobId) || [],
    });
  };
  
  const handleUpdateJob = (jobId: string, updates: Partial<OrderJob>) => {
    setFormData({
      ...formData,
      jobs: formData.jobs?.map(j => 
        j.id === jobId ? { ...j, ...updates } : j
      ) || [],
    });
  };
  
  const handleApplyGlobalMarkup = () => {
    if (!formData.jobs) return;
    
    setFormData({
      ...formData,
      jobs: formData.jobs.map(j => ({
        ...j,
        lineMarkup: formData.globalMarkup || 0,
      })),
    });
    
    toast.success('Applied markup to all jobs');
  };
  
  if (!isNewOrder && !existingOrder) {
    return (
      <div className="text-center py-12">
        <p className="text-[#7C8085] mb-4">Order not found</p>
        <button
          onClick={() => onNavigate('orders')}
          className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
        >
          Back to Orders
        </button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('orders')}
            className="p-2 hover:bg-[#E4E7E7] rounded-lg transition-colors"
            aria-label="Back to orders"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-[#1E2025] mb-1">
              {isNewOrder ? 'New Order' : formData.id}
            </h1>
            {selectedClient && (
              <button
                onClick={() => onNavigate('client-detail', selectedClient.id)}
                className="text-left cursor-pointer"
                onMouseEnter={(e) => {
                  const p = e.currentTarget.querySelector('p');
                  const spans = e.currentTarget.querySelectorAll('span');
                  if (p) p.style.textDecoration = 'underline';
                  spans.forEach(span => {
                    span.style.color = '#1F744F';
                  });
                }}
                onMouseLeave={(e) => {
                  const p = e.currentTarget.querySelector('p');
                  const spans = e.currentTarget.querySelectorAll('span');
                  if (p) p.style.textDecoration = 'none';
                  spans.forEach(span => {
                    span.style.color = '';
                  });
                  // Reset company-only case
                  if (spans.length === 0 && p) {
                    p.style.color = '';
                  }
                }}
              >
                {selectedClient.name && selectedClient.name !== 'Unknown' ? (
                  <p className="text-[#555A60]">
                    <span className="transition-colors">{selectedClient.name}</span>
                    {' · '}
                    <span className="transition-colors">{selectedClient.company}</span>
                  </p>
                ) : (
                  <p className="text-[#555A60] transition-all">{selectedClient.company}</p>
                )}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
        >
          <Save size={20} aria-hidden="true" />
          {isNewOrder ? 'Create Order' : 'Save Changes'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Info Card */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-4">Order Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">Client *</Label>
                <Select
                  value={formData.clientId || ''}
                  onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                >
                  <SelectTrigger id="client">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} - {client.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status || 'draft'}
                  onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="billed">Billed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notesInternal">Internal Notes</Label>
                <Textarea
                  id="notesInternal"
                  value={formData.notesInternal || ''}
                  onChange={(e) => setFormData({ ...formData, notesInternal: e.target.value })}
                  rows={2}
                  placeholder="Notes for internal use only..."
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notesPublic">Client-Visible Notes</Label>
                <Textarea
                  id="notesPublic"
                  value={formData.notesPublic || ''}
                  onChange={(e) => setFormData({ ...formData, notesPublic: e.target.value })}
                  rows={2}
                  placeholder="Notes that will appear on invoices..."
                />
              </div>
            </div>
          </div>
          
          {/* Line Items */}
          <div className="bg-white rounded-xl border border-[#E4E7E7]">
            <div className="px-6 py-4 border-b border-[#E4E7E7] flex items-center justify-between">
              <h2 className="text-[#1E2025]">Line Items</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPresetPicker(!showPresetPicker)}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <Layers size={18} aria-hidden="true" />
                  Add Preset
                </button>
                <button
                  onClick={() => setShowJobPicker(!showJobPicker)}
                  className="flex items-center gap-2 px-3 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                >
                  <Plus size={18} aria-hidden="true" />
                  Add Job
                </button>
              </div>
            </div>
            
            {/* Job Picker */}
            {showJobPicker && (
              <div className="px-6 py-4 border-b border-[#E4E7E7] bg-[#F7F8F8]">
                <h3 className="text-[#555A60] mb-3">Select a job to add:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {jobTemplates.map(job => (
                    <button
                      key={job.id}
                      onClick={() => {
                        handleAddJob(job.id);
                        setShowJobPicker(false);
                      }}
                      className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left"
                    >
                      <p className="text-[#1E2025] mb-1">{job.name}</p>
                      <p className="text-[#7C8085] mb-1">{job.description}</p>
                      <p className="text-[#1F744F]">
                        {formatCurrency(job.unitPrice)} / {job.unitOfMeasure}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Preset Picker */}
            {showPresetPicker && (
              <div className="px-6 py-4 border-b border-[#E4E7E7] bg-[#F7F8F8]">
                <h3 className="text-[#555A60] mb-3">Select a preset to add:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {jobPresets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleAddPreset(preset.id)}
                      className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left"
                    >
                      <p className="text-[#1E2025] mb-1">{preset.name}</p>
                      <p className="text-[#7C8085] mb-1">{preset.description}</p>
                      <p className="text-[#555A60]">{preset.jobs.length} jobs</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Line Items Table */}
            {!formData.jobs || formData.jobs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[#7C8085] mb-4">No line items yet</p>
                <p className="text-[#7C8085]">Add jobs from the catalog or use a preset to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E4E7E7]">
                      <th className="px-6 py-3 text-left text-[#555A60]">Job</th>
                      <th className="px-6 py-3 text-left text-[#555A60]">Qty</th>
                      <th className="px-6 py-3 text-left text-[#555A60]">Unit Price</th>
                      <th className="px-6 py-3 text-left text-[#555A60]">Markup %</th>
                      <th className="px-6 py-3 text-right text-[#555A60]">Line Total</th>
                      <th className="px-6 py-3 text-right text-[#555A60]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7E7]">
                    {formData.jobs.map(job => {
                      const lineTotal = calculateLineTotal(job);
                      
                      return (
                        <tr key={job.id}>
                          <td className="px-6 py-4">
                            <p className="text-[#1E2025]">{job.jobName}</p>
                            <p className="text-[#7C8085]">{job.description}</p>
                          </td>
                          <td className="px-6 py-4">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={job.quantity}
                              onChange={(e) => handleUpdateJob(job.id, { 
                                quantity: parseFloat(e.target.value) || 0 
                              })}
                              className="w-20"
                              aria-label={`Quantity for ${job.jobName}`}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={job.unitPrice}
                              onChange={(e) => handleUpdateJob(job.id, { 
                                unitPrice: parseFloat(e.target.value) || 0 
                              })}
                              className="w-28"
                              aria-label={`Unit price for ${job.jobName}`}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={job.lineMarkup}
                              onChange={(e) => handleUpdateJob(job.id, { 
                                lineMarkup: parseFloat(e.target.value) || 0 
                              })}
                              className="w-20"
                              aria-label={`Markup for ${job.jobName}`}
                            />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-[#1E2025]">{formatCurrency(lineTotal)}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleRemoveJob(job.id)}
                              className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors"
                              aria-label={`Remove ${job.jobName}`}
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Sidebar - Pricing Summary */}
        <div className="space-y-6">
          {/* Markup Controls */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h3 className="text-[#1E2025] mb-4">Markup & Tax</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="globalMarkup">Global Markup %</Label>
                <Input
                  id="globalMarkup"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.globalMarkup || 0}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    globalMarkup: parseFloat(e.target.value) || 0 
                  })}
                />
              </div>
              
              <button
                onClick={handleApplyGlobalMarkup}
                className="w-full px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                disabled={!formData.jobs || formData.jobs.length === 0}
              >
                Apply to All Jobs
              </button>
              
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate %</Label>
                <Input
                  id="taxRate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.taxRate || 0}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    taxRate: parseFloat(e.target.value) || 0 
                  })}
                />
              </div>
            </div>
          </div>
          
          {/* Pricing Summary */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h3 className="text-[#1E2025] mb-4">Order Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[#555A60]">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[#555A60]">
                <span>Tax ({formData.taxRate}%)</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
              <div className="pt-3 border-t border-[#E4E7E7]">
                <div className="flex items-center justify-between text-[#1E2025]">
                  <span>Total</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Document Generation */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h3 className="text-[#1E2025] mb-4">Documents</h3>
            <div className="space-y-2">
              <button
                onClick={() => toast.info('Invoice generation coming soon')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                disabled={!formData.clientId || !formData.jobs || formData.jobs.length === 0}
              >
                <FileText size={18} aria-hidden="true" />
                Generate Invoice
              </button>
              <button
                onClick={() => toast.info('PO generation coming soon')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                disabled={!formData.clientId || !formData.jobs || formData.jobs.length === 0}
              >
                <FileText size={18} aria-hidden="true" />
                Generate PO
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
