# Music is Life

A free music app: search, stream and download music without an account or subscription. There are no ads and no tracking.

All music comes from the [Internet Archive](https://archive.org), so everything in the app is **legal to download**:

| Source | What it is |
| --- | --- |
| Live concerts | Recordings from the Live Music Archive, by bands that allow fans to tape and share their shows |
| Netlabel releases | Albums that artists released for free under Creative Commons licenses |
| Creative Commons | Any audio the uploader licensed with Creative Commons |
| Vintage 78rpm records | Digitised shellac records from the Great 78 Project |

## Features

- Search by artist, album or genre, with a quick genre chip for each style
- Stream whole albums with a play queue, with lock-screen and headphone controls on phones
- **⬇ Download** saves an MP3 (or OGG/FLAC) to your device
- **＋ Save to library** keeps a track inside the app so it plays **offline**
- **Bandcamp tab** has a search button that opens Bandcamp's own results, plus albums you add from Bandcamp's embed code, with the official player and a "Get it on Bandcamp" button (enter $0 on "name your price" albums)
- Installs like an app on phones and desktops because it's a Progressive Web App (PWA), with no app store needed

## Running it

It's a plain static site with no build step:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

### Putting it online with GitHub Pages

1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The included workflow deploys the site. The site's address is shown on the Actions run.

### Installing on your phone

Open the site, then:
- **Android (Chrome):** use the ⋮ menu, then **Add to Home screen / Install app**
- **iPhone (Safari):** tap Share, then **Add to Home Screen**

## Please respect the licenses

Each album page links to its license and source page. Creative Commons music is free to download and share. Some licenses require credit to the artist or forbid commercial use, so check the license before reusing a track in your own projects.
