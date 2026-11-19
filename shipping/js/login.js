/* Package Tracker sign-in (prototype). Loaded after package-tracker.css. */
:root {
  --login-ink: #17191c;
  --login-paper: #ffffff;
  --login-muted: #737981;
  --login-line: #e6e8eb;
  --login-accent: #fe5b1b;
  --login-error: #ad3d2c;
}

body.auth-locked { overflow: hidden; }
body.auth-locked .app-header,
body.auth-locked .prototype-warning,
body.auth-locked .app-shell,
body.auth-locked .toast-region { display: none; }

.login-screen {
  position: fixed; inset: 0; z-index: 1000;
  display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  background: var(--login-paper); color: var(--login-ink);
  font-family: inherit;
}
.login-screen[hidden] { display: none; }

.login-brand {
  background: var(--login-ink); color: #fff;
  padding: clamp(28px, 5vw, 64px);
  display: flex; flex-direction: column; justify-content: space-between;
  border-right: 6px solid var(--login-accent);
}
.login-brand img { height: 34px; width: auto; align-self: flex-start; }
.login-brand h1 { font-size: clamp(2rem, 4vw, 3.2rem); line-height: 1.05; margin: 0 0 16px; font-weight: 700; letter-spacing: -0.02em; }
.login-brand p { margin: 0; max-width: 34ch; color: #cfcfcf; line-height: 1.5; }
.login-brand small { color: #9a9a9a; }

.login-main { display: grid; place-items: center; padding: 32px 20px; overflow-y: auto; }
.login-card { width: min(420px, 100%); }
.login-card h2 { font-size: 1.6rem; margin: 0 0 6px; }
.login-card .login-lede { margin: 0 0 24px; color: var(--login-muted); }

.login-card label { display: block; font-weight: 600; font-size: .9rem; margin-bottom: 16px; }
.login-card input[type="email"],
.login-card input[type="password"],
.login-card input[type="text"] {
  display: block; width: 100%; margin-top: 6px; padding: 12px 14px;
  font: inherit; border: 1.5px solid var(--login-line); border-radius: 6px; background: #fff; color: var(--login-ink);
}
.login-card input:focus-visible,
.login-card button:focus-visible { outline: 3px solid var(--login-accent); outline-offset: 2px; }
.login-card input[aria-invalid="true"] { border-color: var(--login-error); }

.password-row { position: relative; }
.password-row input { padding-right: 76px; }
.password-toggle {
  position: absolute; right: 6px; bottom: 6px; height: 34px; padding: 0 10px;
  background: none; border: 0; font: inherit; font-size: .85rem; font-weight: 600; color: var(--login-muted); cursor: pointer;
}

.login-error { min-height: 1.4em; margin: 0 0 12px; color: var(--login-error); font-size: .9rem; font-weight: 600; }

.login-submit {
  width: 100%; padding: 13px 16px; font: inherit; font-weight: 700; cursor: pointer;
  background: var(--login-ink); color: #fff; border: 0; border-radius: 6px;
}
.login-submit:hover { background: #090a0b; }
.login-submit[disabled] { opacity: .6; cursor: progress; }

.login-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: var(--login-muted); font-size: .85rem; }
.login-divider::before, .login-divider::after { content: ""; flex: 1; height: 1px; background: var(--login-line); }

.login-ms {
  width: 100%; padding: 12px 16px; font: inherit; font-weight: 600;
  background: #fff; color: var(--login-muted); border: 1.5px dashed var(--login-line); border-radius: 6px; cursor: not-allowed;
}
.login-ms-note { margin: 8px 0 0; font-size: .8rem; color: var(--login-muted); }

.login-demo {
  margin-top: 24px; padding: 14px 16px; background: #f6f6f6; border-left: 4px solid var(--login-accent);
  border-radius: 4px; font-size: .85rem;
}
.login-demo strong { display: block; margin-bottom: 8px; }
.demo-account {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%;
  padding: 8px 0; background: none; border: 0; border-top: 1px solid var(--login-line);
  font: inherit; text-align: left; cursor: pointer; color: inherit;
}
.demo-account:first-of-type { border-top: 0; }
.demo-account span:last-child { color: var(--login-muted); font-size: .8rem; }
.demo-account:hover span:first-child { text-decoration: underline; }

/* Signed-in user chip in the app header */
.user-chip { display: inline-flex; align-items: center; gap: 12px; margin-left: 16px; font-size: .85rem; color: #fff; }
.user-chip[hidden] { display: none; }
.user-chip .user-role { color: #bdbdbd; }
.signout-button {
  background: transparent; color: #fff; border: 1px solid #6a6a6a; border-radius: 4px;
  padding: 6px 12px; font: inherit; font-size: .85rem; cursor: pointer;
}
.signout-button:hover { border-color: #fff; }
.signout-button:focus-visible { outline: 3px solid var(--login-accent); outline-offset: 2px; }

@media (max-width: 820px) {
  .login-screen { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .login-brand { border-right: 0; border-bottom: 6px solid var(--login-accent); padding: 20px; gap: 16px; }
  .login-brand h1 { font-size: 1.6rem; margin-bottom: 6px; }
  .login-brand small { display: none; }
}

/* Only the elements the role rules hide, so nothing else is affected */
.nav-item[hidden],
.quick-action[hidden],
.button[hidden] { display: none !important; }