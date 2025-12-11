import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth-context';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { isValidEmail } from '../lib/utils';

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { signIn } = useAuth();

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Email is required
    if (!email || email.trim() === '') {
      errors.email = t('login.validation.emailRequired');
    } else if (!isValidEmail(email)) {
      errors.email = t('login.validation.emailInvalid');
    }
    
    // Password is required
    if (!password || password.trim() === '') {
      errors.password = t('login.validation.passwordRequired');
    }
    
    setValidationErrors(errors);
    setTouched({
      email: true,
      password: true,
    });
    
    return Object.keys(errors).length === 0;
  };

  const handleFieldChange = (field: 'email' | 'password', value: string) => {
    if (field === 'email') {
      setEmail(value);
    } else {
      setPassword(value);
    }
    
    // Clear error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors({ ...validationErrors, [field]: '' });
    }
  };

  const handleFieldBlur = (field: 'email' | 'password') => {
    setTouched({ ...touched, [field]: true });
    
    // Validate on blur
    if (field === 'email') {
      if (!email || email.trim() === '') {
        setValidationErrors({ ...validationErrors, email: t('login.validation.emailRequired') });
      } else if (!isValidEmail(email)) {
        setValidationErrors({ ...validationErrors, email: t('login.validation.emailInvalid') });
      } else {
        setValidationErrors({ ...validationErrors, email: '' });
      }
    } else if (field === 'password') {
      if (!password || password.trim() === '') {
        setValidationErrors({ ...validationErrors, password: t('login.validation.passwordRequired') });
      } else {
        setValidationErrors({ ...validationErrors, password: '' });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      // Try to get translated error message
      // Supabase errors can have different formats, so we check multiple possibilities
      const errorMessage = error.message || '';
      const errorKey = `login.errors.${errorMessage}`;
      let translatedError = t(errorKey);
      
      // If translation key doesn't exist (returns the key itself), use fallback
      if (translatedError === errorKey) {
        // Check for common error patterns
        if (errorMessage.toLowerCase().includes('invalid') || 
            errorMessage.toLowerCase().includes('credentials')) {
          translatedError = t('login.errors.Invalid login credentials');
        } else if (errorMessage.toLowerCase().includes('email') && 
                   errorMessage.toLowerCase().includes('confirm')) {
          translatedError = t('login.errors.Email not confirmed');
        } else if (errorMessage.toLowerCase().includes('not found') || 
                   errorMessage.toLowerCase().includes('user')) {
          translatedError = t('login.errors.User not found');
        } else if (errorMessage.toLowerCase().includes('too many') || 
                   errorMessage.toLowerCase().includes('rate limit')) {
          translatedError = t('login.errors.Too many requests');
        } else if (errorMessage.toLowerCase().includes('network') || 
                   errorMessage.toLowerCase().includes('fetch')) {
          translatedError = t('login.errors.Network error');
        } else {
          // Final fallback to generic message
          translatedError = t('login.invalidCredentials');
        }
      }
      
      toast.error(t('login.loginFailed'), {
        description: translatedError,
      });
      setIsLoading(false);
    } else {
      toast.success(t('login.loggedInSuccess'));
      // Navigation will happen automatically via auth state change
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8F8] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{t('login.title')}</CardTitle>
          <CardDescription>
            {t('login.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                onBlur={() => handleFieldBlur('email')}
                disabled={isLoading}
                autoComplete="email"
                aria-invalid={touched.email && !!validationErrors.email}
                className={touched.email && validationErrors.email ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/50' : ''}
              />
              {touched.email && validationErrors.email && (
                <p className="text-sm text-red-600">{validationErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => handleFieldChange('password', e.target.value)}
                onBlur={() => handleFieldBlur('password')}
                disabled={isLoading}
                autoComplete="current-password"
                aria-invalid={touched.password && !!validationErrors.password}
                className={touched.password && validationErrors.password ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/50' : ''}
              />
              {touched.password && validationErrors.password && (
                <p className="text-sm text-red-600">{validationErrors.password}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('login.signingIn')}
                </>
              ) : (
                t('login.signIn')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}



