# Photos

This folder holds your board-ready pictures. **Nothing in here except this file is ever committed to git.**

## Add a theme

1. Make one folder per theme, for example `photos/aunties` or `photos/cousins-2025`.
   The folder name becomes the theme's name in the game ("Aunties", "Cousins 2025").
2. Put square photos in it (`.jpg`, `.jpeg`, `.png`, or `.webp`).
   Easier: export from Photos into `incoming/` and run `npm run prep -- --theme aunties`.
   It crops, shrinks, and strips location data for you.
3. Refresh the setup screen (or restart the game). The new theme appears on its own.

A folder with no pictures in it is hidden. The **Everyone** theme mixes all folders together.

## Just want to try it?

Run `npm run demo` to make a `demo` theme of 24 sample pictures.

## Keep photos somewhere else

Set `PHOTOS_DIR` (for example `PHOTOS_DIR=~/Dropbox/glimpse-photos npm start`), or create
`photos.config.json` in the repo folder:

```json
{ "photosDir": "~/Library/Mobile Documents/com~apple~CloudDocs/Glimpse Photos" }
```
