/**
 * Type declarations for pdfjs-dist worker module.
 *
 * The worker module is loaded dynamically for server-side PDF processing
 * but doesn't ship with TypeScript declarations.
 */
declare module "pdfjs-dist/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: {
    setup(handler: unknown, port: unknown): void;
  };
}
