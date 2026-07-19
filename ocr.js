/* CarBuddy on-device text extraction for photos and PDFs.
   Lazily loads vendored pdf.js + Tesseract.js (nothing is uploaded — all local).
   Exposes window.CARBUDDY_OCR.{ isOcrFile, kindOf, extractText }. */
(function (root) {
  "use strict";

  function abs(rel) { return new URL(rel, document.baseURI).href; }

  var loaded = {};
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (loaded[src]) return resolve();
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { loaded[src] = true; resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  function kindOf(file) {
    var name = (file && file.name ? file.name : "").toLowerCase();
    var type = (file && file.type) || "";
    if (type === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
    if (type.indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif|bmp|tiff?|heic|heif)$/.test(name)) return "image";
    return "text";
  }
  function isOcrFile(file) { var k = kindOf(file); return k === "pdf" || k === "image"; }

  // ---- pdf.js ----
  var pdfReady = null;
  function ensurePdf() {
    if (!pdfReady) {
      pdfReady = loadScript(abs("vendor/pdfjs/pdf.min.js")).then(function () {
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = abs("vendor/pdfjs/pdf.worker.min.js");
      });
    }
    return pdfReady;
  }

  // ---- Tesseract ----
  var tessReady = null;
  function ensureTesseract() {
    if (!tessReady) tessReady = loadScript(abs("vendor/tesseract/tesseract.min.js"));
    return tessReady;
  }

  function ocrImage(imageLike, onProgress) {
    return ensureTesseract().then(function () {
      return root.Tesseract.createWorker("eng", 1, {
        workerPath: abs("vendor/tesseract/worker.min.js"),
        corePath: abs("vendor/tesseract/"),   // directory → picks simd-lstm / lstm by SIMD support
        langPath: abs("vendor/tesseract/lang"),
        workerBlobURL: false,
        logger: function (m) { if (m && m.status && onProgress) onProgress(m.status, m.progress || 0); }
      });
    }).then(function (worker) {
      return worker.recognize(imageLike).then(function (res) {
        return worker.terminate().then(function () { return (res && res.data && res.data.text) || ""; });
      }).catch(function (err) { worker.terminate(); throw err; });
    });
  }

  function extractPdf(file, onProgress) {
    return ensurePdf().then(function () {
      return file.arrayBuffer();
    }).then(function (buf) {
      return root.pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function (pdf) {
      var parts = [];
      var chain = Promise.resolve();
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (n) {
          chain = chain.then(function () { return pdf.getPage(n); })
            .then(function (page) { return page.getTextContent(); })
            .then(function (content) {
              parts.push(content.items.map(function (it) { return it.str; }).join(" "));
              if (onProgress) onProgress("reading pdf", n / pdf.numPages);
            });
        })(i);
      }
      return chain.then(function () {
        var text = parts.join("\n");
        if (text.replace(/\s/g, "").length >= 40) return text;   // real embedded text
        return ocrPdfPages(pdf, onProgress);                     // scanned PDF → rasterize + OCR
      });
    });
  }

  function ocrPdfPages(pdf, onProgress) {
    var out = [];
    var chain = Promise.resolve();
    for (var i = 1; i <= pdf.numPages; i++) {
      (function (n) {
        chain = chain.then(function () { return pdf.getPage(n); }).then(function (page) {
          var viewport = page.getViewport({ scale: 2 });
          var canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          var ctx = canvas.getContext("2d");
          return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            return ocrImage(canvas, function (st, pr) {
              if (onProgress) onProgress("ocr pdf page " + n + "/" + pdf.numPages, pr);
            });
          }).then(function (t) { out.push(t); });
        });
      })(i);
    }
    return chain.then(function () { return out.join("\n"); });
  }

  function extractText(file, onProgress) {
    var k = kindOf(file);
    if (k === "pdf") return extractPdf(file, onProgress);
    if (k === "image") return ocrImage(file, onProgress);
    return file.text();   // plain text file
  }

  root.CARBUDDY_OCR = { isOcrFile: isOcrFile, kindOf: kindOf, extractText: extractText };
})(typeof window !== "undefined" ? window : this);
