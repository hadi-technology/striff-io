import katex from "katex";

/**
 * Formal logic typeset at build time: KaTeX HTML and fonts, no client script.
 * \htmlClass (trust: true) hands colour to CSS; only static strings written in this repo
 * are ever passed in.
 */
export function tex(src: string): string {
  return katex.renderToString(src, { output: "html", trust: true, strict: "ignore", throwOnError: true });
}
