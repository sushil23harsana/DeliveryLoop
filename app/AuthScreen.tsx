"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { authClient } from "./auth-client";

type AuthMode = "sign-in" | "activate" | "forgot" | "reset" | "check-email" | "verified" | "denied";

function passwordMessage(value: string) {
  if (value.length < 12) return "Use at least 12 characters.";
  return "Use a unique password you do not use elsewhere.";
}

export function AuthScreen({ status, message }: { status: number; message: string }) {
  const [mode, setMode] = useState<AuthMode>(status === 403 ? "denied" : "sign-in");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordHint, setPasswordHint] = useState("Use at least 12 characters.");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("auth");
      setEmail(params.get("email") || "");
      setToken(params.get("token") || "");
      if (status === 403) setMode("denied");
      else if (requested === "activate") setMode("activate");
      else if (requested === "reset" && params.get("token")) setMode("reset");
      else if (requested === "check-email") setMode("check-email");
      else if (requested === "verified") setMode("verified");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const formEmail = String(form.get("email") || email).trim().toLowerCase();
    const password = String(form.get("password") || "");
    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email: formEmail, password, callbackURL: window.location.origin });
        if (result.error) throw new Error(result.error.message || "Sign in failed");
        window.location.assign("/");
      } else if (mode === "activate") {
        const name = String(form.get("name") || "").trim();
        const confirmPassword = String(form.get("confirmPassword") || "");
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const result = await authClient.signUp.email({ email: formEmail, name, password, callbackURL: `${window.location.origin}/?auth=verified` });
        if (result.error) throw new Error(result.error.message || "Account activation failed");
        setEmail(formEmail);
        setMode("check-email");
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({ email: formEmail, redirectTo: `${window.location.origin}/?auth=reset` });
        if (result.error) throw new Error(result.error.message || "Unable to request a reset link");
        setEmail(formEmail);
        setMode("check-email");
      } else if (mode === "reset") {
        const confirmPassword = String(form.get("confirmPassword") || "");
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) throw new Error(result.error.message || "Password reset failed");
        setMode("sign-in");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOutDeniedAccount() {
    setBusy(true);
    await authClient.signOut();
    window.location.assign("/");
  }

  const isPasswordMode = mode === "sign-in" || mode === "activate" || mode === "reset";
  const heading = mode === "activate" ? "Activate your account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : mode === "check-email" ? "Check your inbox" : mode === "verified" ? "Email verified" : mode === "denied" ? "Access has not been granted" : "Welcome back";
  const subheading = mode === "activate" ? "Create secure credentials for the email your delivery team invited." : mode === "forgot" ? "We will email a secure one-hour reset link if this account exists." : mode === "reset" ? "Your new password will revoke every other active session." : mode === "check-email" ? `A secure link has been sent${email ? ` to ${email}` : ""}.` : mode === "verified" ? "Your account is ready. Sign in to open the workspace." : mode === "denied" ? message : "Sign in to your client delivery workspace.";

  return <main className="auth-layout">
    <section className="auth-story">
      <div className="auth-brand"><span className="brand-symbol large"><span /></span><span><b>DeliveryLoop</b><small>Client delivery, without the spreadsheet chase.</small></span></div>
      <div className="auth-story-copy"><p>One clear loop</p><h1>Ship, review, fix and approve in one client-ready workspace.</h1><div className="auth-proof"><span><ShieldCheck size={17} /> Invitation-only access</span><span><KeyRound size={17} /> Secure sessions and JWT APIs</span><span><Mail size={17} /> Verified email ownership</span></div></div>
      <small>Built for delivery teams and the clients testing their work.</small>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <header><span className="auth-icon">{mode === "check-email" || mode === "verified" ? <CheckCircle2 size={21} /> : <LockKeyhole size={20} />}</span><p>Secure workspace</p><h2>{heading}</h2><small>{subheading}</small></header>

        {mode === "check-email" ? <div className="auth-complete"><p>For your security, links expire after one hour. Check spam or ask your workspace administrator to resend the invitation.</p><button className="secondary-button" onClick={() => setMode("sign-in")}><ArrowLeft size={15} /> Back to sign in</button></div> : null}
        {mode === "verified" ? <div className="auth-complete"><button className="primary-button" onClick={() => setMode("sign-in")}>Continue to sign in</button></div> : null}
        {mode === "denied" ? <div className="auth-complete"><p>Ask your DeliveryLoop administrator to activate this exact email in the agency or client workspace.</p><button className="secondary-button" disabled={busy} onClick={signOutDeniedAccount}>Sign out and use another account</button></div> : null}

        {["sign-in", "activate", "forgot", "reset"].includes(mode) ? <form className="auth-form" onSubmit={submit}>
          {mode === "activate" ? <label>Full name<input name="name" autoComplete="name" required maxLength={120} placeholder="Your name" /></label> : null}
          {mode !== "reset" ? <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" readOnly={mode === "activate" && Boolean(email)} /></label> : null}
          {isPasswordMode ? <label>{mode === "reset" ? "New password" : "Password"}<span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={12} maxLength={128} onChange={(event) => setPasswordHint(passwordMessage(event.target.value))} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>{mode !== "sign-in" ? <small>{passwordHint}</small> : null}</label> : null}
          {mode === "activate" || mode === "reset" ? <label>Confirm password<input name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} /></label> : null}
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "activate" ? "Create secure account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Save new password" : "Sign in"}</button>
          {mode === "sign-in" ? <div className="auth-links"><button type="button" onClick={() => { setError(""); setMode("forgot"); }}>Forgot password?</button><button type="button" onClick={() => { setError(""); setMode("activate"); }}>Activate invitation</button></div> : <button type="button" className="auth-back" onClick={() => { setError(""); setMode("sign-in"); }}><ArrowLeft size={14} /> Back to sign in</button>}
        </form> : null}
      </div>
      <p className="auth-privacy">Authentication cookies are secure and HTTP-only. DeliveryLoop never stores access tokens in your browser.</p>
    </section>
  </main>;
}
