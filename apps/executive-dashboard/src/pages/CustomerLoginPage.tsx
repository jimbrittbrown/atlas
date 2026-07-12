import { useState, type FormEvent } from 'react';
import {
  completeCustomerPasswordReset,
  loginCustomerPortal,
  registerCustomerPortal,
  requestCustomerPasswordReset
} from '../api/client';
import { DashboardApiError } from '../api/errors';

type CustomerLoginPageProps = {
  token?: string;
  onAuthenticated: (session: { customerId: string; sessionToken?: string; sessionId: string }) => void;
  onSignOut?: () => void;
};

export function CustomerLoginPage({ token, onAuthenticated, onSignOut }: CustomerLoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<DashboardApiError | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'login') {
        const result = await loginCustomerPortal({ email, password }, { token });
        onAuthenticated({
          customerId: result.customerId,
          sessionToken: result.sessionToken,
          sessionId: result.sessionId
        });
        setMessage('Signed in successfully.');
      }

      if (mode === 'register') {
        const result = await registerCustomerPortal({
          email,
          password,
          companyName: companyName || undefined,
          contactName: contactName || undefined
        }, { token });
        setMessage(result.verificationRequired
          ? 'Account created. Email verification is required before sign-in.'
          : 'Account created. You can sign in now.');
      }

      if (mode === 'forgot') {
        const result = await requestCustomerPasswordReset({ email }, { token });
        setMessage(result.developmentResetToken
          ? `Reset request accepted. Development reset token: ${result.developmentResetToken}`
          : result.message);
      }

      if (mode === 'reset') {
        await completeCustomerPasswordReset({ token: resetToken, newPassword }, { token });
        setMessage('Password reset completed. Sign in with your new password.');
      }
    } catch (err) {
      setError(err as DashboardApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Customer Login</h2>
        <p>Create account, sign in, and recover passwords using Atlas secure customer sessions.</p>
        <p>
          <button type="button" onClick={() => setMode('login')}>Sign In</button>{' '}
          <button type="button" onClick={() => setMode('register')}>Create Account</button>{' '}
          <button type="button" onClick={() => setMode('forgot')}>Forgot Password</button>{' '}
          <button type="button" onClick={() => setMode('reset')}>Complete Reset</button>
        </p>
        <p>
          <button type="button" onClick={() => onSignOut?.()}>Sign Out (Clear Session)</button>
        </p>
      </section>

      {message ? (
        <section className="panel success-panel" role="status">
          <p>{message}</p>
        </section>
      ) : null}

      {error ? (
        <section className="panel" role="alert">
          <h3>Login Error</h3>
          <p>{error.message}</p>
        </section>
      ) : null}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {(mode === 'login' || mode === 'register') ? (
          <label>Password<input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        ) : null}

        {mode === 'register' ? (
          <>
            <label>Company Name<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
            <label>Contact Name<input value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
          </>
        ) : null}

        {mode === 'reset' ? (
          <>
            <label>Reset Token<input required value={resetToken} onChange={(event) => setResetToken(event.target.value)} /></label>
            <label>New Password<input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          </>
        ) : null}

        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : mode === 'login'
            ? 'Login'
            : mode === 'register'
              ? 'Create Account'
              : mode === 'forgot'
                ? 'Send Reset Request'
                : 'Complete Password Reset'}
        </button>
      </form>
    </>
  );
}
