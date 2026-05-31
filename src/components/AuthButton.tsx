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
      <div class="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          class="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden border-2 border-slate-200 hover:border-blue-400 transition-colors"
        >
          <img src={user.avatar_url} alt={user.login} class="h-full w-full" />
        </button>
        {open && (
          <div class="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p class="px-4 py-2 text-xs text-slate-500 truncate">{user.login}</p>
            <a
              href="/dashboard"
              class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Dashboard
            </a>
            <a
              href="/.netlify/functions/auth-logout"
              class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
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

  const oauthUrl = clientId
    ? `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=read:user,user:email&redirect_uri=${encodeURIComponent(
        `${typeof window !== "undefined" ? window.location.origin : "https://striff.io"}/.netlify/functions/auth-callback`
      )}`
    : "#";

  return (
    <a
      href={oauthUrl}
      class="text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      Sign in
    </a>
  );
}
