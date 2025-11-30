// Job presets page - manage preset bundles of jobs
import { useState, useMemo } from 'react';
import { useApp } from '../lib/app-context';
import { formatDate, generateId } from '../lib/utils';
import { Plus, Edit, Trash2, Layers } from 'lucide-react';
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
import type { JobPreset, PresetJob } from '../lib/types';

interface JobPresetsProps {
  onNavigate: (page: string, id?: string) => void;
  presetIdToEdit?: string;
}

export function JobPresets({ onNavigate, presetIdToEdit }: JobPresetsProps) {
  const { jobPresets, jobTemplates, addJobPreset, updateJobPreset, deleteJobPreset } = useApp();
  const [editingPreset, setEditingPreset] = useState<JobPreset | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<JobPreset>>({
    name: '',
    description: '',
    category: '',
    jobs: [],
  });
  
  const handleOpenCreate = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      jobs: [],
    });
    setEditingPreset(null);
    setIsEditing(true);
  };
  
  const handleOpenEdit = (preset: JobPreset) => {
    setFormData(preset);
    setEditingPreset(preset);
    setIsEditing(true);
  };
  
  const handleClose = () => {
    setIsEditing(false);
    setEditingPreset(null);
    setFormData({
      name: '',
      description: '',
      category: '',
      jobs: [],
    });
  };
  
  // Removed - jobs are now added from job catalog
  
  const handleRemoveJob = (jobId: string) => {
    setFormData({
      ...formData,
      jobs: formData.jobs?.filter(j => j.jobId !== jobId) || [],
    });
  };
  
  const handleUpdateJobQty = (jobId: string, qty: number) => {
    setFormData({
      ...formData,
      jobs: formData.jobs?.map(j => 
        j.jobId === jobId ? { ...j, defaultQty: qty } : j
      ) || [],
    });
  };
  
  const handleSave = async () => {
    if (!formData.name || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (editingPreset) {
      await updateJobPreset(editingPreset.id, formData);
      toast.success('Preset updated');
    } else {
      const newPreset: JobPreset = {
        id: generateId('preset'),
        name: formData.name,
        description: formData.description || '',
        category: formData.category,
        jobs: formData.jobs || [],
        lastUpdated: new Date(),
      };
      await addJobPreset(newPreset);
      toast.success('Preset created');
    }
    
    handleClose();
  };
  
  const handleDelete = (preset: JobPreset) => {
    if (confirm(`Are you sure you want to delete "${preset.name}"?`)) {
      deleteJobPreset(preset.id);
      toast.success('Preset deleted');
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">Job Presets</h1>
          <p className="text-[#555A60]">Create bundles of frequently used jobs for faster order assembly.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
        >
          <Plus size={20} aria-hidden="true" />
          New Preset
        </button>
      </div>
      
      {/* Presets Grid */}
      {jobPresets.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4E7E7] px-6 py-12 text-center">
          <Layers size={48} className="mx-auto text-[#B5BDB9] mb-4" aria-hidden="true" />
          <p className="text-[#7C8085] mb-4">No job presets yet</p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
          >
            Create your first preset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobPresets.map(preset => (
            <div
              key={preset.id}
              onClick={() => handleOpenEdit(preset)}
              className="bg-white rounded-xl border border-[#E4E7E7] p-6 hover:border-[#1F744F] transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-[#1E2025] mb-1">{preset.name}</h3>
                  <span className="inline-block px-2 py-1 bg-[#F2F4F4] text-[#7C8085] rounded text-sm">
                    {preset.category}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(preset);
                    }}
                    className="p-2 text-[#555A60] hover:bg-[#F7F8F8] rounded-lg transition-colors"
                    aria-label={`Edit ${preset.name}`}
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(preset);
                    }}
                    className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors"
                    aria-label={`Delete ${preset.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <p className="text-[#555A60] mb-4 line-clamp-2">{preset.description}</p>
              
              <div className="pt-4 border-t border-[#E4E7E7]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#7C8085]">Total Jobs</p>
                    <p className="text-[#1E2025]">{preset.jobs.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#7C8085]">Updated</p>
                    <p className="text-[#555A60]">{formatDate(preset.lastUpdated)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Edit/Create Dialog */}
      <Dialog open={isEditing} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>
              {editingPreset ? 'Edit Preset' : 'Create Preset'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="presetName">Preset Name *</Label>
                <Input
                  id="presetName"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Standard Steel Welding Package"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="presetCategory">Category *</Label>
                <Input
                  id="presetCategory"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Welding"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="presetDescription">Description</Label>
              <Textarea
                id="presetDescription"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe when to use this preset..."
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Jobs in Preset</Label>
              <p className="text-xs text-[#555A60] mb-3">
                Jobs are managed from the Job Catalog page. Edit jobs there and select which presets they belong to.
              </p>
              
              {!formData.jobs || formData.jobs.length === 0 ? (
                <p className="text-[#7C8085] text-center py-6 border border-dashed border-[#E4E7E7] rounded-lg">
                  No jobs added yet. Go to Job Catalog to add jobs to this preset.
                </p>
              ) : (
                <div className="border border-[#E4E7E7] rounded-lg divide-y divide-[#E4E7E7]">
                  {formData.jobs.map(presetJob => {
                    const job = jobTemplates.find(j => j.id === presetJob.jobId);
                    if (!job) return null;
                    
                    return (
                      <div key={presetJob.jobId} className="p-3 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-[#1E2025]">{job.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`qty-${presetJob.jobId}`} className="text-[#7C8085] whitespace-nowrap">
                            Qty:
                          </Label>
                          <Input
                            id={`qty-${presetJob.jobId}`}
                            type="number"
                            min="1"
                            value={presetJob.defaultQty}
                            onChange={(e) => handleUpdateJobQty(presetJob.jobId, parseInt(e.target.value) || 1)}
                            className="w-20"
                          />
                          <button
                            onClick={() => handleRemoveJob(presetJob.jobId)}
                            className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors"
                            aria-label={`Remove ${job.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
              {editingPreset ? 'Save Changes' : 'Create Preset'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
