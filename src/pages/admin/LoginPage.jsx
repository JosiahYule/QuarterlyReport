import React, { useState } from "react";

export function LoginPage({ onSignIn }) {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSignIn(email);
      setSent(true);
    } catch (err) {
      setError("Failed to send magic link. Please check your email address and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <div className="admin-login-logo serif">Quarterly Report</div>
        <h1 className="admin-login-title">Admin Access</h1>
        {sent ? (
          <p className="admin-login-sent">
            Magic link sent to <strong>{email}</strong>. Check your inbox and click the link to sign in.
          </p>
        ) : (
          <form onSubmit={submit}>
            <div className="admin-field">
              <label className="admin-label" htmlFor="admin-email">Email address</label>
              <input
                id="admin-email"
                type="email"
                className="admin-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            {error && <p className="admin-error">{error}</p>}
            <button type="submit" className="admin-btn-primary" disabled={loading}>
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
