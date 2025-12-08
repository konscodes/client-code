// Job presets page - manage preset bundles of jobs
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../lib/app-context';
import { useFormatting } from '../lib/use-formatting';
import { generateId } from '../lib/utils';
import { logger } from '../lib/logger';
import { Plus, Edit, Trash2, Layers, Search, Loader2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import type { JobPreset, PresetJob } from '../lib/types';

interface JobPresetsProps {
  onNavigate: (page: string, id?: string) => void;
  presetIdToEdit?: string;
}

export function JobPresets({ onNavigate, presetIdToEdit }: JobPresetsProps) {
  const { t } = useTranslation();
  const { formatDate } = useFormatting();
  const { jobPresets, jobTemplates, addJobPreset, updateJobPreset, deleteJobPreset } = useApp();
  const [editingPreset, setEditingPreset] = useState<JobPreset | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<JobPreset>>({
    name: '',
    description: '',
    category: '',
    jobs: [],
  });
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<JobPreset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
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
    setShowJobPicker(false);
    setJobSearchQuery('');
    setIsSaving(false);
  };
  
  // Filter jobs based on search query
  const filteredJobs = useMemo(() => {
    if (!jobSearchQuery.trim()) return [];
    const query = jobSearchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return jobTemplates
      .filter(job => {
        // Exclude jobs that are already in the preset
        const isAlreadyAdded = formData.jobs?.some(pj => pj.jobId === job.id);
        if (isAlreadyAdded) return false;
        
        const searchableText = `${job.name} ${job.description} ${job.category}`.toLowerCase();
        // Check if all query words appear in the searchable text
        return queryWords.every(word => searchableText.includes(word));
      })
      .slice(0, 10);
  }, [jobTemplates, jobSearchQuery, formData.jobs]);
  
  const handleAddJob = (jobId: string) => {
    const job = jobTemplates.find(j => j.id === jobId);
    if (!job) return;
    
    // Check if job is already in the preset
    if (formData.jobs?.some(pj => pj.jobId === jobId)) {
      toast.error(t('jobPresets.jobAlreadyInPreset') || 'This job is already in the preset');
      return;
    }
    
    const newPresetJob: PresetJob = {
      jobId: jobId,
      defaultQty: 1,
      position: (formData.jobs?.length || 0) + 1,
    };
    
    setFormData({
      ...formData,
      jobs: [...(formData.jobs || []), newPresetJob],
    });
    
    setJobSearchQuery('');
    setShowJobPicker(false);
    toast.success(t('orderDetail.jobAdded', { jobName: job.name }) || `Added ${job.name}`);
  };
  
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
      toast.error(t('jobPresets.fillRequiredFields'));
      return;
    }
    
    if (isSaving) return; // Prevent double-clicking
    
    setIsSaving(true);
    
    try {
      // Recalculate positions to ensure they're sequential (1, 2, 3, ...)
      const jobsWithPositions = (formData.jobs || []).map((job, index) => ({
        ...job,
        position: index + 1,
      }));
      
      if (editingPreset) {
        await updateJobPreset(editingPreset.id, { ...formData, jobs: jobsWithPositions });
        toast.success(t('jobPresets.savedSuccessfully'));
      } else {
        const newPreset: JobPreset = {
          id: generateId('preset'),
          name: formData.name,
          description: formData.description || '',
          category: formData.category,
          jobs: jobsWithPositions,
          lastUpdated: new Date(),
        };
        await addJobPreset(newPreset);
        toast.success(t('jobPresets.savedSuccessfully'));
      }
      
      handleClose();
    } catch (error: any) {
      logger.error('Error saving preset', error);
      toast.error(error?.message || t('jobPresets.saveFailed') || 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = (preset: JobPreset) => {
    setPresetToDelete(preset);
    setShowDeleteDialog(true);
  };
  
  const handleConfirmDelete = () => {
    if (presetToDelete) {
      deleteJobPreset(presetToDelete.id);
      toast.success(t('jobPresets.deletedSuccessfully'));
      setPresetToDelete(null);
    }
    setShowDeleteDialog(false);
  };
  
  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setPresetToDelete(null);
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">{t('jobPresets.title')}</h1>
          <p className="text-[#555A60]">{t('jobPresets.subtitle')}</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
        >
          <Plus size={20} aria-hidden="true" />
          {t('jobPresets.newPreset')}
        </button>
      </div>
      
      {/* Presets Grid */}
      {jobPresets.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4E7E7] px-6 py-12 text-center">
          <Layers size={48} className="mx-auto text-[#B5BDB9] mb-4" aria-hidden="true" />
          <p className="text-[#7C8085] mb-4">{t('jobPresets.noPresets')}</p>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors cursor-pointer"
            >
            {t('jobPresets.createFirstPreset')}
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
                          className="p-2 text-[#555A60] hover:bg-[#F7F8F8] rounded-lg transition-colors cursor-pointer"
                          aria-label={t('jobPresets.editPresetAriaLabel', { presetName: preset.name })}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(preset);
                          }}
                          className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors cursor-pointer"
                          aria-label={t('jobPresets.deletePresetAriaLabel', { presetName: preset.name })}
                        >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <p className="text-[#555A60] mb-4 line-clamp-2">{preset.description}</p>
              
              <div className="pt-4 border-t border-[#E4E7E7]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#7C8085]">{t('jobPresets.totalJobs')}</p>
                    <p className="text-[#1E2025]">{preset.jobs.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#7C8085]">{t('jobPresets.updated')}</p>
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
              {editingPreset ? t('jobPresets.editPreset') : t('jobPresets.createPreset')}
            </DialogTitle>
            <DialogDescription>
              {editingPreset 
                ? t('jobPresets.editPresetDescription') || 'Edit the preset details and manage jobs.'
                : t('jobPresets.createPresetDescription') || 'Create a new preset bundle of jobs for faster order assembly.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="presetName">{t('jobPresets.presetName')} *</Label>
                <Input
                  id="presetName"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('jobPresets.presetNamePlaceholder')}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="presetCategory">{t('jobPresets.category')} *</Label>
                <Input
                  id="presetCategory"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder={t('jobPresets.presetCategoryPlaceholder')}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="presetDescription">{t('jobPresets.description')}</Label>
              <Textarea
                id="presetDescription"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('jobPresets.presetDescriptionPlaceholder')}
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('jobPresets.jobsInPreset')}</Label>
                <button
                  type="button"
                  onClick={() => {
                    setShowJobPicker(!showJobPicker);
                    if (!showJobPicker) {
                      setJobSearchQuery('');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors text-sm cursor-pointer"
                >
                  <Plus size={16} aria-hidden="true" />
                  {t('orderDetail.addJob') || 'Add Job'}
                </button>
              </div>
              
              {/* Job Picker */}
              {showJobPicker && (
                <div className="p-4 border border-[#E4E7E7] rounded-lg bg-[#F7F8F8] mb-3">
                  <h3 className="text-[#555A60] mb-3 text-sm font-medium">{t('orderDetail.selectJobToAdd')}</h3>
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
                      <div className="col-span-2 text-center py-4 text-[#7C8085] text-sm">
                        {jobSearchQuery.trim() ? (t('orderDetail.noJobsFound') || 'No jobs found') : (t('orderDetail.startTypingToSearch') || 'Start typing to search for jobs')}
                      </div>
                    ) : (
                      filteredJobs.map(job => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => handleAddJob(job.id)}
                          className="p-3 bg-white rounded-lg border border-[#E4E7E7] hover:border-[#1F744F] transition-colors text-left cursor-pointer"
                        >
                          <p className="text-[#1E2025] mb-1 text-sm font-medium">{job.name}</p>
                          {job.description && (
                            <p className="text-[#7C8085] text-xs line-clamp-2">{job.description}</p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              {!formData.jobs || formData.jobs.length === 0 ? (
                <p className="text-[#7C8085] text-center py-6 border border-dashed border-[#E4E7E7] rounded-lg">
                  {t('jobPresets.noJobsAdded')}
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
                            {t('jobPresets.qty')}:
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
                            type="button"
                            onClick={() => handleRemoveJob(presetJob.jobId)}
                            className="p-2 text-[#E5484D] hover:bg-[#FEE] rounded-lg transition-colors cursor-pointer"
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
                className="px-4 py-2 bg-[#E4E7E7] text-[#1E2025] rounded-lg hover:bg-[#D2D6D6] transition-colors cursor-pointer"
              >
                {t('jobPresets.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    {t('common.saving') || 'Saving...'}
                  </>
                ) : (
                  editingPreset ? t('common.saveChanges') : t('jobPresets.createPreset')
                )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white border border-[#E4E7E7]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E2025]">
              {t('jobPresets.deleteConfirmTitle') || t('jobPresets.deleteConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#555A60]">
              {presetToDelete 
                ? (t('jobPresets.deleteConfirmDescription', { presetName: presetToDelete.name }) || t('jobPresets.deleteConfirm'))
                : t('jobPresets.deleteConfirm')
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={handleCancelDelete}
              className="bg-[#E4E7E7] text-[#1E2025] hover:bg-[#D2D6D6] m-0"
            >
              {t('common.cancel') || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-[#1F744F] text-white hover:bg-[#165B3C] m-0"
            >
              {t('jobPresets.delete') || 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
