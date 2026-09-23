# Fonts for the Open Graph card

These three files exist only so `app/opengraph-image.tsx` can draw text.

Satori, which renders that card, will not read woff2 — and woff2 is all
`next/font` leaves behind. It also cannot fetch anything at build time without
making the build depend on Google Fonts being reachable. So the faces it needs
are committed, in TrueType, and read off disk.

| File | Face | Used for |
| --- | --- | --- |
| `Oswald-Bold.ttf` | Oswald 700 | the ROTA wordmark |
| `Oswald-Medium.ttf` | Oswald 500 | the tagline |
| `IBMPlexMono-Medium.ttf` | IBM Plex Mono 500 | the ARC / USDC / NON-CUSTODIAL strip |

Oswald 700 is the same instance the browser loads through `next/font` in
`app/layout.tsx` — verified by measuring both in a browser and comparing the
advance width, sidebearings and cap height of "ROTA". They agree exactly. If
the weights in `layout.tsx` change, re-check that, because the lockup's
geometry in `lib/mark.ts` is measured from this face and nothing will complain
if it silently stops matching.

## Licence

Both families are licensed under the SIL Open Font License, Version 1.1, whose
full text is in `FONT-LICENSE-OFL.txt`.

- Oswald — Copyright 2016 The Oswald Project Authors
  (https://github.com/googlefonts/OswaldFont)
- IBM Plex Mono — Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"
