// Legal entities used when generating order documents.
// Each entity can later get its own layout/template; for now they share the same DOCX builder.
import type { CompanySettings } from './types';
import { extractIdNumbers } from './utils';
import { supabase } from './supabase';
import { logger } from './logger';

export type LegalEntityId = 'mk' | 'metservice';

export interface LegalEntityDefinition {
  id: LegalEntityId;
  /** i18n key under orderDetail.* */
  labelKey: string;
  /** Short name shown in the generate-documents menu */
  shortName: string;
  /** Two-letter mark shown in the collapsed sidebar */
  initials: string;
  resolveSettings: (defaultSettings: CompanySettings) => CompanySettings;
}

/** ООО «МЕТСЕРВИС» — details from issued КП/смета/спецификация samples */
export const METSERVICE_COMPANY: CompanySettings = {
  name: 'МЕТСЕРВИС',
  legalName: 'ООО МЕТСЕРВИС',
  legalForm: 'ООО',
  address:
    '119017, Россия, г. Москва, муниципальный округ Замоскворечье, ул. Новокузнецкая, д. 4/12, стр. 1, пом. 3/П',
  phone: '79686208484',
  email: '',
  taxId: '9705259288',
  inn: '9705259288',
  kpp: '770501001',
  bankName: 'ПАО СБЕРБАНК г. Москва',
  bankAccount: '40702810738720054223',
  correspondentAccount: '30101810400000000225',
  bankBik: '044525225',
  currency: 'RUB',
  locale: 'ru-RU',
  defaultTaxRate: 0,
  defaultMarkup: 0,
  invoicePrefix: 'smeta',
  poPrefix: 'kp',
  specPrefix: 'spec',
  directorName: '',
};

export const LEGAL_ENTITIES: LegalEntityDefinition[] = [
  {
    id: 'mk',
    labelKey: 'orderDetail.legalEntityMk',
    shortName: 'МК СЕРВИС',
    initials: 'МК',
    resolveSettings: (defaults) => defaults,
  },
  {
    id: 'metservice',
    labelKey: 'orderDetail.legalEntityMetservice',
    shortName: 'МЕТСЕРВИС',
    initials: 'МС',
    resolveSettings: (defaults) => {
      // Prefer cached settings from last load/save; fall back to built-in defaults.
      // Keep Metservice tax/markup independent from MK (МЕТСЕРВИС is typically without VAT).
      const stored = getMetserviceSettingsSync();
      return {
        ...stored,
        currency: defaults.currency || stored.currency,
        locale: defaults.locale || stored.locale,
      };
    },
  },
];

const METSERVICE_SETTINGS_KEY = 'metservice-company-settings-v2';

/** In-memory cache so document generation can resolve sync after settings load/save */
let metserviceSettingsCache: CompanySettings | null = null;

function readMetserviceFromLocalStorage(): CompanySettings | null {
  try {
    const raw = localStorage.getItem(METSERVICE_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanySettings;
    if (parsed && typeof parsed.name === 'string') return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function getMetserviceSettingsSync(): CompanySettings {
  if (metserviceSettingsCache) return metserviceSettingsCache;
  const fromLs = typeof window !== 'undefined' ? readMetserviceFromLocalStorage() : null;
  metserviceSettingsCache = fromLs ? { ...METSERVICE_COMPANY, ...fromLs } : { ...METSERVICE_COMPANY };
  return metserviceSettingsCache;
}

/** Load Metservice profile: DB row id=metservice → localStorage → built-in defaults */
export async function loadMetserviceSettings(): Promise<CompanySettings> {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 'metservice')
      .maybeSingle();

    if (!error && data) {
      const mapped: CompanySettings = {
        name: data.name ?? METSERVICE_COMPANY.name,
        legalName: data.legalName ?? METSERVICE_COMPANY.legalName,
        logo: data.logo,
        address: data.address ?? METSERVICE_COMPANY.address,
        phone: data.phone ?? METSERVICE_COMPANY.phone,
        email: data.email ?? METSERVICE_COMPANY.email,
        taxId: data.taxId ?? data.inn ?? METSERVICE_COMPANY.taxId,
        currency: data.currency ?? METSERVICE_COMPANY.currency,
        locale: data.locale ?? METSERVICE_COMPANY.locale,
        defaultTaxRate: (() => {
          const n = parseFloat(data.defaultTaxRate);
          return Number.isFinite(n) ? n : METSERVICE_COMPANY.defaultTaxRate;
        })(),
        defaultMarkup: (() => {
          const n = parseFloat(data.defaultMarkup);
          return Number.isFinite(n) ? n : METSERVICE_COMPANY.defaultMarkup;
        })(),
        invoicePrefix: data.invoicePrefix || METSERVICE_COMPANY.invoicePrefix,
        poPrefix: data.poPrefix || METSERVICE_COMPANY.poPrefix,
        specPrefix: data.specPrefix || METSERVICE_COMPANY.specPrefix,
        legalForm: data.legal_form ?? METSERVICE_COMPANY.legalForm,
        inn: data.inn ?? METSERVICE_COMPANY.inn,
        kpp: data.kpp ?? METSERVICE_COMPANY.kpp,
        bankAccount: data.bank_account ?? METSERVICE_COMPANY.bankAccount,
        bankName: data.bank_name ?? METSERVICE_COMPANY.bankName,
        correspondentAccount: data.correspondent_account ?? METSERVICE_COMPANY.correspondentAccount,
        bankBik: data.bank_bik ?? METSERVICE_COMPANY.bankBik,
        directorName: data.director_name ?? METSERVICE_COMPANY.directorName,
      };
      metserviceSettingsCache = mapped;
      try {
        localStorage.setItem(METSERVICE_SETTINGS_KEY, JSON.stringify(mapped));
      } catch {
        // ignore
      }
      return mapped;
    }
  } catch (error) {
    logger.debug('Metservice settings DB load failed, using local/defaults', error);
  }

  return getMetserviceSettingsSync();
}

/** Persist Metservice profile (DB when possible + localStorage) */
export async function saveMetserviceSettings(settings: CompanySettings): Promise<void> {
  metserviceSettingsCache = { ...settings };
  try {
    localStorage.setItem(METSERVICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }

  try {
    const dbUpdates = {
      id: 'metservice',
      name: settings.name,
      legalName: settings.legalName,
      logo: settings.logo,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      taxId: settings.taxId || settings.inn,
      currency: settings.currency,
      locale: settings.locale,
      defaultTaxRate: settings.defaultTaxRate,
      defaultMarkup: settings.defaultMarkup,
      invoicePrefix: settings.invoicePrefix,
      poPrefix: settings.poPrefix,
      specPrefix: settings.specPrefix,
      legal_form: settings.legalForm,
      inn: settings.inn,
      kpp: settings.kpp,
      bank_account: settings.bankAccount,
      bank_name: settings.bankName,
      correspondent_account: settings.correspondentAccount,
      bank_bik: settings.bankBik,
      director_name: settings.directorName,
    };
    const { error } = await supabase.from('company_settings').upsert(dbUpdates);
    if (error) {
      logger.debug('Metservice settings DB save failed; kept in localStorage', error);
    }
  } catch (error) {
    logger.debug('Metservice settings DB save failed; kept in localStorage', error);
  }
}

/**
 * Document number = the order number. Each workspace has its own order counter
 * (MK: order-N, Metservice: ms-order-N starting at 13001), so no extra journal suffix is needed.
 */
export async function getEntityDocumentNumber(
  _entityId: LegalEntityId,
  orderId: string
): Promise<string> {
  return extractIdNumbers(orderId) || '0';
}

/**
 * Workspaces: each legal entity is its own workspace with separate clients and orders
 * (`workspaceId` column). Job catalog, presets and settings are shared.
 */
export type WorkspaceId = LegalEntityId;

const WORKSPACE_STORAGE_KEY = 'active-workspace';

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return LEGAL_ENTITIES.some((e) => e.id === value);
}

export function readStoredWorkspace(): WorkspaceId {
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (isWorkspaceId(stored)) return stored;
  } catch {
    // ignore
  }
  return 'mk';
}

export function storeWorkspace(id: WorkspaceId): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function getLegalEntity(id: LegalEntityId): LegalEntityDefinition {
  const entity = LEGAL_ENTITIES.find((e) => e.id === id);
  if (!entity) {
    throw new Error(`Unknown legal entity: ${id}`);
  }
  return entity;
}
