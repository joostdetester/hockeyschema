import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

function css(str) {
  const obj = {};
  (str || '').split(';').forEach(rule => {
    const idx = rule.indexOf(':');
    if (idx < 0) return;
    const prop = rule.slice(0, idx).trim();
    const val = rule.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    obj[camel] = val;
  });
  return obj;
}

export default function Login({ onClose }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      onClose();
    } catch (err) {
      setError('Inloggen mislukt — controleer e-mailadres en wachtwoord.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div style={css('display:flex;flex-direction:column;align-items:center;gap:var(--space-2);padding-bottom:var(--space-2)')}>
          <img src="/hcrb.png" alt="HCRB" style={css('width:64px;height:auto')} />
          <div className="dialog-title">Inloggen</div>
        </div>
        <form onSubmit={submit} style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
          <div className="field">
            <label htmlFor="login-email">E-mailadres</label>
            <input className="input" id="login-email" type="email" autoFocus required
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="login-password">Wachtwoord</label>
            <input className="input" id="login-password" type="password" required
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Bezig…' : 'Inloggen'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
