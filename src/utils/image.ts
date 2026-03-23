import { initWasm, Resvg } from '@resvg/resvg-wasm';
// @ts-ignore
import wasm from '../node_modules/@resvg/resvg-wasm/index_bg.wasm';

let initialized = false;

export async function svgToPng(svg: string, width: number, height: number): Promise<Uint8Array> {
  if (!initialized) {
    await initWasm(wasm);
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
