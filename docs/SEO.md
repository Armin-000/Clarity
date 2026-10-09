# Clarity by Codarox — SEO and search indexing

Canonical application: https://clarity.codarox.com/
Search-friendly informational page: https://clarity.codarox.com/o-clarityju.html
Brand portfolio: https://codarox.com/

## Implemented
- Unique title, description, canonical, Open Graph and Twitter metadata.
- JSON-LD WebSite, WebApplication, Person and Brand (Codarox is a development brand, not claimed to be a registered company).
- Visible 'Clarity by Codarox' attribution linking to Codarox and the informational page.
- Static crawlable informational page with real features, accessibility, usage and limitations.
- XML sitemap containing both published pages; existing robots.txt already points to the sitemap.
- Updated llms.txt and PWA manifest.
- No keyword stuffing or fabricated reviews, ratings or FAQ rich-result markup.

## After deploying the updated build
1. Open https://clarity.codarox.com/, https://clarity.codarox.com/o-clarityju.html, https://clarity.codarox.com/robots.txt and https://clarity.codarox.com/sitemap.xml and check for HTTP 200 (not a fallback index.html).
2. In Google Search Console, select the verified domain property 'codarox.com' or verify the property. Submit sitemap.xml under Sitemaps.
3. Use URL Inspection for the home page and the informational page. Request indexing if available and appropriate.
4. In Bing Webmaster Tools, add the domain and submit the same sitemap.
5. Link to the Clarity application and information page from the Codarox portfolio project page, with clear 'Clarity by Codarox' attribution. This portfolio is a separate repository and is not modified by this script.
6. Optionally add a verified 1200x630 PNG/JPG social-preview image and reference it via og:image and twitter:image. Do not link a nonexistent image.

## Important
Ranking for the generic query 'Clarity' is highly competitive (e.g. Microsoft Clarity and other products). The realistic initial branded phrases are 'Clarity Codarox', 'Clarity govor u tekst', and 'Clarity za gluhe'. Organic ranking and indexing are never guaranteed.

The script does not modify the recognizer, speech lifecycle, transcript storage or native STT bridge.
