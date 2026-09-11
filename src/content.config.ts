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
  }),
});

export const collections = { blog };
