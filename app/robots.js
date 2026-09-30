const DEFAULT_SITE_URL = "http://localhost:3000";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function getSiteUrl(value) {
  const siteUrl = value || DEFAULT_SITE_URL;
  let parsedUrl;

  try {
    parsedUrl = new URL(siteUrl);
  } catch {
    throw new Error(
      "[robots] NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) URL.",
    );
  }

  if (
    !ALLOWED_PROTOCOLS.has(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "[robots] NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) URL without credentials, query, or fragment.",
    );
  }

  return siteUrl.replace(/\/+$/, "");
}

// Capture validated configuration once so concurrent calls share no mutable state.
const siteUrl = getSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}