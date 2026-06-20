import { initWasm, Resvg, InitInput } from '@resvg/resvg-wasm';

let initialized = false;

export async function svgToPng(svg: string, width: number, height: number, wasmInput?: InitInput): Promise<Uint8Array> {
	if (!initialized) {
		if (!wasmInput) {
			throw new Error('WASM input must be provided for the first initialization');
		}
		await initWasm(wasmInput);
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
