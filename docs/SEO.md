# Clarity search-discovery setup

Production URL: `https://clarity.codarox.com/`

## Included in the project
- Canonical URL and index/follow directives.
- Open Graph and Twitter metadata.
- JSON-LD for WebSite, WebApplication, and author.
- `build/robots.txt` with search and AI crawler access.
- `build/sitemap.xml` for the public Clarity URL.
- `build/llms.txt` with a concise machine-readable project description.
- Search-friendly visible introduction on the initial Clarity screen.
- Public URL, Codarox, and GitHub references in the legal information.

## Google Search Console
The `codarox.com` Domain property also covers `clarity.codarox.com`.

After deployment:
1. Inspect `https://clarity.codarox.com/` and request indexing once.
2. Submit `https://clarity.codarox.com/sitemap.xml` under Sitemaps.
3. Wait for crawling/indexing; repeated requests do not guarantee faster indexing.

## Bing and other search engines
Use Bing Webmaster Tools and import the verified Google Search Console property when convenient. The public `robots.txt` and sitemap are available to other compliant crawlers as well.

## Cloudflare
Keep Crawler Hints enabled for the `codarox.com` zone. Keep relevant search/AI crawlers unblocked in AI Crawl Control. Do not enable Cloudflare Managed robots.txt unless you intentionally want Cloudflare to replace or modify the custom robots policy.

## Important
Search visibility cannot be guaranteed or made instant. These files make Clarity crawlable and provide clear machine-readable signals; ranking and indexing are ultimately controlled by each search engine.
