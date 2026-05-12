# Font licenses

Both font families are distributed under the
[SIL Open Font License v1.1](https://openfontlicense.org/).

## Cormorant Garamond

- Family: Cormorant Garamond
- Files: `cormorant-300.woff2`, `cormorant-300-italic.woff2`
- Source: Catharsis Fonts / Christian Thalmann
- Upstream: https://github.com/CatharsisFonts/Cormorant
- Subsets in our files: Latin, Latin Extended, Cyrillic
- Conversion: fetched as woff2 directly via google-webfonts-helper
  (`gwfh.mranftl.com`), no re-encoding.

## Manrope Variable

- Family: Manrope
- Files: `manrope-vf-{latin,latin-ext,cyrillic,cyrillic-ext}.woff2`
- Source: Mikhail Sharanda (https://manropefont.com/)
- Upstream: https://github.com/sharanda/manrope
- Subsets: split per Google Fonts/Fontsource conventions; browser
  loads only the subsets a given page actually uses via
  `unicode-range` in `@font-face`.
- Conversion: fetched via Fontsource CDN
  (`@fontsource-variable/manrope`), no re-encoding.

---

Full OFL text:
https://openfontlicense.org/documents/OFL.txt
