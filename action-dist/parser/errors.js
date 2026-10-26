export class MalformedArtifactError extends Error {
    code;
    detail;
    sourcePath;
    constructor(code, detail, sourcePath) {
        super(`${code}: ${detail}`);
        this.name = 'MalformedArtifactError';
        this.code = code;
        this.detail = detail;
        this.sourcePath = sourcePath;
    }
}
