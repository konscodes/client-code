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
  /**
   * Document number series.
   * - order: bare CRM order number (current MK behavior)
   * - metservice: order number + sequential suffix (e.g. 22817-22)
   */
  numberSeries: 'order' | 'metservice';
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
  defaultTaxRate: 5,
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
    numberSeries: 'order',
    resolveSettings: (defaults) => defaults,
  },
  {
    id: 'metservice',
    labelKey: 'orderDetail.legalEntityMetservice',
    shortName: 'МЕТСЕРВИС',
    numberSeries: 'metservice',
    resolveSettings: (defaults) => {
      // Prefer cached settings from last load/save; fall back to built-in defaults
      const stored = getMetserviceSettingsSync();
      return {
        ...stored,
        defaultTaxRate: defaults.defaultTaxRate ?? stored.defaultTaxRate,
        defaultMarkup: defaults.defaultMarkup ?? stored.defaultMarkup,
        currency: defaults.currency || stored.currency,
        locale: defaults.locale || stored.locale,
      };
    },
  },
];

const METSERVICE_SETTINGS_KEY = 'metservice-company-settings-v1';

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
        defaultTaxRate: parseFloat(data.defaultTaxRate) || METSERVICE_COMPANY.defaultTaxRate,
        defaultMarkup: parseFloat(data.defaultMarkup) || METSERVICE_COMPANY.defaultMarkup,
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

/** First Metservice journal suffix (then 23, 24, …) */
export const METSERVICE_SEQ_START = 22;

const LOCAL_STORAGE_KEY = 'metservice-doc-seq-v1';

interface MetserviceSeqStore {
  next: number;
  byOrderId: Record<string, number>;
}

function readLocalStore(): MetserviceSeqStore {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MetserviceSeqStore;
      if (typeof parsed?.next === 'number' && parsed.byOrderId && typeof parsed.byOrderId === 'object') {
        return parsed;
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return { next: METSERVICE_SEQ_START, byOrderId: {} };
}

function writeLocalStore(store: MetserviceSeqStore): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // private mode / quota — still return in-memory assignment for this session
  }
}

/**
 * Assign (or reuse) a Metservice sequential suffix for an order.
 * Format in docs: `{orderNumber}-{suffix}` e.g. `22817-22`.
 * Same order always reuses the same suffix; new orders get the next number.
 *
 * Prefers Supabase `entity_document_numbers` when the table exists;
 * falls back to localStorage so local testing works without a migration.
 */
export async function allocateMetserviceSuffix(orderId: string): Promise<number> {
  // 1) Try shared DB (production / multi-user)
  try {
    const { data: existing, error: readError } = await supabase
      .from('entity_document_numbers')
      .select('sequence_suffix')
      .eq('entity_id', 'metservice')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!readError && existing?.sequence_suffix != null) {
      return Number(existing.sequence_suffix);
    }

    if (!readError) {
      // Allocate next value via counter row
      const { data: counter } = await supabase
        .from('entity_document_counters')
        .select('next_value')
        .eq('entity_id', 'metservice')
        .maybeSingle();

      let next = counter?.next_value != null ? Number(counter.next_value) : METSERVICE_SEQ_START;

      const { error: insertError } = await supabase.from('entity_document_numbers').insert({
        entity_id: 'metservice',
        order_id: orderId,
        sequence_suffix: next,
      });

      if (!insertError) {
        await supabase.from('entity_document_counters').upsert({
          entity_id: 'metservice',
          next_value: next + 1,
        });
        // Keep local cache in sync when DB works
        const local = readLocalStore();
        local.byOrderId[orderId] = next;
        local.next = Math.max(local.next, next + 1);
        writeLocalStore(local);
        return next;
      }
    }
  } catch (error) {
    logger.debug('Metservice seq DB unavailable, using localStorage', error);
  }

  // 2) localStorage fallback
  const store = readLocalStore();
  if (store.byOrderId[orderId] != null) {
    return store.byOrderId[orderId];
  }
  const assigned = store.next;
  store.byOrderId[orderId] = assigned;
  store.next = assigned + 1;
  writeLocalStore(store);
  return assigned;
}

/**
 * MK: bare order number (links 1:1 to CRM order).
 * Metservice: `{orderNumber}-{seq}` — order link preserved, sequential journal differs from MK.
 */
export async function getEntityDocumentNumber(
  entityId: LegalEntityId,
  orderId: string
): Promise<string> {
  const orderNumeric = extractIdNumbers(orderId) || '0';
  if (entityId === 'metservice') {
    const suffix = await allocateMetserviceSuffix(orderId);
    return `${orderNumeric}-${suffix}`;
  }
  return orderNumeric;
}

export function getLegalEntity(id: LegalEntityId): LegalEntityDefinition {
  const entity = LEGAL_ENTITIES.find((e) => e.id === id);
  if (!entity) {
    throw new Error(`Unknown legal entity: ${id}`);
  }
  return entity;
}
