// Hook to provide formatting functions with current locale and currency from app context
import { useApp } from './app-context';
import { formatCurrency as formatCurrencyUtil, formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from './utils';

export function useFormatting() {
  const { companySettings } = useApp();
  
  const formatCurrency = (amount: number, currency?: string) => {
    return formatCurrencyUtil(amount, currency || companySettings.currency, companySettings.locale);
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

