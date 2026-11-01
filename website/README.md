# Sidonie 伴学 · project website

A standalone, static marketing site for Sidonie. Live at <https://melonlee.github.io/sidonie/>. `.github/workflows/deploy-pages.yml` publishes this folder at the Pages root and the app build under `/app/` in one deployment.

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
| **GitHub Pages** (current) | Automatic on push to `main`: the website at `/<repo>/`, the app at `/<repo>/app/` (demo buttons link to `app/` relatively). |

A custom domain (for example `sidonie.fantasyailab.com`) is up to the owner: add it in the host's dashboard and create the CNAME record it asks for.

## Moving to a custom domain

`og:image`, `twitter:image`, `og:url`, `canonical` and the `hreflang` links are absolute URLs pointing at `https://melonlee.github.io/sidonie/`. If you move the site to its own domain (for example `sidonie.fantasyailab.com`), replace that prefix in both pages; the demo buttons are relative and keep working.
