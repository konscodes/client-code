// Settings page - manage company settings and preferences
import { useState } from 'react';
import { useApp } from '../lib/app-context';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import type { CompanySettings } from '../lib/types';

interface SettingsProps {
  onNavigate: (page: string, id?: string) => void;
}

export function Settings({ onNavigate }: SettingsProps) {
  const { companySettings, updateCompanySettings } = useApp();
  const [formData, setFormData] = useState<CompanySettings>(companySettings);
  const [hasChanges, setHasChanges] = useState(false);
  
  const handleChange = (field: keyof CompanySettings, value: string | number) => {
    setFormData({
      ...formData,
      [field]: value,
    });
    setHasChanges(true);
  };
  
  const handleSave = () => {
    updateCompanySettings(formData);
    setHasChanges(false);
    toast.success('Settings saved successfully');
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">Settings</h1>
          <p className="text-[#555A60]">Manage your company information and application preferences.</p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
          >
            <Save size={20} aria-hidden="true" />
            Save Changes
          </button>
        )}
      </div>
      
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        
        {/* Company Tab */}
        <TabsContent value="company">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">Company Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="legalName">Legal Name</Label>
                <Input
                  id="legalName"
                  value={formData.legalName}
                  onChange={(e) => handleChange('legalName', e.target.value)}
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="taxId">Tax ID</Label>
                <Input
                  id="taxId"
                  value={formData.taxId}
                  onChange={(e) => handleChange('taxId', e.target.value)}
                />
              </div>
            </div>
          </div>
        </TabsContent>
        
        {/* Financial Tab */}
        <TabsContent value="financial">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">Financial Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="locale">Locale</Label>
                <Input
                  id="locale"
                  value={formData.locale}
                  onChange={(e) => handleChange('locale', e.target.value)}
                  placeholder="e.g., en-US"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="defaultTaxRate">Default Tax Rate (%)</Label>
                <Input
                  id="defaultTaxRate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.defaultTaxRate}
                  onChange={(e) => handleChange('defaultTaxRate', parseFloat(e.target.value) || 0)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="defaultMarkup">Default Markup (%)</Label>
                <Input
                  id="defaultMarkup"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.defaultMarkup}
                  onChange={(e) => handleChange('defaultMarkup', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
              <p className="text-[#555A60] mb-4">
                These settings will be used as defaults when creating new orders and invoices.
              </p>
            </div>
          </div>
        </TabsContent>
        
        {/* Documents Tab */}
        <TabsContent value="documents">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">Document Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                <Input
                  id="invoicePrefix"
                  value={formData.invoicePrefix}
                  onChange={(e) => handleChange('invoicePrefix', e.target.value)}
                  placeholder="e.g., INV"
                />
                <p className="text-[#7C8085]">
                  Example: {formData.invoicePrefix}-2025-001
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="poPrefix">Purchase Order Prefix</Label>
                <Input
                  id="poPrefix"
                  value={formData.poPrefix}
                  onChange={(e) => handleChange('poPrefix', e.target.value)}
                  placeholder="e.g., PO"
                />
                <p className="text-[#7C8085]">
                  Example: {formData.poPrefix}-2025-001
                </p>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
              <p className="text-[#555A60] mb-4">
                These prefixes will be used when generating document numbers for invoices and purchase orders.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Save reminder */}
      {hasChanges && (
        <div className="fixed bottom-8 right-8 bg-[#1F744F] text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-4">
          <p>You have unsaved changes</p>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-white text-[#1F744F] rounded-lg hover:bg-[#F7F8F8] transition-colors"
          >
            Save Now
          </button>
        </div>
      )}
    </div>
  );
}
