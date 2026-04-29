# JAXFinder

Offline-first staff and faculty directory for Jacksonville State University. Search 1,300+ employees by name, department, email, or phone — instantly, with no login required.

## Features

- **Instant offline search** — full directory embedded in a single HTML file, works without internet
- **Live search fallback** — queries JSU's People Finder in the background for anyone not in the local database
- **Department browsing** — filter by any of 130+ campus departments
- **Favorites** — star contacts for quick access
- **12 themes** — Stay Cocky, Jobs, Woz, Terminal, OLED, Tesla, Gotham, Obsidian, Game Boy, Synthwave, Phosphor, Night Game
- **Add to homescreen** — works as a standalone app on iPhone and Android
- **Auto-updating** — GitHub Actions scrapes JSU's directory weekly to keep the database current

## Live Site

**[haisteno-ai.github.io/Directory](https://haisteno-ai.github.io/Directory/)**

## How It Works

The entire app is a single `index.html` file with ~1,370 employee records embedded as JSON. When you search, it filters the local database instantly. If online, it also queries JSU's People Finder via CORS proxy and merges any additional results.

A GitHub Actions workflow (`update-directory.yml`) runs every Monday, scraping A–Z from JSU's directory and committing the updated database back to the repo.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The app — HTML, CSS, JS, and embedded database |
| `scrape-directory.js` | Node script that fetches JSU's directory and updates the DB in `index.html` |
| `manifest.json` | Web app manifest for homescreen install |
| `.github/workflows/deploy.yml` | Deploys to GitHub Pages on every push |
| `.github/workflows/update-directory.yml` | Weekly directory scrape via GitHub Actions |

## Manual Database Update

```bash
npm install jsdom
node scrape-directory.js index.html
```

## Built With

Vanilla HTML/CSS/JS. No frameworks, no build step, no dependencies at runtime.

---

*Built for JSU IT*
