/**
 * Well-known open-source repositories whose public Striff report holds at least one finding,
 * shown as a strip of links in the home page's hero, each with its report's rules tally.
 *
 * The repositories, their stars and avatars are static. The tally is not: the home page reads it
 * from each repository's live report when the site is built (see ossTally.js), so it says what
 * the report said at the last deploy. `snapshot` is the tally the strip falls back to when that
 * read fails, taken by hand from the same reports on the date in `snapshotAsOf`; refresh it when
 * the reports move far from it. Drop an entry whose report no longer has a finding. Each avatar
 * is the organisation's GitHub avatar, served from /oss-avatars so the page loads nothing from
 * GitHub.
 */
export interface OssTally {
  /** Rules read from the repository's docs that hold on its default branch. */
  held: number;
  /** Rules that are broken on its default branch. */
  broken: number;
  /** Names the docs write that the code no longer has: the finding. */
  outOfDate: number;
}

export interface OssRepo {
  owner: string;
  repo: string;
  /** Stars, rounded for display. */
  stars: string;
  /** Path of the organisation's avatar under public/. */
  avatar: string;
  /** The report's tally on `snapshotAsOf`, used when the build cannot read the live one. */
  snapshot: OssTally;
}

/** The day `snapshot` was read from the live reports. */
export const snapshotAsOf = "2026-10-03";

export const ossRepos: OssRepo[] = [
  { owner: "scikit-learn", repo: "scikit-learn", stars: "67k", avatar: "/oss-avatars/scikit-learn.png",
    snapshot: { held: 54, broken: 0, outOfDate: 1 } },
  { owner: "Lightning-AI", repo: "pytorch-lightning", stars: "31k", avatar: "/oss-avatars/lightning-ai.png",
    snapshot: { held: 7, broken: 0, outOfDate: 1 } },
  { owner: "celery", repo: "celery", stars: "29k", avatar: "/oss-avatars/celery.png",
    snapshot: { held: 29, broken: 0, outOfDate: 1 } },
  { owner: "dotnet", repo: "BenchmarkDotNet", stars: "11.5k", avatar: "/oss-avatars/dotnet.png",
    snapshot: { held: 8, broken: 0, outOfDate: 1 } },
  { owner: "apache", repo: "storm", stars: "6.7k", avatar: "/oss-avatars/apache.png",
    snapshot: { held: 90, broken: 0, outOfDate: 5 } },
  { owner: "Netflix", repo: "mantis", stars: "1.5k", avatar: "/oss-avatars/netflix.png",
    snapshot: { held: 60, broken: 0, outOfDate: 2 } },
];

/** The repository's public report on striff.io. */
export function reportPath(r: OssRepo): string {
  return `/${r.owner}/${r.repo}`;
}
