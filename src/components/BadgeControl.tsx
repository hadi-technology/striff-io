import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BadgePanel from "./BadgePanel";
import { badgePreviewPath as previewPath, isRootReadme } from "../lib/badgeSnippets.js";

/**
 * A repository's live README badge, drawn as the control that offers it: clicking the badge, or
 * Enter or Space on it, opens the panel with its snippet.
 *
 * The image is the badge as a README would show it, asked for as a preview so that showing it here
 * is never counted as a README carrying it. Until it has arrived the control keeps a badge-sized
 * place, so what is around it does not move. If it cannot be had, the control either says what it
 * does in words, where it is the only way to the panel, or takes no room at all.
 */

const TOOLTIP = "Add this badge to your README";

/** The badge as a Striff page shows it, with the key where it needs one. */
export function badgePreviewPath(owner: string, name: string, token?: string | null): string {
  return previewPath(owner, name, { token });
}

export function BadgeControl({
  src,
  onOpen,
  expanded,
  controls,
  lazy,
  fallback,
  className,
}: {
  /** The image, or null while what it needs (a private repository's key) is on its way. */
  src: string | null;
  onOpen: () => void;
  expanded?: boolean;
  controls?: string;
  /** Leave loading the image to the browser until it is near the screen. */
  lazy?: boolean;
  /** What a failed image leaves: the words, or nothing. */
  fallback: "text" | "none";
  className?: string;
}) {
  // Kept by address, so a new address (a key arriving, a style changing) starts again as loading.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const state = src && failedSrc === src ? "failed" : src && loaded === src ? "shown" : "loading";
  if (state === "failed" && fallback === "none") return null;
  return (
    <button
      type="button"
      className={`badge-control${state === "loading" ? " is-loading" : ""}${state === "failed" ? " is-text" : ""}${className ? ` ${className}` : ""}`}
      onClick={onOpen}
      title={TOOLTIP}
      aria-label={TOOLTIP}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-haspopup="dialog"
    >
      {state === "failed" ? (
        <span>Add badge to README</span>
      ) : src ? (
        <img
          src={src}
          alt=""
          height={20}
          loading={lazy ? "lazy" : undefined}
          onLoad={() => setLoaded(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : null}
    </button>
  );
}

interface BadgeInfo {
  token: string | null;
  seenAtMs: number | null;
  /** Rules the badge counts as held, which decides whether "rules verified" is offered. */
  heldRules?: number | null;
  /** Whether "agent docs" applies to the repository. */
  agentDocs?: boolean;
}

function proxy(installationId: number, fullName: string, view?: string): string {
  const [owner, name] = fullName.split("/");
  return `/.netlify/functions/doc-catalog-proxy?${view ? `view=${view}&` : ""}installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`;
}

/** A private repository's badge key, asked for only once the card is near the screen. */
function useKeyWhenVisible(installationId: number, fullName: string, wanted: boolean) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const place = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!wanted || !place.current) return;
    let current = true;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      fetch(proxy(installationId, fullName, "badge"))
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: BadgeInfo) => current && (data.token ? setToken(data.token) : setFailed(true)))
        .catch(() => current && setFailed(true));
    }, { rootMargin: "200px" });
    seen.observe(place.current);
    return () => {
      current = false;
      seen.disconnect();
    };
  }, [installationId, fullName, wanted]);
  return { token, failed, place };
}

/** One repository card's badge: the control, and the panel it opens over the page. */
export function RepoCardBadge({
  installationId,
  repo,
}: {
  installationId: number;
  repo: { full_name: string; private?: boolean; default_branch?: string };
}) {
  const [owner, name] = repo.full_name.split("/");
  const [open, setOpen] = useState(false);
  const { token, failed, place } = useKeyWhenVisible(installationId, repo.full_name, !!repo.private);
  if (failed) return null;
  return (
    <span className="repo-card-badge" ref={place}>
      <BadgeControl
        src={repo.private ? (token ? badgePreviewPath(owner, name, token) : null) : badgePreviewPath(owner, name)}
        onOpen={() => setOpen(true)}
        expanded={open}
        lazy
        fallback="none"
      />
      {/* Drawn at the page's root: a card that moves on hover, inside a list that scrolls, would
          otherwise hold the dialog inside itself. */}
      {open && createPortal(
        <BadgeDialog installationId={installationId} repo={repo} onClose={() => setOpen(false)} />,
        document.body
      )}
    </span>
  );
}

/**
 * The selected repository's badge in the dashboard's side panel, under the repository picker, so
 * it is in view whichever section is open. Clicking it opens the badge panel over the page. Keyed
 * by repository where it is used, so a new selection starts again with that repository's key.
 * Where a private repository's key cannot be had, the entry says what it does in words, so the
 * panel, which says why, is still reachable.
 */
export function SideBadge({
  installationId,
  repo,
  open,
  onOpen,
  onClose,
}: {
  installationId: number;
  repo: { full_name: string; private?: boolean; default_branch?: string };
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [owner, name] = repo.full_name.split("/");
  const { token, failed, place } = useKeyWhenVisible(installationId, repo.full_name, !!repo.private);
  return (
    <span className="dash-repo-badge" ref={place}>
      {failed ? (
        <button
          type="button"
          className="badge-control is-text"
          onClick={onOpen}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          Add badge to README
        </button>
      ) : (
        <BadgeControl
          src={repo.private ? (token ? badgePreviewPath(owner, name, token) : null) : badgePreviewPath(owner, name)}
          onOpen={onOpen}
          expanded={open}
          fallback="text"
        />
      )}
      {open && createPortal(
        <BadgeDialog installationId={installationId} repo={repo} onClose={onClose} />,
        document.body
      )}
    </span>
  );
}

/**
 * The badge panel for one repository, over the page, so opening it leaves the reader where they
 * were. It asks for what the panel needs: the repository's key, and where its README is.
 */
export function BadgeDialog({
  installationId,
  repo,
  onClose,
}: {
  installationId: number;
  repo: { full_name: string; private?: boolean; default_branch?: string };
  onClose: () => void;
}) {
  const [owner, name] = repo.full_name.split("/");
  const [info, setInfo] = useState<BadgeInfo | null>(null);
  const [error, setError] = useState("");
  const [readme, setReadme] = useState<{ branch: string | null; path: string | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    fetch(proxy(installationId, repo.full_name, "badge"))
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!current) return;
        if (!res.ok) setError(data.message || data.error || "Couldn't get this repository's badge key.");
        else setInfo(data);
      })
      .catch(() => current && setError("Couldn't get this repository's badge key."));
    fetch(proxy(installationId, repo.full_name))
      .then((res) => (res.ok ? res.json() : null))
      .then((catalog) => {
        if (!current) return;
        setReadme({
          branch: catalog?.defaultBranch ?? null,
          path: (catalog?.documents || []).map((doc: { path: string }) => doc.path).find(isRootReadme) ?? null,
        });
      })
      .catch(() => current && setReadme({ branch: null, path: null }));
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      current = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [installationId, repo.full_name]);

  async function rotate() {
    const res = await fetch(proxy(installationId, repo.full_name, "badge-rotate"), { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message || data.error || "Couldn't make a new key.");
      return;
    }
    setError("");
    setInfo(data);
  }

  return (
    <div className="badge-dialog-scrim" onClick={onClose}>
      <div
        className="badge-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`README badge for ${repo.full_name}`}
        tabIndex={-1}
        ref={box}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="badge-dialog-close" onClick={onClose} aria-label="Close">×</button>
        <BadgePanel
          owner={owner}
          name={name}
          heading={`Add badge to ${repo.full_name}'s README`}
          branch={readme?.branch || repo.default_branch || "main"}
          readmePath={readme?.path ?? null}
          privateRepo={!!repo.private}
          heldRules={info?.heldRules ?? null}
          agentDocs={!!info?.agentDocs}
          token={info?.token ?? null}
          tokenError={error}
          onRotate={repo.private ? rotate : undefined}
        />
      </div>
    </div>
  );
}
