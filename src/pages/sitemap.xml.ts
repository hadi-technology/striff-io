import type { APIRoute } from "astro";
import { SITE, getPublishedPosts, lastModified, postUrl } from "../lib/blog";
import { reportHead, staticReports } from "../lib/staticReports.js";

// Public, indexable routes only. The dashboard, the post-install page and the billing
// return page are all either gated or single-use, and robots.txt disallows them too.
// Every address ends in a slash because that is the one Netlify answers with a 200; the
// form without it is a 301, and a sitemap should list no redirects.
const staticRoutes: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/demo/", changefreq: "monthly", priority: "0.8" },
  { path: "/pricing/", changefreq: "monthly", priority: "0.8" },
  { path: "/blog/", changefreq: "weekly", priority: "0.7" },
  { path: "/contact/", changefreq: "yearly", priority: "0.5" },
  { path: "/privacy/", changefreq: "yearly", priority: "0.3" },
  { path: "/terms/", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies/", changefreq: "yearly", priority: "0.3" },
];

const day = (date: Date) => date.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();
  // The public reports this build made pages of, where a search has something to land on: the
  // same pages, read once per build, so the sitemap never lists a page that was not built.
  const reports = (await staticReports()).map((report) => reportHead(report)).filter((head) => head.indexable);
  // The blog index changes when a post does.
  const blogLastmod = posts.length ? day(new Date(Math.max(...posts.map((p) => lastModified(p).getTime())))) : null;

  const urls = [
    ...staticRoutes.map((r) => {
      const lastmod = r.path === "/blog/" && blogLastmod ? `\n    <lastmod>${blogLastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${SITE}${r.path}</loc>${lastmod}\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`;
    }),
    ...posts.map(
      (post) =>
        `  <url>\n    <loc>${postUrl(post.slug)}</loc>\n    <lastmod>${day(lastModified(post))}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    ),
    ...reports.map((head) => {
      const lastmod = head.facts.refreshedAtMs ? `\n    <lastmod>${day(new Date(head.facts.refreshedAtMs))}</lastmod>` : "";
      return `  <url>\n    <loc>${head.canonical}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>`;
    }),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
