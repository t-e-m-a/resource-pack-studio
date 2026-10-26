# Resource Pack Studio — Minecraft Java 26.3

A fully static, browser-only Minecraft resource pack workspace. No server upload, telemetry, or account required. Open `index.html` in a modern Chrome/Edge browser, or deploy this folder to GitHub Pages.

## Design and themes

- **Frost**: new default light, ice-blue/white layout with violet accents.
- **Midnight**: original dark navy theme. Toggle in the top toolbar; preference is saved in browser local storage.
- Mobile-responsive and no build step.

## Features implemented

- Import multiple `.zip` resource packs (including packs with one enclosing directory).
- Enable/disable/reorder packs. Top priority wins; per-file source selection overrides it.
- Browse and search effective resources, filter file types, and exclude individual assets from export.
- Inspect and replace textures; preview `.png.mcmeta` frame animations; edit ordinary PNG pixels; edit JSON and shader source text.
- Simplified 3D preview for vanilla cuboid block/item models and generated item sprites. Resolves uploaded parent models and textures. Rotate and zoom.
- Core/post shader source inspection; conflicts, `#include` references, legacy `#moj_import` warnings. No shader rendering or actual compilation.
- Static diagnostics for malformed JSON, selected missing references, metadata version mismatches, shader overrides.
- Export merged ZIP with a Minecraft 26.3-targeted `pack.mcmeta` (`min_format` and `max_format` both `[97, 1]`).
- Save `.rps` editable project containing original ZIPs, source choices, exclusions and modified assets; restore `.rps` by dropping it in the window.
- Target-26.3 resource overlays with matching `min_format`/`max_format` are flattened into the result.
- Defensive ZIP entry/path and size limits; no filesystem access except user-selected uploads/downloads.
- A built-in **Try sample project** button to test without source packs.

## Limitations

1. The model viewer is a simplified orthographic software renderer, **not Minecraft itself**. Vanilla tints, all generated item model branches, full blockstates, OptiFine/EMF custom entity models and arbitrary mod-specific behaviors are not fully reproduced. Unsupported assets are retained when exported.
2. Resource-pack core shaders are **not compiled, executed or rendered**. Source-reference checks can have false positives for dependencies supplied by vanilla Minecraft. Compatible shader execution must be verified in-game.
3. Repacking and setting `pack.mcmeta` to 97.1 **does not upgrade incompatible assets**. Minecraft 26.3 changed various texture paths, model fields and shader compilation requirements. The app reports selected concerns but does not fully migrate arbitrary old packs.
4. Pack-provided filters/advanced metadata semantics and complex overlay configurations are not fully supported. The exported resource pack has a fresh 26.3 `pack.mcmeta`, and other pack metadata sections are not automatically merged. Matching 26.3 overlays are flattened, not retained as overlays. Inspect the exported result if your packs use unusual `pack.mcmeta` metadata.
5. Binary identity is preserved for unchanged **uncompressed entries' contents**, but ZIP container bytes/compression are regenerated.
6. Chromium-based browsers recommended. Large archives can use significant device memory; import size limits are enforced.
7. No cloud sync or undo stack beyond the pixel editor's recent strokes. Saving an `.rps` project is recommended before large edits.

## Deployment

Create a **public GitHub repository** (suggested name: `resource-pack-studio`) and upload all files and folders from this project to the **repository root**, including `.nojekyll`, `frost.css`, `theme.js`, `styles.css`, `app.js`, `index.html` and `vendor/`. Do not upload only a ZIP. On GitHub open **Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/(root)` → Save**. The site will be served at `https://YOUR_USERNAME.github.io/resource-pack-studio/`. No npm install, backend, build step or secret key is necessary.

This archive does not itself publish the site; repository creation and enabling Pages require GitHub access and repository settings permissions.

## Reference

Minecraft Java 26.3 official technical release notes: https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3

JSZip (`vendor/jszip.min.js`): https://stuk.github.io/jszip/ — MIT / GPLv3 dual license. License: `vendor/JSZIP_LICENSE.txt`.


This version is fully self-contained: upload index.html to your GitHub repository root. Do not nest it in a folder.
