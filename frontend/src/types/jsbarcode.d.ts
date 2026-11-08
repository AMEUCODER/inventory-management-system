declare module "jsbarcode" {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    margin?: number;
    background?: string;
    lineColor?: string;
    fontSize?: number;
  }
  function JsBarcode(
    element: SVGElement | HTMLCanvasElement | HTMLImageElement | string,
    text: string,
    options?: JsBarcodeOptions,
  ): void;
  export default JsBarcode;
}
