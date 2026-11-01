# Changelog

All notable changes to Sidonie 伴学 are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- **New mascot and icon: the moon rabbit (玉兔).** A cream rabbit rising in front of an amber full moon, chosen for Sidonie and part of the FantasyAI Lab mascot family, replaces the sun-and-book mark in the app (sidebar, mobile header, about page), favicons and touch icons, the website, README banners, social preview, share card and poster. Screenshots that show the logo were recaptured. Sources and build scripts live in `docs/assets/brand/src/`.

## 0.2.0 - 2026-11-01

### Added

- **Paper study workflow.** Paper Radar now covers find → save → read → understand → annotate → review → cite. See [docs/paper-study.md](./docs/paper-study.md).
  - Reading list with *To read / Reading / Read*, tags, filters and sorting. Add papers from the feed, by arXiv ID or URL (this works even when the arXiv API is unreachable), or by importing a local PDF. Study stats come from your own data: papers in the list, read this week, cards due, and streak.
  - Paper workspace with full-text PDF extraction (pdf.js, bundled, loaded on demand), a contents sidebar, and bilingual paragraph-by-paragraph translation.
  - Highlights in four colours with notes, plus AI *Explain* and *Translate* for a selected passage.
  - Structured close-reading analysis, and Q&A grounded in the paper (local BM25 retrieval, answers cite sections).
  - Key-term flashcards on the spaced-repetition scheduler shared with Help Child.
  - A Markdown note per paper, **Export to Notes**, and citations in BibTeX, APA 7 and GB/T 7714-2015.
  - Heavy per-paper data (PDFs, text, translations, analyses, chats) is stored in IndexedDB.
- **Project website** in `website/` (Chinese and English): a static page with no build step, CDNs, web-font services or trackers.
- **CI and deploy.** GitHub Actions run typecheck, tests and build, and a workflow publishes the app to GitHub Pages.
- **Tests.** Vitest suites for the SRS scheduler, BM25, citations, text sections, paper AI helpers and the paper store.
- This changelog.

### Changed

- **Name:** the product is now **Sidonie 伴学** (the Chinese UI shows 「Sidonie 伴学」), with new brand assets in `docs/assets/brand/` and links pointing at `melonlee/sidonie`.
- The app is positioned as a family learning companion (landing copy, Help Child first).
- The Inter font is bundled instead of loaded from Google Fonts.
- The README (EN and ZH) presents two pillars, Help Child (帮孩子学) and paper study (大人的论文学习), with refreshed screenshots.
- The initial UI language follows the browser on first visit.

### Fixed

- Chat: SSE lines split across chunks by OpenAI-compatible providers are now buffered correctly.
- Paper Radar: free-text searches match the phrase.
- Painting: links out instead of embedding an HTTP tool on HTTPS pages.
- Calendar month names follow the app language, and the remaining hard-coded labels in Help Child and Paper Radar are translated.

### Known limitations

- Full-text extraction is heuristic. Formulas, tables and text inside figures may be garbled, and scanned (image-only) PDFs have no text to extract.
- The AI panels in the paper study screenshots show hand-written demo text, not real model output.

## 0.1.0 (untagged)

- Package metadata set to 0.1.0. At that point the app had Help Child (curriculum map, concept/quiz/visual cards, spaced review, XP and badges, daily school notes), Paper Radar (arXiv feed, AI Deep Read, Daily Briefing), multi-model chat and notes, BYOK with Gemini, DeepSeek, Kimi and Qwen.
