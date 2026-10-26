import { readFile } from 'node:fs/promises';
import { MalformedArtifactError } from './errors.js';
import { parseJunitArtifact } from './junit.js';
import { parseMetadataJson } from './metadata.js';
export { MalformedArtifactError } from './errors.js';
export { parseJunitArtifact } from './junit.js';
export { parseMetadata, parseMetadataJson } from './metadata.js';
export * from './types.js';
async function readTextFile(path) {
    try {
        return await readFile(path, 'utf8');
    }
    catch {
        throw new MalformedArtifactError('ARTIFACT_MISSING', `cannot read artifact file ${path}`, path);
    }
}
export async function parseArtifactFile(xmlPath, metadataPath) {
    const xml = await readTextFile(xmlPath);
    const metadataText = await readTextFile(metadataPath);
    const metadata = parseMetadataJson(metadataText, metadataPath);
    return parseJunitArtifact({ xml, metadata, sourcePath: xmlPath });
}
