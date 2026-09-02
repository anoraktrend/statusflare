// Minimal ObjectId utility — works without mongodb driver for tests and as fallback.
// In production, prefers real mongodb ObjectId if available; otherwise uses this implementation.

function randomHex(len: number): string {
	const bytes = new Uint8Array(len / 2);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class SimpleObjectId {
	readonly id: string;
	constructor(hex?: string) {
		if (hex) {
			if (!/^[a-fA-F0-9]{24}$/.test(hex)) throw new Error(`Invalid ObjectId hex: ${hex}`);
			this.id = hex.toLowerCase();
		} else {
			// Generate 12 random bytes hex = 24 chars
			this.id = randomHex(24);
		}
	}
	toHexString(): string {
		return this.id;
	}
	toString(): string {
		return this.id;
	}
	toJSON(): string {
		return this.id;
	}
	equals(other: unknown): boolean {
		if (other instanceof SimpleObjectId) return this.id === other.id;
		if (typeof other === 'string') return this.id === other.toLowerCase();
		if (other && typeof (other as { toHexString?: () => string }).toHexString === 'function') {
			try {
				return this.id === (other as { toHexString: () => string }).toHexString().toLowerCase();
			} catch {
				return false;
			}
		}
		return false;
	}
	static isValid(id: string): boolean {
		return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
	}
}

// Re-export as ObjectId for compatibility. Try to use real mongodb ObjectId if available at runtime,
// but default to SimpleObjectId to avoid bundling node:process in tests.
export const ObjectId = SimpleObjectId;

// Helpers that work with both real and simple ObjectIds
export function isValidObjectIdHex(id: string): boolean {
	return SimpleObjectId.isValid(id);
}

export function toObjectId(id: string): SimpleObjectId | null {
	if (SimpleObjectId.isValid(id)) {
		try {
			return new SimpleObjectId(id);
		} catch {
			return null;
		}
	}
	return null;
}

export function looksLikeObjectId(value: unknown): boolean {
	return value instanceof SimpleObjectId || (!!value && typeof (value as { toHexString?: () => string }).toHexString === 'function');
}
