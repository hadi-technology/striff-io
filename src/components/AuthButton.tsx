import { createElement, useState, useEffect, useRef } from "react";

interface User {
  login: string;
  avatar_url: string;
  name: string | null;
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/.netlify/functions/auth-status")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setUser(data.user);
      })
      .catch(() => {});

    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (user) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden border-2 border-slate-200 hover:border-blue-400 transition-colors"
        >
          <img src={user.avatar_url} alt={user.login} className="h-full w-full" />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-4 py-2 text-xs text-slate-500 truncate">{user.login}</p>
            <a
              href="/dashboard"
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Dashboard
            </a>
            <a
              href="/.netlify/functions/auth-logout"
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </a>
          </div>
        )}
      </div>
    );
  }

  const clientId =
    typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_GITHUB_OAUTH_CLIENT_ID
      ? import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID
      : "";

  // Double-submit state: auth-callback compares this cookie against the state GitHub echoes
  // back, so the URL is built on click rather than at render.
  function startOAuth(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!clientId) return;
    const state = crypto.randomUUID();
    document.cookie = `gh_oauth_state=${state}; path=/; max-age=600; secure; samesite=lax`;
    const params = new URLSearchParams({
      client_id: clientId,
      scope: "read:user,user:email",
      redirect_uri: `${window.location.origin}/.netlify/functions/auth-callback`,
      state,
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  }

  return (
    <a
      href="#"
      onClick={startOAuth}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/20"
      style={{ minHeight: "2.75rem", lineHeight: 1 }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      Sign in
    </a>
  );
}
