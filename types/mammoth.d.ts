declare module "mammoth" {
  interface RawTextResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  interface Options {
    buffer: Buffer;
    path?: string;
  }

  function extractRawText(options: Options): Promise<RawTextResult>;
  function convertToHtml(options: Options): Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
}
