/**
 * pdfjs-dist ships this build output without a type declaration for the
 * worker subpath. lib/document-processing/pdf.ts imports it directly (and
 * immediately casts the result to a local interface) to install a
 * same-thread "fake worker" — see the comment there for why. This ambient
 * declaration only satisfies the compiler; the cast at the call site
 * defines the actual shape used.
 */
declare module "pdfjs-dist/build/pdf.worker.mjs";
