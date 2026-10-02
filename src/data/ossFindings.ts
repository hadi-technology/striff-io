/**
 * Stale sentences Striff found in well-known open-source repositories, shown on the home page.
 *
 * Static on purpose: each entry was checked by hand against the repository's default branch at
 * the commit it links to, so the box cannot change under a reader the way live data could. The
 * quote is the text on the linked line exactly as it appears in the source file; `codeHas` says
 * only what that same commit's code shows. Re-check an entry against its repository before
 * changing the commit, and drop it if the sentence has been fixed.
 */
export interface OssFinding {
  owner: string;
  repo: string;
  /** Stars, rounded for display. */
  stars: string;
  docPath: string;
  line: number;
  commit: string;
  /** The linked line's text, verbatim from the source file. */
  quote: string;
  /** What the code at the same commit has instead; `code` spans mark identifiers. */
  codeHas: string;
}

export const ossFindings: OssFinding[] = [
  {
    owner: "scikit-learn",
    repo: "scikit-learn",
    stars: "67k",
    docPath: "doc/developers/utilities.rst",
    line: 49,
    commit: "2cc5fc9856675eb112bbd6640404027195741710",
    quote: "``sklearn.utils.Memory`` instance",
    codeHas: "There is no <code>sklearn.utils.Memory</code>. <code>check_memory</code> builds a <code>joblib.Memory</code>.",
  },
  {
    owner: "Lightning-AI",
    repo: "pytorch-lightning",
    stars: "31k",
    docPath: "docs/source-pytorch/extensions/strategy.rst",
    line: 85,
    commit: "84df182f50ab34301aabb3c0eb4031815bfb413d",
    quote: ":class:`~lightning.pytorch.strategies.SingleXLAStrategy`",
    codeHas: "The class is <code>SingleDeviceXLAStrategy</code>. A nitpick-ignore entry in <code>conf.py</code> keeps the docs build from flagging the old name.",
  },
  {
    owner: "celery",
    repo: "celery",
    stars: "29k",
    docPath: "docs/userguide/workers.rst",
    line: 1280,
    commit: "6bc42201225b93bbf2d0310262b55380e7406ef6",
    quote: ":class:`!celery.worker.control.ControlDispatch` instance.",
    codeHas: "No <code>ControlDispatch</code> exists anywhere in the code. The <code>!</code> tells Sphinx not to link it, so the build never checks it.",
  },
];

/** The line in the repository's docs, at the commit it was checked against. */
export function permalink(f: OssFinding): string {
  return `https://github.com/${f.owner}/${f.repo}/blob/${f.commit}/${f.docPath}?plain=1#L${f.line}`;
}

/**
 * The text HTML-escaped, with a break opportunity after each dot and slash, so a long dotted
 * name wraps between its parts on a phone rather than in the middle of one.
 */
export function breakable(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/([./])/g, "$1<wbr>");
}
