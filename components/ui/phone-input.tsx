// Phone input component with Russian formatting
// Optimized for performance: minimal re-renders, smooth cursor handling
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Input } from './input';
import { normalizePhoneNumber, formatPhoneNumber } from '../../lib/utils';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function PhoneInput({ value, onChange, onBlur, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusedRef = useRef(false);
  const [displayValue, setDisplayValue] = useState(() => formatPhoneNumber(value || ''));

  // Sync with external value changes only when not focused (prevents conflicts)
  useEffect(() => {
    if (!isFocusedRef.current) {
      const formatted = formatPhoneNumber(value || '');
      setDisplayValue(formatted);
    }
  }, [value]);

  // Format digits into Russian phone format
  const formatDigits = useCallback((digits: string): string => {
    if (!digits) return '';
    
    // Normalize: ensure starts with 7
    let normalized = digits;
    
    // Handle 8-prefixed 11-digit numbers (replace 8 with 7)
    if (normalized.startsWith('8') && normalized.length === 11) {
      normalized = '7' + normalized.substring(1);
    }
    // Handle 10-digit numbers: only add 7 if it doesn't already start with 7
    else if (normalized.length === 10 && !normalized.startsWith('7')) {
      normalized = '7' + normalized;
    }
    // Handle numbers that don't start with 7 or 8 (and aren't 10 digits)
    else if (!normalized.startsWith('7') && !normalized.startsWith('8') && normalized.length > 0) {
      normalized = '7' + normalized;
    }
    // If it's 10 digits and starts with 7, leave it as is (user is still typing)
    // If it's 11 digits and starts with 7, leave it as is (complete number)
    
    // Limit to 11 digits
    if (normalized.length > 11) {
      normalized = normalized.substring(0, 11);
    }
    
    // Format based on length
    if (normalized.length === 0) return '';
    if (normalized.length === 1) return '+7';
    if (normalized.length <= 4) {
      return `+7 (${normalized.substring(1)}`;
    }
    if (normalized.length <= 7) {
      return `+7 (${normalized.substring(1, 4)}) ${normalized.substring(4)}`;
    }
    if (normalized.length <= 9) {
      return `+7 (${normalized.substring(1, 4)}) ${normalized.substring(4, 7)}-${normalized.substring(7)}`;
    }
    // Full format: +7 (XXX) XXX-XX-XX
    return `+7 (${normalized.substring(1, 4)}) ${normalized.substring(4, 7)}-${normalized.substring(7, 9)}-${normalized.substring(9)}`;
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    // Extract digits only
    const digits = input.replace(/\D/g, '');
    
    // Limit to 11 digits
    if (digits.length > 11) {
      return;
    }
    
    // Format the digits
    const formatted = formatDigits(digits);
    
    // Calculate cursor position before updating
    // Count digits before cursor in original input
    const digitsBeforeCursor = input.substring(0, cursorPos).replace(/\D/g, '').length;
    
    // Find corresponding position in formatted string
    let newCursorPos = formatted.length;
    let digitsCounted = 0;
    
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        digitsCounted++;
        if (digitsCounted >= digitsBeforeCursor) {
          newCursorPos = i + 1;
          break;
        }
      }
    }
    
    // Update state
    setDisplayValue(formatted);
    
    // Save normalized value
    const normalized = normalizePhoneNumber(digits);
    onChange(normalized);
    
    // Set cursor position using requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const safePos = Math.min(Math.max(0, newCursorPos), formatted.length);
        inputRef.current.setSelectionRange(safePos, safePos);
      }
    });
  }, [formatDigits, onChange]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    
    // Final format on blur
    const normalized = normalizePhoneNumber(displayValue);
    const formatted = formatPhoneNumber(normalized);
    
    if (formatted !== displayValue) {
      setDisplayValue(formatted);
    }
    
    // Ensure normalized value is saved
    onChange(normalized);
    
    if (onBlur) {
      onBlur(e);
    }
  }, [displayValue, onChange, onBlur]);

  return (
    <Input
      {...props}
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder="+7 (XXX) XXX-XX-XX"
    />
  );
}

