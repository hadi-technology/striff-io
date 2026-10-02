/**
 * Well-known open-source repositories whose public Striff report holds at least one finding,
 * shown as a strip of links under the home page's hero.
 *
 * Static on purpose: each entry's report was checked to hold a finding when it was added, and the
 * strip names only the repository and its stars, so nothing on it can go out of date the way a
 * finding count could. Drop an entry whose report no longer has a finding. Each avatar is the
 * organisation's GitHub avatar, served from /oss-avatars so the page loads nothing from GitHub.
 */
export interface OssRepo {
  owner: string;
  repo: string;
  /** Stars, rounded for display. */
  stars: string;
  /** Path of the organisation's avatar under public/. */
  avatar: string;
}

export const ossRepos: OssRepo[] = [
  { owner: "scikit-learn", repo: "scikit-learn", stars: "67k", avatar: "/oss-avatars/scikit-learn.png" },
  { owner: "Lightning-AI", repo: "pytorch-lightning", stars: "31k", avatar: "/oss-avatars/lightning-ai.png" },
  { owner: "celery", repo: "celery", stars: "29k", avatar: "/oss-avatars/celery.png" },
  { owner: "dotnet", repo: "BenchmarkDotNet", stars: "11.5k", avatar: "/oss-avatars/dotnet.png" },
  { owner: "apache", repo: "storm", stars: "6.7k", avatar: "/oss-avatars/apache.png" },
  { owner: "Netflix", repo: "mantis", stars: "1.5k", avatar: "/oss-avatars/netflix.png" },
];

/** The repository's public report on striff.io. */
export function reportPath(r: OssRepo): string {
  return `/${r.owner}/${r.repo}`;
}
