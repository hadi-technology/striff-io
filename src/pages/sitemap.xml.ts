import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const SITE = "https://striff.io";

// Public, indexable routes only. The dashboard, the post-install page and the billing
// return page are all either gated or single-use, and robots.txt disallows them too.
const staticRoutes: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/examples", changefreq: "weekly", priority: "0.9" },
  { path: "/pricing", changefreq: "monthly", priority: "0.8" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/contact", changefreq: "yearly", priority: "0.5" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3" },
];

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");

  const urls = [
    ...staticRoutes.map(
      (r) =>
        `  <url>\n    <loc>${SITE}${r.path}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`
    ),
    ...posts.map((post) => {
      const lastmod = new Date(post.data.date).toISOString().slice(0, 10);
      return `  <url>\n    <loc>${SITE}/blog/${post.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    }),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
