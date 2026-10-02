import type { APIRoute } from "astro";
import { BLOG_DESCRIPTION, BLOG_NAME, SITE, getPublishedPosts, postUrl } from "../../lib/blog";

// Hand-rolled like sitemap.xml.ts: RSS 2.0 is a few lines of XML and needs no dependency.
const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();

  const items = posts.map((post) => {
    const url = postUrl(post.slug);
    return [
      "    <item>",
      `      <title>${escapeXml(post.data.title)}</title>`,
      `      <link>${url}</link>`,
      // The guid is the post's identity to a feed reader, so it keeps the form it was first
      // published with; changing it would show every post as new again.
      `      <guid isPermaLink="true">${SITE}/blog/${post.slug}</guid>`,
      `      <description>${escapeXml(post.data.description)}</description>`,
      `      <pubDate>${post.data.date.toUTCString()}</pubDate>`,
      `      <category>${escapeXml(post.data.category)}</category>`,
      `      <dc:creator>${escapeXml(post.data.author)}</dc:creator>`,
      "    </item>",
    ].join("\n");
  });

  // The newest post's date rather than the build time, so an unchanged blog builds an unchanged feed.
  const lastBuildDate = (posts[0]?.data.date ?? new Date(0)).toUTCString();

  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    "  <channel>",
    `    <title>${escapeXml(BLOG_NAME)}</title>`,
    `    <link>${SITE}/blog/</link>`,
    `    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(BLOG_DESCRIPTION)}</description>`,
    "    <language>en-us</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
