// Hook to provide formatting functions with current locale and currency from app context
import { useApp } from './app-context';
import { formatCurrency as formatCurrencyUtil, formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from './utils';

// Helper to get locale based on currency
function getLocaleForCurrency(currency: string, fallbackLocale: string): string {
  // Map currency to appropriate locale
  const currencyLocaleMap: Record<string, string> = {
    'USD': 'en-US',
    'RUB': 'ru-RU',
    'EUR': 'en-US', // Default to en-US for EUR, can be customized
  };
  
  return currencyLocaleMap[currency] || fallbackLocale;
}

export function useFormatting() {
  const { companySettings } = useApp();
  
  const formatCurrency = (amount: number, currency?: string) => {
    const finalCurrency = currency || companySettings.currency;
    // Use locale that matches the currency, but fallback to company settings locale
    const locale = getLocaleForCurrency(finalCurrency, companySettings.locale);
    return formatCurrencyUtil(amount, finalCurrency, locale);
  };
  
  const formatDate = (date: Date) => {
    return formatDateUtil(date, companySettings.locale);
  };
  
  const formatDateTime = (date: Date) => {
    return formatDateTimeUtil(date, companySettings.locale);
  };
  
  return {
    formatCurrency,
    formatDate,
    formatDateTime,
    locale: companySettings.locale,
    currency: companySettings.currency,
  };
}

