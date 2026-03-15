import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sizes = [192, 512];
const outDir = path.join(__dirname, 'public');

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < crcData.length; i++) {
        crc ^= crcData[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([length, typeBuffer, data, crcBuf]);
}

function createPNG(size) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);
    ihdrData.writeUInt32BE(size, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 2;
    const ihdr = createChunk('IHDR', ihdrData);

    const rawData = [];
    for (let y = 0; y < size; y++) {
        rawData.push(0);
        for (let x = 0; x < size; x++) {
            const t = (x + y) / (2 * size);
            const r = Math.round(0x63 * (1 - t) + 0x06 * t);
            const g = Math.round(0x66 * (1 - t) + 0xb6 * t);
            const b = Math.round(0xf1 * (1 - t) + 0xd4 * t);

            // Round corners
            const margin = size * 0.1875;
            const inCorner = (x < margin && y < margin) || (x >= size - margin && y < margin) ||
                             (x < margin && y >= size - margin) || (x >= size - margin && y >= size - margin);
            if (inCorner) {
                const cx2 = x < margin ? margin : size - margin;
                const cy2 = y < margin ? margin : size - margin;
                const dist = Math.sqrt((x - cx2) ** 2 + (y - cy2) ** 2);
                if (dist > margin) {
                    rawData.push(15, 23, 42); // bg color #0f172a
                    continue;
                }
            }
            rawData.push(r, g, b);
        }
    }

    const compressed = zlib.deflateSync(Buffer.from(rawData));
    const idat = createChunk('IDAT', compressed);
    const iend = createChunk('IEND', Buffer.alloc(0));
    return Buffer.concat([sig, ihdr, idat, iend]);
}

sizes.forEach(s => {
    const png = createPNG(s);
    const filePath = path.join(outDir, `pwa-${s}x${s}.png`);
    fs.writeFileSync(filePath, png);
    console.log(`Created pwa-${s}x${s}.png (${png.length} bytes)`);
});
