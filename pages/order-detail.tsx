// Order detail page - create and manage orders with job line items
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { StatusPill } from '../components/status-pill';
import { 
  calculateLineTotal,
  getOrderTotals,
  generateOrderId,
  generateId,
  generateDocumentNumber
} from '../lib/utils';
import { generateInvoice, generatePurchaseOrder } from '../lib/document-generator';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save,
  FileText,
  Layers,
  Search,
  Loader2,
  Copy,
  Edit2,
  Check,
  X
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
  const { t } = useTranslation();
  const { orders, clients, jobTemplates, jobPresets, companySettings, addOrder, updateOrder } = useApp();
  const { formatCurrency, formatDate } = useFormatting();
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [generatingPO, setGeneratingPO] = useState(false);
  
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
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingJobName, setEditingJobName] = useState('');
  
  const selectedClient = useMemo(() => 
    formData.clientId ? clients.find(c => c.id === formData.clientId) : null,
    [clients, formData.clientId]
  );
  
  const totals = useMemo(() => 
    getOrderTotals(formData as Order),
    [formData]
  );
  
  const filteredJobs = useMemo(() => {
    if (!jobSearchQuery.trim()) return [];
    const query = jobSearchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return jobTemplates
      .filter(job => {
        const searchableText = `${job.name} ${job.description} ${job.category}`.toLowerCase();
        // Check if all query words appear in the searchable text
        return queryWords.every(word => searchableText.includes(word));
      })
      .slice(0, 10);
  }, [jobTemplates, jobSearchQuery]);
  
  const filteredPresets = useMemo(() => {
    if (!presetSearchQuery.trim()) return jobPresets;
    const query = presetSearchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return jobPresets.filter(preset => {
      const searchableText = `${preset.name} ${preset.description} ${preset.category}`.toLowerCase();
      // Check if all query words appear in the searchable text
      return queryWords.every(word => searchableText.includes(word));
    });
  }, [jobPresets, presetSearchQuery]);
  
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
  
  const handleDuplicateJob = (jobId: string) => {
    const jobToDuplicate = formData.jobs?.find(j => j.id === jobId);
    if (!jobToDuplicate) return;
    
    const duplicatedJob: OrderJob = {
      ...jobToDuplicate,
      id: generateId('order-job'),
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), duplicatedJob],
    });
  };
  
  const handleStartEditJobName = (jobId: string) => {
    const job = formData.jobs?.find(j => j.id === jobId);
    if (job) {
      setEditingJobId(jobId);
      setEditingJobName(job.jobName);
    }
  };
  
  const handleSaveJobName = (jobId: string) => {
    if (editingJobName.trim()) {
      handleUpdateJob(jobId, { jobName: editingJobName.trim() });
    }
    setEditingJobId(null);
    setEditingJobName('');
  };
  
  const handleCancelEditJobName = () => {
    setEditingJobId(null);
    setEditingJobName('');
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
          className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
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
            className="p-2 hover:bg-[#E4E7E7] rounded-lg transition-colors cursor-pointer"
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
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
        >
          <Save size={20} aria-hidden="true" />
          {isNewOrder ? t('orderDetail.createOrder') : t('common.saveChanges')}
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Info Card */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-4">{t('orderDetail.orderInformation')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">{t('orderDetail.clientRequired')}</Label>
                <Select
                  value={formData.clientId || ''}
                  onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                >
                  <SelectTrigger id="client">
                    <SelectValue placeholder={t('orderDetail.selectClient')} />
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
                <Label htmlFor="status">{t('orderDetail.status')}</Label>
                <Select
                  value={formData.status || 'draft'}
                  onValueChange={(value) => setFormData({ ...formData, status: value as OrderStatus })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t('orders.draft')}</SelectItem>
                    <SelectItem value="approved">{t('orders.approved')}</SelectItem>
                    <SelectItem value="in-progress">{t('orders.inProgress')}</SelectItem>
                    <SelectItem value="completed">{t('orders.completed')}</SelectItem>
                    <SelectItem value="billed">{t('orders.billed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notesInternal">{t('orderDetail.notesInternal')}</Label>
                <Textarea
                  id="notesInternal"
                  value={formData.notesInternal || ''}
                  onChange={(e) => setFormData({ ...formData, notesInternal: e.target.value })}
                  rows={2}
                  placeholder={t('orderDetail.notesInternalPlaceholder')}
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notesPublic">{t('orderDetail.notesPublic')}</Label>
                <Textarea
                  id="notesPublic"
                  value={formData.notesPublic || ''}
                  onChange={(e) => setFormData({ ...formData, notesPublic: e.target.value })}
                  rows={2}
                  placeholder={t('orderDetail.notesPublicPlaceholder')}
                />
              </div>
            </div>
          </div>
          
          {/* Line Items */}
          <div className="bg-white rounded-xl border border-[#E4E7E7]">
            <div className="px-6 py-4 border-b border-[#E4E7E7] flex items-center justify-between">
              <h2 className="text-[#1E2025]">{t('orderDetail.lineItems')}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (showPresetPicker) {
                      setPresetSearchQuery('');
                    }
                    setShowPresetPicker(!showPresetPicker);
                    if (!showPresetPicker) {
                      setShowJobPicker(false);
                      setJobSearchQuery('');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
                >
                  <Layers size={18} aria-hidden="true" />
                  {t('orderDetail.addPreset')}
                </button>
                <button
                  onClick={() => {
                    if (showJobPicker) {
                      setJobSearchQuery('');
                    }
                    setShowJobPicker(!showJobPicker);
                    if (!showJobPicker) {
                      setShowPresetPicker(false);
                      setPresetSearchQuery('');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
                >
                  <Plus size={18} aria-hidden="true" />
                  {t('orderDetail.addJob')}
                </button>
              </div>
            </div>
            
            {/* Job Picker */}
            {showJobPicker && (
              <div className="px-6 py-4 border-b border-[#E4E7E7] bg-[#F7F8F8]">
                <h3 className="text-[#555A60] mb-3">{t('orderDetail.selectJobToAdd')}</h3>
                <div className="relative mb-3">
                  <Search 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
                    size={18}
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    placeholder={t('orderDetail.searchJobsPlaceholder')}
                    value={jobSearchQuery}
                    onChange={(e) => setJobSearchQuery(e.target.value)}
                    className="pl-10"
                    aria-label={t('orderDetail.searchJobsLabel')}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {filteredJobs.length === 0 ? (
                    <div className="col-span-2 text-center py-4 text-[#7C8085]">
                      {jobSearchQuery.trim() ? t('orderDetail.noJobsFound') : t('orderDetail.startTypingToSearch')}
                    </div>
                  ) : (
                    filteredJobs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => {
                          handleAddJob(job.id);
                          setShowJobPicker(false);
                          setJobSearchQuery('');
                        }}
                        className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left cursor-pointer"
                      >
                        <p className="text-[#1E2025] mb-1">{job.name}</p>
                        <p className="text-[#1F744F]">
                          {formatCurrency(job.unitPrice, formData.currency)} / {job.unitOfMeasure}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {/* Preset Picker */}
            {showPresetPicker && (
              <div className="px-6 py-4 border-b border-[#E4E7E7] bg-[#F7F8F8]">
                <h3 className="text-[#555A60] mb-3">{t('orderDetail.selectPresetToAdd')}</h3>
                <div className="relative mb-3">
                  <Search 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
                    size={18}
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    placeholder={t('orderDetail.searchPresetsPlaceholder')}
                    value={presetSearchQuery}
                    onChange={(e) => setPresetSearchQuery(e.target.value)}
                    className="pl-10"
                    aria-label={t('orderDetail.searchPresetsLabel')}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {filteredPresets.length === 0 ? (
                    <div className="col-span-2 text-center py-4 text-[#7C8085]">
                      {presetSearchQuery.trim() ? t('orderDetail.noPresetsFound') : t('orderDetail.noPresetsAvailable')}
                    </div>
                  ) : (
                    filteredPresets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          handleAddPreset(preset.id);
                          setShowPresetPicker(false);
                          setPresetSearchQuery('');
                        }}
                        className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left"
                      >
                        <p className="text-[#1E2025] mb-1">{preset.name}</p>
                        <p className="text-[#7C8085] mb-1 line-clamp-2">{preset.description}</p>
                        <p className="text-[#555A60]">{preset.jobs.length} {t('orderDetail.jobsCount')}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {/* Line Items Table */}
            {!formData.jobs || formData.jobs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[#7C8085] mb-4">{t('orderDetail.noLineItems')}</p>
                <p className="text-[#7C8085]">{t('orderDetail.noLineItemsDescription')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto relative">
                <div 
                  className="absolute right-[120px] top-0 bottom-0 w-8 pointer-events-none z-20"
                  style={{
                    background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 100%)'
                  }}
                />
                <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">Job</th>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">Qty</th>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">Unit Price</th>
                      <th className="px-6 py-3 text-left text-[#555A60] border-b border-[#E4E7E7]">Markup %</th>
                      <th className="px-6 py-3 text-right text-[#555A60] border-b border-[#E4E7E7]">Line Total</th>
                      <th 
                        className="px-6 py-3 text-right text-[#555A60] border-b border-[#E4E7E7] sticky right-0 z-10 bg-white border-l border-[#E4E7E7] shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                        style={{ 
                          position: 'sticky', 
                          right: 0, 
                          zIndex: 10, 
                          minWidth: '120px',
                          background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.jobs.map(job => {
                      const lineTotal = calculateLineTotal(job);
                      
                      return (
                        <tr key={job.id}>
                          <td className={`px-6 py-4 border-b border-[#E4E7E7] ${editingJobId === job.id ? 'min-w-[300px]' : ''}`}>
                            {editingJobId === job.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingJobName}
                                  onChange={(e) => setEditingJobName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveJobName(job.id);
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditJobName();
                                    }
                                  }}
                                  className="flex-1 min-w-[200px]"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveJobName(job.id)}
                                  className="p-1.5 text-[#1F744F] hover:bg-[#E8F5E9] rounded transition-colors cursor-pointer"
                                  aria-label="Save"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={handleCancelEditJobName}
                                  className="p-1.5 text-[#7C8085] hover:bg-[#F7F8F8] rounded transition-colors cursor-pointer"
                                  aria-label="Cancel"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <p 
                                  className="text-[#1E2025] cursor-pointer hover:text-[#1F744F] transition-colors"
                                  onClick={() => handleStartEditJobName(job.id)}
                                >
                                  {job.jobName}
                                </p>
                                <button
                                  onClick={() => handleStartEditJobName(job.id)}
                                  className="p-1 opacity-0 group-hover:opacity-100 text-[#7C8085] hover:text-[#1F744F] hover:bg-[#F7F8F8] rounded transition-all cursor-pointer"
                                  aria-label={t('orderDetail.editJobName')}
                                >
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 border-b border-[#E4E7E7]">
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
                          <td className="px-6 py-4 border-b border-[#E4E7E7]">
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
                          <td className="px-6 py-4 border-b border-[#E4E7E7]">
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
                          <td className="px-6 py-4 text-right border-b border-[#E4E7E7]">
                            <p className="text-[#1E2025]">{formatCurrency(lineTotal, formData.currency)}</p>
                          </td>
                          <td 
                            className="px-6 py-4 text-right border-b border-[#E4E7E7] sticky right-0 z-10 border-l border-[#E4E7E7] shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                            data-sticky="true"
                            style={{ 
                              position: 'sticky', 
                              right: 0, 
                              zIndex: 10, 
                              minWidth: '120px',
                              background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 100%)'
                            }}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleDuplicateJob(job.id)}
                                className="p-2 text-[#555A60] hover:bg-[#F7F8F8] rounded-lg transition-colors cursor-pointer"
                                aria-label={`Duplicate ${job.jobName}`}
                              >
                                <Copy size={18} />
                              </button>
                              <button
                                onClick={() => handleRemoveJob(job.id)}
                                className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors cursor-pointer"
                                aria-label={`Remove ${job.jobName}`}
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
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
            <h3 className="text-[#1E2025] mb-4">{t('orderDetail.markupAndTax')}</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="globalMarkup">{t('orderDetail.globalMarkup')}</Label>
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
                {t('orderDetail.applyToAllJobs')}
              </button>
              
              <div className="space-y-2">
                <Label htmlFor="taxRate">{t('orderDetail.taxRate')}</Label>
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
            <h3 className="text-[#1E2025] mb-4">{t('orderDetail.orderSummary')}</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[#555A60]">
                <span>{t('orderDetail.subtotal')}</span>
                <span>{formatCurrency(totals.subtotal, formData.currency)}</span>
              </div>
              <div className="flex items-center justify-between text-[#555A60]">
                <span>{t('orderDetail.tax')} ({formData.taxRate}%)</span>
                <span>{formatCurrency(totals.tax, formData.currency)}</span>
              </div>
              <div className="pt-3 border-t border-[#E4E7E7]">
                <div className="flex items-center justify-between text-[#1E2025]">
                  <span>{t('orderDetail.total')}</span>
                  <span>{formatCurrency(totals.total, formData.currency)}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Document Generation */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h3 className="text-[#1E2025] mb-4">{t('orderDetail.documents')}</h3>
            <div className="space-y-2">
              <button
                onClick={async () => {
                  if (!formData.clientId || !formData.jobs || formData.jobs.length === 0) {
                    toast.error('Please select a client and add line items');
                    return;
                  }
                  
                  const client = clients.find(c => c.id === formData.clientId);
                  if (!client) {
                    toast.error('Client not found');
                    return;
                  }
                  
                  if (!formData.id) {
                    toast.error('Please save the order first');
                    return;
                  }
                  
                  setGeneratingInvoice(true);
                  try {
                    const order = formData as Order;
                    const invoiceNumber = generateDocumentNumber(
                      companySettings.invoicePrefix,
                      order.id,
                      order.createdAt || new Date()
                    );
                    await generateInvoice(order, client, companySettings, invoiceNumber);
                    toast.success('Invoice generated successfully');
                  } catch (error) {
                    console.error('Error generating invoice:', error);
                    toast.error('Failed to generate invoice. Make sure the Python service is running on port 5001.');
                  } finally {
                    setGeneratingInvoice(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!formData.clientId || !formData.jobs || formData.jobs.length === 0 || generatingInvoice || generatingPO}
              >
                {generatingInvoice ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    {t('orderDetail.generating')}
                  </>
                ) : (
                  <>
                    <FileText size={18} aria-hidden="true" />
                    {t('orderDetail.generateInvoice')}
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  if (!formData.clientId || !formData.jobs || formData.jobs.length === 0) {
                    toast.error('Please select a client and add line items');
                    return;
                  }
                  
                  const client = clients.find(c => c.id === formData.clientId);
                  if (!client) {
                    toast.error('Client not found');
                    return;
                  }
                  
                  if (!formData.id) {
                    toast.error('Please save the order first');
                    return;
                  }
                  
                  setGeneratingPO(true);
                  try {
                    const order = formData as Order;
                    const poNumber = generateDocumentNumber(
                      companySettings.poPrefix,
                      order.id,
                      order.createdAt || new Date()
                    );
                    await generatePurchaseOrder(order, client, companySettings, poNumber);
                    toast.success('Purchase order generated successfully');
                  } catch (error) {
                    console.error('Error generating PO:', error);
                    toast.error('Failed to generate purchase order. Make sure the Python service is running on port 5001.');
                  } finally {
                    setGeneratingPO(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!formData.clientId || !formData.jobs || formData.jobs.length === 0 || generatingInvoice || generatingPO}
              >
                {generatingPO ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    {t('orderDetail.generating')}
                  </>
                ) : (
                  <>
                    <FileText size={18} aria-hidden="true" />
                    {t('orderDetail.generatePO')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
