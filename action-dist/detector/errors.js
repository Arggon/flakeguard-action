export class DetectionError extends Error {
    code;
    detail;
    constructor(code, detail) {
        super(`${code}: ${detail}`);
        this.name = 'DetectionError';
        this.code = code;
        this.detail = detail;
    }
}
