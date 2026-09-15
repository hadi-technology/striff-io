import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    ogImage: z.string().optional(),
    // A draft stays in the repository but is never built, listed or linked.
    draft: z.boolean().optional(),
    // The byline. Every post so far is the founder's; a guest post overrides these.
    author: z.string().default("Muntazir Fadhel"),
    authorRole: z.string().default("Founder, Striff"),
    // A path under public/, e.g. "/authors/jane.jpg". Without one the byline shows initials.
    authorAvatar: z.string().optional(),
    // The section a post is filed under: its eyebrow, its index filter and its cover tint.
    category: z.string().default("Engineering"),
    // Minutes. Estimated from the body when absent; set it only to override the estimate.
    readingTime: z.number().int().positive().optional(),
    // The drawn cover the post uses on the index, in lists and as its header art (see
    // components/blog/covers). Without one the post gets a generated component graph.
    cover: z.enum(["survey", "docs-to-checks", "receipt", "coupling", "checklist"]).optional(),
  }),
});

export const collections = { blog };
