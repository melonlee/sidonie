# Sidonie 伴学 · project website

A standalone, static marketing site for Sidonie. It is separate from the app itself (the app lives at the repo root and is deployed to GitHub Pages by `.github/workflows/deploy-pages.yml`).

- `index.html`: Chinese (primary audience: parents)
- `en/index.html`: English
- `assets/`: stylesheet, a few lines of progressive-enhancement JS, logo, Open Graph image, screenshots, and the self-hosted Fraunces font (SIL OFL, see `assets/fonts/OFL.txt`)

No build step, no external CDNs, fonts, analytics or trackers, so it loads quickly from mainland China too. Every URL is relative, so the folder works at the domain root or under any sub-path.

## Preview locally

Any static file server works. From the repo root:

```bash
python3 -m http.server 8080 --directory website
# open http://localhost:8080/ (中文) and http://localhost:8080/en/
```

Use a server rather than opening `index.html` from disk: browsers block web fonts on `file://` URLs.

## Deploy

Publish the `website/` folder as-is.

| Host | Settings |
| --- | --- |
| **Vercel** | New Project → import the repo → Framework preset *Other*, **Root Directory** `website`, no build command, output directory `.` |
| **Netlify** | Add new site → import the repo → base directory empty, build command empty, **Publish directory** `website` (or drag and drop the folder in the Netlify UI) |
| **Cloudflare Pages** | Create → Pages → connect the repo → framework *None*, build command empty, **Build output directory** `website` |
| **GitHub Pages** | The repo's Pages site already serves the app demo, so host the website from a separate repo (copy `website/` to its root) or use one of the hosts above. Pages only allows one site per repo. |

A custom domain (for example `sidonie.fantasyailab.com`) is up to the owner: add it in the host's dashboard and create the CNAME record it asks for.

## After choosing a domain

Social crawlers need absolute URLs. `og:image` and `twitter:image` currently point at the copy of `assets/og-image.jpg` on GitHub (`raw.githubusercontent.com/melonlee/sidonie/main/...`), which works once this folder is on `main`. When the site has its own domain:

1. Replace that URL in both pages with `https://<your-domain>/assets/og-image.jpg`.
2. Optionally add `<link rel="canonical">` and make the `hreflang` links absolute.

## Updating screenshots

The images in `assets/img/` are copies of the app screenshots, cropped and quantised (256-colour PNG) to keep the page light. When the UI changes, re-capture them from `docs/screenshots/` (or the app) at 2× and keep each file under about 200 KB.
