/// <reference types="vite/client" />

declare module "mammoth/mammoth.browser.js" {
  interface Mammoth {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  }
  const mammoth: Mammoth & { default?: Mammoth };
  export default mammoth;
  export const convertToHtml: Mammoth["convertToHtml"];
}
