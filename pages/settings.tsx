// Settings page - manage company settings and preferences
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../lib/app-context';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PhoneInput } from '../components/ui/phone-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { localeToLanguage } from '../lib/i18n';
import i18n from '../lib/i18n';
import type { CompanySettings } from '../lib/types';

interface SettingsProps {
  onNavigate: (page: string, id?: string) => void;
}

export function Settings({ onNavigate }: SettingsProps) {
  const { t } = useTranslation();
  const { companySettings, updateCompanySettings } = useApp();
  const [formData, setFormData] = useState<CompanySettings>(companySettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  
  // Update form data when company settings change
  useEffect(() => {
    setFormData(companySettings);
  }, [companySettings]);
  
  const handleChange = (field: keyof CompanySettings, value: string | number) => {
    const newFormData = {
      ...formData,
      [field]: value,
    };
    setFormData(newFormData);
    setHasChanges(true);
    
    // If locale changed, update i18n language immediately
    if (field === 'locale' && typeof value === 'string') {
      i18n.changeLanguage(localeToLanguage(value));
    }
  };
  
  const handleSave = async () => {
    await updateCompanySettings(formData);
    setHasChanges(false);
    toast.success(t('settings.savedSuccessfully'));
    
    // Update i18n language if locale changed
    i18n.changeLanguage(localeToLanguage(formData.locale));
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1E2025] mb-2">{t('settings.title')}</h1>
          <p className="text-[#555A60]">{t('settings.subtitle')}</p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors whitespace-nowrap"
          >
            <Save size={20} aria-hidden="true" />
            {t('common.saveChanges')}
          </button>
        )}
      </div>
      
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">{t('settings.company')}</TabsTrigger>
          <TabsTrigger value="financial">{t('settings.financial')}</TabsTrigger>
          <TabsTrigger value="locale">{t('settings.locale')}</TabsTrigger>
          <TabsTrigger value="documents">{t('settings.documents')}</TabsTrigger>
        </TabsList>
        
        {/* Company Tab */}
        <TabsContent value="company">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.companyInformation')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="companyName">{t('settings.companyName')}</Label>
                <Input
                  id="companyName"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="legalName">{t('settings.legalName')}</Label>
                <Input
                  id="legalName"
                  value={formData.legalName}
                  onChange={(e) => handleChange('legalName', e.target.value)}
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">{t('settings.address')}</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">{t('settings.phone')}</Label>
                <PhoneInput
                  id="phone"
                  value={formData.phone}
                  onChange={(value) => handleChange('phone', value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">{t('settings.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="inn">{t('settings.inn')}</Label>
                <Input
                  id="inn"
                  value={formData.inn || ''}
                  onChange={(e) => handleChange('inn', e.target.value)}
                  placeholder={t('settings.innPlaceholder')}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="kpp">{t('settings.kpp')}</Label>
                <Input
                  id="kpp"
                  value={formData.kpp || ''}
                  onChange={(e) => handleChange('kpp', e.target.value)}
                  placeholder={t('settings.kppPlaceholder')}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="directorName">{t('settings.directorName')}</Label>
                <Input
                  id="directorName"
                  value={formData.directorName || ''}
                  onChange={(e) => handleChange('directorName', e.target.value)}
                  placeholder={t('settings.directorNamePlaceholder')}
                />
              </div>
            </div>
          </div>
          
          {/* Banking Information Section */}
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6 mt-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.bankingInformation')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: Bank Name and БИК */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="bankName">{t('settings.bankName')}</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName || ''}
                    onChange={(e) => handleChange('bankName', e.target.value)}
                    placeholder={t('settings.bankNamePlaceholder')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bankBik">{t('settings.bankBik')}</Label>
                  <Input
                    id="bankBik"
                    value={formData.bankBik || ''}
                    onChange={(e) => handleChange('bankBik', e.target.value)}
                    placeholder={t('settings.bankBikPlaceholder')}
                  />
                </div>
              </div>
              
              {/* Right column: Account numbers */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="bankAccount">{t('settings.bankAccount')}</Label>
                  <Input
                    id="bankAccount"
                    value={formData.bankAccount || ''}
                    onChange={(e) => handleChange('bankAccount', e.target.value)}
                    placeholder={t('settings.bankAccountPlaceholder')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="correspondentAccount">{t('settings.correspondentAccount')}</Label>
                  <Input
                    id="correspondentAccount"
                    value={formData.correspondentAccount || ''}
                    onChange={(e) => handleChange('correspondentAccount', e.target.value)}
                    placeholder={t('settings.correspondentAccountPlaceholder')}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        {/* Financial Tab */}
        <TabsContent value="financial">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.financialSettings')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="defaultTaxRate">{t('settings.defaultTaxRate')}</Label>
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
                <Label htmlFor="defaultMarkup">{t('settings.defaultMarkup')}</Label>
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
                {t('settings.financialSettingsDescription')}
              </p>
            </div>
          </div>
        </TabsContent>
        
        {/* Locale Tab */}
        <TabsContent value="locale">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.localeSettings')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="currency">{t('settings.currency')}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => {
                    handleChange('currency', value);
                    // Close dropdown after state update
                    setTimeout(() => setCurrencyOpen(false), 0);
                  }}
                  open={currencyOpen}
                  onOpenChange={setCurrencyOpen}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="RUB">RUB - Russian Ruble</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="locale">{t('settings.locale')}</Label>
                <Select
                  value={formData.locale}
                  onValueChange={(value) => {
                    // Close dropdown first to avoid re-render interference
                    setLocaleOpen(false);
                    // Then update the locale (this triggers i18n change and re-render)
                    handleChange('locale', value);
                  }}
                  open={localeOpen}
                  onOpenChange={setLocaleOpen}
                >
                  <SelectTrigger id="locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (en-US)</SelectItem>
                    <SelectItem value="ru-RU">Русский (ru-RU)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
              <p className="text-[#555A60] mb-4">
                {t('settings.localeSettingsDescription')}
              </p>
            </div>
          </div>
        </TabsContent>
        
        {/* Documents Tab */}
        <TabsContent value="documents">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
              <h2 className="text-[#1E2025] mb-6">{t('settings.documentSettings')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">{t('settings.invoicePrefix')}</Label>
                  <Input
                    id="invoicePrefix"
                    value={formData.invoicePrefix}
                    onChange={(e) => handleChange('invoicePrefix', e.target.value)}
                    placeholder="e.g., INV"
                  />
                  <p className="text-[#7C8085]">
                    {t('settings.invoicePrefixExample', { prefix: formData.invoicePrefix })}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="poPrefix">{t('settings.poPrefix')}</Label>
                  <Input
                    id="poPrefix"
                    value={formData.poPrefix}
                    onChange={(e) => handleChange('poPrefix', e.target.value)}
                    placeholder="e.g., PO"
                  />
                  <p className="text-[#7C8085]">
                    {t('settings.poPrefixExample', { prefix: formData.poPrefix })}
                  </p>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
                <p className="text-[#555A60] mb-4">
                  {t('settings.documentPrefixDescription')}
                </p>
              </div>
            </div>
            
            {/* Variable Reference */}
            <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
              <h2 className="text-[#1E2025] mb-6">{t('settings.availableTemplateVariables')}</h2>
              <p className="text-[#555A60] mb-6">
                {t('settings.templateVariablesDescription')}
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="company">
                  <AccordionTrigger className="text-[#1E2025]">{t('settings.companyVariables')}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{company.name}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{company.address}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{company.phone}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{company.email}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{company.taxId}}'}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="client">
                  <AccordionTrigger className="text-[#1E2025]">{t('settings.clientVariables')}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{client.name}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{client.company}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{client.address}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{client.phone}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{client.email}}'}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="order">
                  <AccordionTrigger className="text-[#1E2025]">{t('settings.orderVariables')}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.id}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.date}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.invoiceNumber}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.poNumber}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.subtotal}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.tax}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{order.total}}'}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="jobs">
                  <AccordionTrigger className="text-[#1E2025]">{t('settings.jobLineItemVariables')}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <p className="text-[#555A60] mb-3">{t('settings.forEachJob')}</p>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{jobs[].code}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{jobs[].name}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{jobs[].qty}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{jobs[].unit}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{jobs[].unitPrice}}'}</div>
                      <div className="font-mono bg-[#F2F4F4] px-3 py-2 rounded text-[#1E2025]">{'{{jobs[].lineTotal}}'}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
