# Vendored libraries

These files are bundled so CarBuddy's photo/PDF quote import runs **entirely in your
browser** — nothing is uploaded. They are loaded lazily, only when you import an image
or PDF, so they never affect the initial page load. Each is unmodified from its npm release.

| Path | Library | Version | License |
|------|---------|---------|---------|
| `pdfjs/pdf.min.js`, `pdfjs/pdf.worker.min.js` | [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 3.11.174 | Apache-2.0 |
| `tesseract/tesseract.min.js`, `tesseract/worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) | 5.1.1 | Apache-2.0 |
| `tesseract/tesseract-core-*-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 5.1.1 | Apache-2.0 |
| `tesseract/lang/eng.traineddata.gz` | [tessdata_best (eng)](https://github.com/tesseract-ocr/tessdata_best) via `@tesseract.js-data/eng` | 4.0.0 | Apache-2.0 |

To update: `npm pack <pkg>@<version>` and copy the same files here (see the build notes
in DECISIONS.md, D9).
