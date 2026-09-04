/**
 * PDF text extraction using pdfjs-dist directly.
 *
 * Uses Mozilla's pdf.js library in Node.js mode without worker threads
 * or canvas dependencies, making it safe for serverless environments
 * like Vercel where native addons (@napi-rs/canvas) may not load.
 *
 * Only text extraction is performed — no image rendering or screenshots,
 * which would require canvas support.
 *
 * IMPORTANT: DOMMatrix must be polyfilled before pdfjs-dist is loaded,
 * because the library instantiates it at module evaluation time.
 */

/**
 * Minimal DOMMatrix polyfill for server-side PDF text extraction.
 *
 * pdfjs-dist instantiates DOMMatrix at module load time (for canvas rendering),
 * but we only use text extraction which never actually calls matrix operations.
 * This stub satisfies the constructor check without requiring @napi-rs/canvas.
 */
function ensureDomMatrixPolyfill(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") {
    return;
  }

  // Minimal stub that satisfies `new DOMMatrix()` and basic method chaining.
  // Text extraction never invokes matrix math — this only prevents the
  // ReferenceError at module load time.
  class DOMMatrixStub {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(_init?: number[] | string) {
      // Accept array or CSS transform string, ignore for stub purposes
    }

    // Chainable methods — return `this` since text extraction never reads values
    multiplySelf(): this {
      return this;
    }
    translateSelf(): this {
      return this;
    }
    scaleSelf(): this {
      return this;
    }
    rotateSelf(): this {
      return this;
    }
    invertSelf(): this {
      return this;
    }
    preMultiplySelf(): this {
      return this;
    }

    // Non-mutating copies
    multiply(): DOMMatrixStub {
      return new DOMMatrixStub();
    }
    translate(): DOMMatrixStub {
      return new DOMMatrixStub();
    }
    scale(): DOMMatrixStub {
      return new DOMMatrixStub();
    }
    rotate(): DOMMatrixStub {
      return new DOMMatrixStub();
    }
    inverse(): DOMMatrixStub {
      return new DOMMatrixStub();
    }
    flipX(): DOMMatrixStub {
      return new DOMMatrixStub();
    }
    flipY(): DOMMatrixStub {
      return new DOMMatrixStub();
    }

    toFloat32Array(): Float32Array {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    toFloat64Array(): Float64Array {
      return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    toString(): string {
      return "matrix(1, 0, 0, 1, 0, 0)";
    }
  }

  // Install globally so pdfjs-dist can find it
  (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixStub;
}

// Polyfill must be installed synchronously before any dynamic import
ensureDomMatrixPolyfill();

// Dynamic import — ensures polyfill runs first, and keeps pdfjs-dist
// out of the static import graph so Next.js doesn't try to bundle it.
interface PdfJsModule {
  getDocument: typeof import("pdfjs-dist").getDocument;
  GlobalWorkerOptions: typeof import("pdfjs-dist").GlobalWorkerOptions;
  VerbosityLevel: typeof import("pdfjs-dist").VerbosityLevel;
}

interface PdfWorkerModule {
  WorkerMessageHandler: unknown;
}

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // Import the worker module first and install it globally.
      // pdfjs-dist checks globalThis.pdfjsWorker for a pre-loaded worker
      // before attempting to dynamically import workerSrc.
      const worker = (await import(
        "pdfjs-dist/build/pdf.worker.mjs"
      )) as PdfWorkerModule;
      (globalThis as Record<string, unknown>).pdfjsWorker = worker;

      // Now import the main pdfjs-dist module
      const mod = (await import("pdfjs-dist")) as PdfJsModule;

      // Disable the worker thread — we're using the "fake worker" (main thread)
      // via the pre-loaded worker module above.
      mod.GlobalWorkerOptions.workerSrc = "";

      return mod;
    })();
  }
  return pdfjsPromise;
}

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
}

/**
 * Extract text content from a PDF buffer.
 *
 * Uses pdfjs-dist directly with:
 * - Pre-loaded worker module (no dynamic worker spawning)
 * - No canvas (text extraction only)
 * - Disabled font face injection (server-safe)
 * - DOMMatrix polyfill for module load compatibility
 *
 * @param buffer - The PDF file content as a Buffer.
 * @returns The extracted text and page count.
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<PdfExtractionResult> {
  const { getDocument, VerbosityLevel } = await loadPdfJs();

  // Convert Buffer to Uint8Array for pdfjs-dist
  const data = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  const loadingTask = getDocument({
    data,
    // Disable features that require browser APIs or native modules
    disableFontFace: true,
    disableAutoFetch: true,
    // Use minimal verbosity for production
    verbosity: VerbosityLevel.ERRORS,
    // Disable eval-based optimizations (not allowed in strict CSP environments)
    isEvalSupported: false,
  });

  try {
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const textParts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      // Join text items within a page, preserving structure
      const pageText = textContent.items
        .map((item) => {
          if ("str" in item) {
            return item.str;
          }
          return "";
        })
        .join(" ");

      textParts.push(pageText);
      page.cleanup();
    }

    // Join pages with double newline to preserve section boundaries
    const text = textParts.join("\n\n");

    return {
      text,
      pageCount,
    };
  } finally {
    loadingTask.destroy();
  }
}
