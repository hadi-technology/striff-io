import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    // The day the post last changed in substance. Feeds the sitemap's lastmod and the article's
    // dateModified; without it both use the publication date.
    updated: z.date().optional(),
    // The page's <title>, when the headline written for readers is not the phrase people search
    // for. The headline stays on the page, in the feed and in social previews.
    seoTitle: z.string().optional(),
    ogImage: z.string().optional(),
    // A draft stays in the repository but is never built, listed or linked.
    draft: z.boolean().optional(),
    // The byline. Posts are published by the team; a guest post overrides these.
    author: z.string().default("Striff Engineering"),
    authorRole: z.string().default(""),
    // A path under public/, e.g. "/authors/jane.jpg". The team byline uses the Striff mark.
    authorAvatar: z.string().default("/icon.svg"),
    // The section a post is filed under: its eyebrow, its index filter and its cover tint.
    category: z.string().default("Engineering"),
    // Minutes. Estimated from the body when absent; set it only to override the estimate.
    readingTime: z.number().int().positive().optional(),
    // The drawn cover the post uses on the index, in lists and as its header art (see
    // components/blog/covers). Without one the post gets a generated component graph.
    cover: z.enum(["survey", "docs-to-checks", "receipt", "coupling", "checklist", "stale-line"]).optional(),
  }),
});

export const collections = { blog };
