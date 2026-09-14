/**
 * Shared helpers for the blog: the published-post list, reading time, dates, categories and
 * related posts. The index, the post pages, the RSS feed and the homepage's blog invitations all
 * read posts through here, so they never disagree about what is published or how long it takes.
 */
import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"blog">;

export const SITE = "https://striff.io";
export const BLOG_NAME = "Striff Engineering";
export const BLOG_MISSION = "On documented architecture, and making it hold.";
export const BLOG_DESCRIPTION =
  "Engineering patterns, real findings from open-source PRs, and updates on making structural review part of every pull request.";

/** Published posts, newest first. A draft is never built, listed, linked or syndicated. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Minutes to read a post body at 230 words a minute, not counting imports, display math or markup. */
export function estimateMinutes(body: string | undefined): number {
  const words = (body ?? "")
    .replace(/^import .*$/gm, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

/** The frontmatter's readingTime when a post sets one, otherwise the estimate from its body. */
export function readingMinutes(post: Post): number {
  return post.data.readingTime ?? estimateMinutes(post.body);
}

/**
 * A post date for display. Frontmatter dates are UTC midnight, so formatting in UTC keeps a
 * build machine west of Greenwich from showing the day before.
 */
export function formatDate(date: Date, style: "long" | "short" = "long"): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: style,
    day: "numeric",
    timeZone: "UTC",
  });
}

/** A category as a URL- and attribute-safe key: "Data & research" becomes "data-and-research". */
export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type Tone = "blue" | "teal" | "violet" | "amber";

const CATEGORY_TONES: Record<string, Tone> = {
  architecture: "blue",
  "data-and-research": "teal",
  product: "violet",
};

/** The tint a category's covers and labels use; an unlisted category falls back to amber. */
export function categoryTone(category: string): Tone {
  return CATEGORY_TONES[categorySlug(category)] ?? "amber";
}

/** Up to two initials for an avatar that has no image. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/** Up to `count` other published posts: the same category first, then the most recent. */
export function relatedPosts(post: Post, all: Post[], count = 3): Post[] {
  const others = all.filter((candidate) => candidate.slug !== post.slug);
  const sameCategory = others.filter((candidate) => candidate.data.category === post.data.category);
  const rest = others.filter((candidate) => candidate.data.category !== post.data.category);
  return [...sameCategory, ...rest].slice(0, count);
}
