import { useEffect, useState } from "react";
import BadgePanel from "./BadgePanel";
import { isRootReadme } from "../lib/badgeSnippets.js";

/**
 * The README badge, offered on the page GitHub sends someone to right after installing the App.
 *
 * Which repositories the installation covers is known only to someone signed in to Striff: the
 * page asks GitHub with the reader's own token, through the same proxy the dashboard uses. Signed
 * in, it offers the snippet for the installation's first public repository, or, where every
 * repository is private, the first private one's (its key, and a link to it on the dashboard).
 * Otherwise, and wherever an answer does not come, it offers the dashboard, where the badge
 * panel opens on arrival. An install that only asked an organisation owner for approval is
 * offered nothing: nothing is installed yet.
 */

interface Repo {
  full_name: string;
  private: boolean;
  default_branch?: string;
}

type Offer =
  | { kind: "none" }
  | { kind: "dashboard" }
  | {
      kind: "repo";
      repo: Repo;
      token: string | null;
      readmePath: string | null;
      heldRules: number | null;
      agentDocs: boolean;
    };

async function json(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function offerFor(installationId: string): Promise<Offer> {
  const status = await json("/.netlify/functions/auth-status");
  if (!status?.authenticated) return { kind: "dashboard" };
  const path = `/user/installations/${installationId}/repositories?per_page=100`;
  const data = await json(`/.netlify/functions/github-proxy?path=${encodeURIComponent(path)}`);
  const repos: Repo[] = Array.isArray(data?.repositories) ? data.repositories : [];
  const repo = repos.find((each) => !each.private) || repos[0];
  if (!repo) return { kind: "dashboard" };
  const [owner, name] = repo.full_name.split("/");
  const catalogUrl = (view: string) => `/.netlify/functions/doc-catalog-proxy?${view ? `view=${view}&` : ""}installation_id=${encodeURIComponent(installationId)}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`;
  // The key a private repository's badge needs, and for any repository what decides which badge
  // variants it is offered. A public repository's badge works without this answer.
  let token: string | null = null;
  let badge: any = null;
  try {
    badge = await json(catalogUrl("badge"));
  } catch {
    if (repo.private) return { kind: "dashboard" };
  }
  if (repo.private) {
    if (!badge?.token) return { kind: "dashboard" };
    token = badge.token;
  }
  // Where the README is, from the documents Striff listed. Just after an install nothing may be
  // listed yet, and then README.md, which most repositories have, is the better guess.
  let readmePath: string | null = "README.md";
  try {
    const catalog = await json(catalogUrl(""));
    const paths: string[] = (catalog?.documents || []).map((doc: { path: string }) => doc.path);
    if (paths.length > 0) readmePath = paths.find(isRootReadme) ?? null;
  } catch {
    // The guess stands.
  }
  return {
    kind: "repo",
    repo,
    token,
    readmePath,
    heldRules: typeof badge?.heldRules === "number" ? badge.heldRules : null,
    agentDocs: !!badge?.agentDocs,
  };
}

export default function InstalledBadge() {
  const [offer, setOffer] = useState<Offer | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id");
    if (params.get("setup_action") === "request") {
      setOffer({ kind: "none" });
      return;
    }
    if (!installationId || !/^\d+$/.test(installationId)) {
      setOffer({ kind: "dashboard" });
      return;
    }
    let current = true;
    offerFor(installationId)
      .then((found) => current && setOffer(found))
      .catch(() => current && setOffer({ kind: "dashboard" }));
    return () => {
      current = false;
    };
  }, []);

  if (!offer || offer.kind === "none") return null;
  return (
    <section className="installed-badge">
      <h2>Add Striff to your README</h2>
      <p>
        Your first check runs on your next pull request. Add this badge to your README to show how
        many of your documented rules Striff has verified against your code, or, until there are
        ten, that it checks them on every pull request.
      </p>
      {offer.kind === "repo" ? (
        <BadgePanel
          owner={offer.repo.full_name.split("/")[0]}
          name={offer.repo.full_name.split("/")[1]}
          branch={offer.repo.default_branch || "main"}
          readmePath={offer.readmePath}
          privateRepo={offer.repo.private}
          heldRules={offer.heldRules}
          agentDocs={offer.agentDocs}
          token={offer.token}
          heading={`For ${offer.repo.full_name}`}
        />
      ) : (
        <a className="btn-secondary inline-flex justify-center" href="/dashboard/#badge">
          Open your dashboard to get your badge
        </a>
      )}
    </section>
  );
}
