import { inflateRawSync } from 'node:zlib';
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
function fail(detail) {
    throw new Error(`invalid zip: ${detail}`);
}
function findEndOfCentralDirectory(buffer) {
    const minimum = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
        if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE)
            return offset;
    }
    fail('end of central directory not found');
}
export function readZip(buffer) {
    if (buffer.length < 22)
        fail('buffer too short');
    const eocd = findEndOfCentralDirectory(buffer);
    const entryCount = buffer.readUInt16LE(eocd + 10);
    const directoryOffset = buffer.readUInt32LE(eocd + 16);
    const entries = [];
    let cursor = directoryOffset;
    for (let index = 0; index < entryCount; index += 1) {
        if (cursor + 46 > buffer.length)
            fail('central directory entry out of bounds');
        if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE)
            fail('bad central directory signature');
        const method = buffer.readUInt16LE(cursor + 10);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const uncompressedSize = buffer.readUInt32LE(cursor + 24);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const localOffset = buffer.readUInt32LE(cursor + 42);
        const nameStart = cursor + 46;
        if (nameStart + nameLength > buffer.length)
            fail('entry name out of bounds');
        const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
        if (localOffset + 30 > buffer.length)
            fail(`local header out of bounds for ${name}`);
        if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE)
            fail(`bad local header for ${name}`);
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.length)
            fail(`entry data out of bounds for ${name}`);
        const compressed = buffer.subarray(dataStart, dataEnd);
        let data;
        if (method === 0) {
            data = Buffer.from(compressed);
        }
        else if (method === 8) {
            data = inflateRawSync(compressed);
        }
        else {
            fail(`unsupported compression method ${method} for ${name}`);
        }
        if (data.length !== uncompressedSize)
            fail(`size mismatch for ${name}`);
        entries.push({ name, data });
        cursor = nameStart + nameLength + extraLength + commentLength;
    }
    return entries;
}
