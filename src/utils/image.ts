import { initWasm, Resvg } from '@resvg/resvg-wasm';

let initialized = false;

export async function svgToPng(svg: string, width: number, height: number, wasmBuffer?: ArrayBuffer): Promise<Uint8Array> {
  if (!initialized) {
    if (!wasmBuffer) {
      throw new Error('WASM buffer must be provided for the first initialization');
    }
    await initWasm(wasmBuffer);
    initialized = true;
  }

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return pngBuffer;
}
