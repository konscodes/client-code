// Job catalog page - manage job templates
import { useState, useMemo } from 'react';
import { useApp } from '../lib/app-context';
import { formatCurrency, formatDate, generateId } from '../lib/utils';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import type { JobTemplate } from '../lib/types';

interface JobCatalogProps {
  onNavigate: (page: string, id?: string) => void;
}

export function JobCatalog({ onNavigate }: JobCatalogProps) {
  const { jobTemplates, addJobTemplate, updateJobTemplate, deleteJobTemplate } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editingJob, setEditingJob] = useState<JobTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<JobTemplate>>({
    name: '',
    description: '',
    category: '',
    unitPrice: 0,
    unitOfMeasure: 'hour',
    defaultTax: true,
  });
  
  const categories = useMemo(() => {
    const cats = new Set(jobTemplates.map(j => j.category));
    return ['all', ...Array.from(cats)];
  }, [jobTemplates]);
  
  const filteredJobs = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return jobTemplates.filter(job => {
      const matchesSearch = 
        job.name.toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query) ||
        job.category.toLowerCase().includes(query);
      
      const matchesCategory = categoryFilter === 'all' || job.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [jobTemplates, searchQuery, categoryFilter]);
  
  const handleOpenCreate = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      unitPrice: 0,
      unitOfMeasure: 'hour',
      defaultTax: true,
    });
    setEditingJob(null);
    setIsCreating(true);
  };
  
  const handleOpenEdit = (job: JobTemplate) => {
    setFormData(job);
    setEditingJob(job);
    setIsCreating(true);
  };
  
  const handleClose = () => {
    setIsCreating(false);
    setEditingJob(null);
    setFormData({
      name: '',
      description: '',
      category: '',
      unitPrice: 0,
      unitOfMeasure: 'hour',
      defaultTax: true,
    });
  };
  
  const handleSave = () => {
    if (!formData.name || !formData.category || formData.unitPrice === undefined) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (editingJob) {
      updateJobTemplate(editingJob.id, formData);
      toast.success('Job template updated');
    } else {
      const newJob: JobTemplate = {
        id: generateId('job'),
        name: formData.name,
        description: formData.description || '',
        category: formData.category,
        unitPrice: formData.unitPrice,
        unitOfMeasure: formData.unitOfMeasure || 'hour',
        defaultTax: formData.defaultTax ?? true,
        lastUpdated: new Date(),
      };
      addJobTemplate(newJob);
      toast.success('Job template created');
    }
    
    handleClose();
  };
  
  const handleDelete = (job: JobTemplate) => {
    if (confirm(`Are you sure you want to delete "${job.name}"?`)) {
      deleteJobTemplate(job.id);
      toast.success('Job template deleted');
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">Job Catalog</h1>
          <p className="text-[#555A60]">Manage reusable job templates with default pricing.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
        >
          <Plus size={20} aria-hidden="true" />
          New Job
        </button>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[300px] max-w-md relative">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C8085]" 
            size={20}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search jobs by name, description, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search jobs"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-2 rounded-lg transition-colors capitalize ${
                categoryFilter === cat
                  ? 'bg-[#1F744F] text-white'
                  : 'bg-white text-[#555A60] border border-[#E4E7E7] hover:bg-[#F7F8F8]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      
      {/* Jobs Grid */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4E7E7] px-6 py-12 text-center">
          {searchQuery || categoryFilter !== 'all' ? (
            <>
              <p className="text-[#7C8085] mb-2">No jobs found</p>
              <p className="text-[#7C8085]">Try adjusting your filters or search query</p>
            </>
          ) : (
            <>
              <p className="text-[#7C8085] mb-4">No job templates yet</p>
              <button
                onClick={handleOpenCreate}
                className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
              >
                Create your first job template
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map(job => (
            <div
              key={job.id}
              className="bg-white rounded-xl border border-[#E4E7E7] p-6 hover:border-[#1F744F] transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-[#1E2025] mb-1">{job.name}</h3>
                  <span className="inline-block px-2 py-1 bg-[#F2F4F4] text-[#7C8085] rounded text-sm">
                    {job.category}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenEdit(job)}
                    className="p-2 text-[#555A60] hover:bg-[#F7F8F8] rounded-lg transition-colors"
                    aria-label={`Edit ${job.name}`}
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(job)}
                    className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors"
                    aria-label={`Delete ${job.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <p className="text-[#555A60] mb-4 line-clamp-2">{job.description}</p>
              
              <div className="flex items-center justify-between pt-4 border-t border-[#E4E7E7]">
                <div>
                  <p className="text-[#7C8085]">Default Price</p>
                  <p className="text-[#1F744F]">
                    {formatCurrency(job.unitPrice)} / {job.unitOfMeasure}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[#7C8085]">Updated</p>
                  <p className="text-[#555A60]">{formatDate(job.lastUpdated)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Edit/Create Dialog */}
      <Dialog open={isCreating} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingJob ? 'Edit Job Template' : 'Create Job Template'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jobName">Job Name *</Label>
                <Input
                  id="jobName"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., MIG Welding - Steel"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Welding"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detailed description of the job..."
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unitPrice">Unit Price *</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.unitPrice || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    unitPrice: parseFloat(e.target.value) || 0 
                  })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                <Input
                  id="unitOfMeasure"
                  value={formData.unitOfMeasure || ''}
                  onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                  placeholder="e.g., hour, unit"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="defaultTax"
                checked={formData.defaultTax ?? true}
                onChange={(e) => setFormData({ ...formData, defaultTax: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="defaultTax" className="cursor-pointer">
                Tax applicable by default
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
            >
              {editingJob ? 'Save Changes' : 'Create Job'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
