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
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { localeToLanguage } from '../lib/i18n';
import i18n from '../lib/i18n';
import { logger } from '../lib/logger';
import {
  loadMetserviceSettings,
  saveMetserviceSettings,
  type LegalEntityId,
} from '../lib/legal-entities';
import type { CompanySettings } from '../lib/types';

interface SettingsProps {
  onNavigate: (page: string, id?: string) => void;
}

export function Settings({ onNavigate }: SettingsProps) {
  const { t } = useTranslation();
  const { companySettings, workspaceId, updateCompanySettings, refreshCompanySettings } = useApp();

  // Per-entity company profiles: the active one follows the sidebar workspace switcher
  const activeEntityId: LegalEntityId = workspaceId;
  const [mkForm, setMkForm] = useState<CompanySettings>(companySettings);
  const [msForm, setMsForm] = useState<CompanySettings | null>(null);
  const [mkDirty, setMkDirty] = useState(false);
  const [msDirty, setMsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const companyForm = activeEntityId === 'mk' ? mkForm : (msForm ?? mkForm);
  const hasChanges = mkDirty || msDirty;

  useEffect(() => {
    if (!mkDirty) setMkForm(companySettings);
  }, [companySettings, mkDirty]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadMetserviceSettings();
        if (!cancelled && !msDirty) setMsForm(settings);
      } catch (error) {
        logger.error('Failed to load Metservice settings', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [msDirty]);

  const patchCompanyForm = (field: keyof CompanySettings, value: string | number) => {
    if (activeEntityId === 'mk') {
      setMkForm((prev) => ({ ...prev, [field]: value }));
      setMkDirty(true);
      if (field === 'locale' && typeof value === 'string') {
        i18n.changeLanguage(localeToLanguage(value));
      }
    } else {
      setMsForm((prev) => ({ ...(prev as CompanySettings), [field]: value }));
      setMsDirty(true);
    }
  };

  /** CRM-wide fields always edit MK profile */
  const patchMkForm = (field: keyof CompanySettings, value: string | number) => {
    setMkForm((prev) => ({ ...prev, [field]: value }));
    setMkDirty(true);
    if (field === 'locale' && typeof value === 'string') {
      i18n.changeLanguage(localeToLanguage(value));
    }
  };

  const handleSave = async () => {
    if (isSaving || !hasChanges) return;
    setIsSaving(true);
    try {
      if (mkDirty) {
        await updateCompanySettings(mkForm);
        i18n.changeLanguage(localeToLanguage(mkForm.locale));
        setMkDirty(false);
      }
      if (msDirty && msForm) {
        await saveMetserviceSettings(msForm);
        setMsDirty(false);
        await refreshCompanySettings(); // Refresh workspace defaults used by new orders
      }
      toast.success(t('settings.savedSuccessfully'));
    } catch (error) {
      logger.error('Error saving settings', error);
      toast.error(t('settings.saveFailed') || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[#1E2025] mb-2">{t('settings.title')}</h1>
          <p className="text-[#555A60]">{t('settings.subtitle')}</p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save size={20} aria-hidden="true" />
                {t('common.saveChanges')}
              </>
            )}
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

        <TabsContent value="company" className="space-y-6">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.companyInformation')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="companyName">{t('settings.companyName')}</Label>
                <Input
                  id="companyName"
                  value={companyForm.name}
                  onChange={(e) => patchCompanyForm('name', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="legalName">{t('settings.legalName')}</Label>
                <Input
                  id="legalName"
                  value={companyForm.legalName}
                  onChange={(e) => patchCompanyForm('legalName', e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">{t('settings.address')}</Label>
                <Input
                  id="address"
                  value={companyForm.address}
                  onChange={(e) => patchCompanyForm('address', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('settings.phone')}</Label>
                <PhoneInput
                  id="phone"
                  value={companyForm.phone}
                  onChange={(value) => patchCompanyForm('phone', value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('settings.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => patchCompanyForm('email', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inn">{t('settings.inn')}</Label>
                <Input
                  id="inn"
                  value={companyForm.inn || ''}
                  onChange={(e) => patchCompanyForm('inn', e.target.value)}
                  placeholder={t('settings.innPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="kpp">{t('settings.kpp')}</Label>
                <Input
                  id="kpp"
                  value={companyForm.kpp || ''}
                  onChange={(e) => patchCompanyForm('kpp', e.target.value)}
                  placeholder={t('settings.kppPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="directorName">{t('settings.directorName')}</Label>
                <Input
                  id="directorName"
                  value={companyForm.directorName || ''}
                  onChange={(e) => patchCompanyForm('directorName', e.target.value)}
                  placeholder={t('settings.directorNamePlaceholder')}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.financialSettings')}</h2>
            <p className="text-[#555A60] mb-6">{t('settings.financialPerEntityHint')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="defaultTaxRate">{t('settings.defaultTaxRate')}</Label>
                <Input
                  id="defaultTaxRate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={companyForm.defaultTaxRate}
                  onChange={(e) =>
                    patchCompanyForm('defaultTaxRate', parseFloat(e.target.value) || 0)
                  }
                />
                <p className="text-sm text-[#555A60]">
                  {t('settings.entityTaxRateHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultMarkup">{t('settings.defaultMarkup')}</Label>
                <Input
                  id="defaultMarkup"
                  type="number"
                  min="0"
                  step="1"
                  value={activeEntityId === 'mk' ? mkForm.defaultMarkup : (msForm?.defaultMarkup ?? 0)}
                  onChange={(e) =>
                    patchCompanyForm('defaultMarkup', parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
              <p className="text-[#555A60] mb-4">{t('settings.financialSettingsDescription')}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.bankingInformation')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="bankName">{t('settings.bankName')}</Label>
                  <Input
                    id="bankName"
                    value={companyForm.bankName || ''}
                    onChange={(e) => patchCompanyForm('bankName', e.target.value)}
                    placeholder={t('settings.bankNamePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankBik">{t('settings.bankBik')}</Label>
                  <Input
                    id="bankBik"
                    value={companyForm.bankBik || ''}
                    onChange={(e) => patchCompanyForm('bankBik', e.target.value)}
                    placeholder={t('settings.bankBikPlaceholder')}
                  />
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="bankAccount">{t('settings.bankAccount')}</Label>
                  <Input
                    id="bankAccount"
                    value={companyForm.bankAccount || ''}
                    onChange={(e) => patchCompanyForm('bankAccount', e.target.value)}
                    placeholder={t('settings.bankAccountPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="correspondentAccount">{t('settings.correspondentAccount')}</Label>
                  <Input
                    id="correspondentAccount"
                    value={companyForm.correspondentAccount || ''}
                    onChange={(e) => patchCompanyForm('correspondentAccount', e.target.value)}
                    placeholder={t('settings.correspondentAccountPlaceholder')}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="locale">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.localeSettings')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="currency">{t('settings.currency')}</Label>
                <Select
                  value={mkForm.currency}
                  onValueChange={(value) => {
                    patchMkForm('currency', value);
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
                  value={mkForm.locale}
                  onValueChange={(value) => {
                    setLocaleOpen(false);
                    patchMkForm('locale', value);
                  }}
                  open={localeOpen}
                  onOpenChange={setLocaleOpen}
                >
                  <SelectTrigger id="locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="ru-RU">Русский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
              <p className="text-[#555A60] mb-4">{t('settings.localeSettingsDescription')}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
            <h2 className="text-[#1E2025] mb-6">{t('settings.documentSettings')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="invoicePrefix">{t('settings.invoicePrefix')}</Label>
                <Input
                  id="invoicePrefix"
                  value={mkForm.invoicePrefix}
                  onChange={(e) => patchMkForm('invoicePrefix', e.target.value)}
                />
                <p className="text-[#7C8085]">
                  {t('settings.invoicePrefixExample', { prefix: mkForm.invoicePrefix })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="poPrefix">{t('settings.poPrefix')}</Label>
                <Input
                  id="poPrefix"
                  value={mkForm.poPrefix}
                  onChange={(e) => patchMkForm('poPrefix', e.target.value)}
                />
                <p className="text-[#7C8085]">
                  {t('settings.poPrefixExample', { prefix: mkForm.poPrefix })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specPrefix">{t('settings.specPrefix')}</Label>
                <Input
                  id="specPrefix"
                  value={mkForm.specPrefix}
                  onChange={(e) => patchMkForm('specPrefix', e.target.value)}
                />
                <p className="text-[#7C8085]">
                  {t('settings.specPrefixExample', { prefix: mkForm.specPrefix })}
                </p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-[#E4E7E7]">
              <p className="text-[#555A60] mb-4">{t('settings.documentPrefixDescription')}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E4E7E7] p-6 mt-6">
            <h2 className="text-[#1E2025] mb-4">{t('settings.availableTemplateVariables')}</h2>
            <p className="text-[#555A60] mb-6">{t('settings.templateVariablesDescription')}</p>
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="company">
                <AccordionTrigger>{t('settings.companyVariables')}</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 font-mono text-sm text-[#555A60]">
                    <p>{'{{company.name}}'}</p>
                    <p>{'{{company.legalName}}'}</p>
                    <p>{'{{company.address}}'}</p>
                    <p>{'{{company.phone}}'}</p>
                    <p>{'{{company.email}}'}</p>
                    <p>{'{{company.taxId}}'}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="client">
                <AccordionTrigger>{t('settings.clientVariables')}</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 font-mono text-sm text-[#555A60]">
                    <p>{'{{client.name}}'}</p>
                    <p>{'{{client.company}}'}</p>
                    <p>{'{{client.address}}'}</p>
                    <p>{'{{client.phone}}'}</p>
                    <p>{'{{client.email}}'}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="order">
                <AccordionTrigger>{t('settings.orderVariables')}</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 font-mono text-sm text-[#555A60]">
                    <p>{'{{order.id}}'}</p>
                    <p>{'{{order.date}}'}</p>
                    <p>{'{{order.invoiceNumber}}'}</p>
                    <p>{'{{order.poNumber}}'}</p>
                    <p>{'{{order.subtotal}}'}</p>
                    <p>{'{{order.tax}}'}</p>
                    <p>{'{{order.total}}'}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="jobs">
                <AccordionTrigger>{t('settings.jobLineItemVariables')}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-[#555A60] mb-2">{t('settings.forEachJob')}</p>
                  <div className="space-y-2 font-mono text-sm text-[#555A60]">
                    <p>{'{{job.code}}'}</p>
                    <p>{'{{job.name}}'}</p>
                    <p>{'{{job.qty}}'}</p>
                    <p>{'{{job.unit}}'}</p>
                    <p>{'{{job.unitPrice}}'}</p>
                    <p>{'{{job.lineTotal}}'}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
