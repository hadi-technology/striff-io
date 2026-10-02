import { useEffect, useRef, useState } from "react";
import {
  BADGE_FORMATS,
  BADGE_STYLES,
  badgeImageUrl,
  badgeLinkUrl,
  badgeSnippet,
  readmeEditUrl,
} from "../lib/badgeSnippets.js";

/**
 * The README badge for one repository: what it looks like, in the style picked, and the snippet
 * that puts it in a README, ready to copy in whichever markup the README is written in.
 *
 * The preview is the badge itself, asked for as a preview so that showing it here is never taken
 * for a README carrying it. On the demo there is no real repository to ask about, so the preview is
 * a fixed picture of the example repository's counts; the snippet and copying work as anywhere.
 *
 * A private repository's badge carries a key for that repository, and the snippet carries it too:
 * without it the badge would read "not set up" to every reader. Rotating the key is the way to stop
 * a copy of the snippet that went somewhere it should not have.
 */

type Format = "markdown" | "html" | "rst" | "asciidoc";

export interface BadgePanelProps {
  owner: string;
  name: string;
  /** The default branch, for the link that opens the README in GitHub's editor. */
  branch: string;
  /** The root README's path, or null where the repository has none and one is to be started. */
  readmePath: string | null;
  /** The repository's key, given only for a private repository. */
  token?: string | null;
  /** Whether the repository is private; its snippet is withheld until the key has arrived. */
  privateRepo?: boolean;
  /** A fixed preview, for the demo, in place of asking for the badge. */
  sample?: boolean;
  /** Asks for a new key; given only where the reader may. */
  onRotate?: () => Promise<void>;
  /** Why the key could not be had, where it could not. */
  tokenError?: string;
  /** Says what the panel is, in place of the default heading. */
  heading?: string;
}

/** Puts text on the clipboard, by the old route where the browser will not grant the new one. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Falls through to the old route.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    document.body.removeChild(area);
    return done;
  } catch {
    return false;
  }
}

export default function BadgePanel({
  owner,
  name,
  branch,
  readmePath,
  token,
  privateRepo,
  sample,
  onRotate,
  tokenError,
  heading,
}: BadgePanelProps) {
  const [style, setStyle] = useState<string>("flat");
  const [format, setFormat] = useState<Format>("markdown");
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const [rotating, setRotating] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => setCopied(""), [style, format, token]);

  // A private repository's snippet without its key would put a badge reading "not set up" in the
  // README, so none is offered until the key is here.
  const waitingForKey = !!privateRepo && !token;
  const key = privateRepo ? token : null;
  const image = badgeImageUrl(owner, name, { style, token: key });
  const link = badgeLinkUrl(owner, name);
  const snippet = badgeSnippet(format, image, link);
  const preview = sample
    ? `/badge-examples/demo-${style}.svg`
    : badgeImageUrl(owner, name, { style, token: key, preview: true });

  async function copy() {
    const ok = await copyText(snippet);
    setCopied(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(""), 2500);
  }

  async function rotate() {
    if (!onRotate) return;
    if (!window.confirm("Make a new key? Every README using the current one will show \"not set up\" until it is updated.")) {
      return;
    }
    setRotating(true);
    try {
      await onRotate();
    } finally {
      setRotating(false);
    }
  }

  return (
    <section className="badge-panel" aria-label="README badge">
      <div className="badge-panel-head">
        <div>
          <p className="dashboard-kicker">{heading ?? "Add badge to README"}</p>
          <p className="badge-panel-lede">
            Shows how many of this repository's documented rules hold on its default branch, and
            links to the page that lists them.
          </p>
        </div>
        <div className="badge-panel-preview" aria-live="polite">
          {waitingForKey ? (
            <span className="badge-panel-wait">{tokenError || "Getting this repository's key…"}</span>
          ) : (
            <a href={link} target="_blank" rel="noopener noreferrer" title="Where the badge links">
              <img src={preview} alt="This repository's Striff badge" height={style === "for-the-badge" ? 28 : 20} />
            </a>
          )}
        </div>
      </div>

      <div className="badge-panel-row">
        <span className="badge-panel-label">Style</span>
        <div className="badge-panel-choices" role="radiogroup" aria-label="Badge style">
          {BADGE_STYLES.map((each: string) => (
            <button
              key={each}
              type="button"
              role="radio"
              aria-checked={style === each}
              className={`badge-panel-choice${style === each ? " is-on" : ""}`}
              onClick={() => setStyle(each)}
            >
              {each}
            </button>
          ))}
        </div>
      </div>

      <div className="badge-panel-row">
        <span className="badge-panel-label">Format</span>
        <div className="badge-panel-choices" role="tablist" aria-label="Snippet format">
          {BADGE_FORMATS.map((each: { id: string; label: string }) => (
            <button
              key={each.id}
              type="button"
              role="tab"
              aria-selected={format === each.id}
              className={`badge-panel-choice${format === each.id ? " is-on" : ""}`}
              onClick={() => setFormat(each.id as Format)}
            >
              {each.label}
            </button>
          ))}
        </div>
      </div>

      {!waitingForKey && <pre className="badge-panel-snippet"><code>{snippet}</code></pre>}

      {privateRepo && (
        <p className="badge-panel-note">
          This badge's address carries a key for this repository only, so the badge shows to anyone
          who sees your README while the repository stays private. Rotate the key to stop an old
          copy working.
        </p>
      )}

      <div className="badge-panel-actions">
        <button
          type="button"
          className="dashboard-button dashboard-button-primary"
          onClick={copy}
          disabled={waitingForKey}
        >
          {copied === "copied" ? "Copied" : `Copy ${BADGE_FORMATS.find((f: { id: string }) => f.id === format)?.label}`}
        </button>
        <a
          className="dashboard-button dashboard-button-secondary"
          href={readmeEditUrl(owner, name, branch, readmePath)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {readmePath ? "Open README on GitHub" : "Start a README on GitHub"}
        </a>
        {privateRepo && onRotate && (
          <button
            type="button"
            className="dashboard-button dashboard-button-secondary"
            onClick={rotate}
            disabled={rotating || !token}
          >
            {rotating ? "Rotating…" : "Rotate key"}
          </button>
        )}
        <span className="badge-panel-copied" role="status" aria-live="polite">
          {copied === "copied" ? "Copied to the clipboard. Paste it at the top of your README." : ""}
          {copied === "failed" ? "Your browser would not copy. Select the snippet and copy it by hand." : ""}
        </span>
      </div>
    </section>
  );
}
