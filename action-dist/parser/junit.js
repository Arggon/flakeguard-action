import { MalformedArtifactError } from './errors.js';
import { parseXml } from './xml.js';
const RETRY_ELEMENTS = new Set(['flakyFailure', 'flakyError', 'rerunFailure', 'rerunError']);
const CATEGORY_PATTERNS = [
    ['timeout', /timeout|timed out|time out|deadline exceeded/],
    ['network', /econn|network|socket|eai_again|connection reset|dns|fetch failed/],
    ['ordering', /ordering|order assumption|shared state|previous test|sequence/],
];
function isElement(node) {
    return typeof node !== 'string';
}
function childrenNamed(element, name) {
    return element.children.filter((child) => isElement(child) && child.name === name);
}
function attribute(element, name) {
    return Object.prototype.hasOwnProperty.call(element.attributes, name) ? element.attributes[name] : undefined;
}
function textContent(element) {
    return element.children.filter((child) => typeof child === 'string').join(' ');
}
function collectSuites(element, found = []) {
    for (const child of element.children) {
        if (!isElement(child) || child.name !== 'testsuite')
            continue;
        found.push(child);
        collectSuites(child, found);
    }
    return found;
}
function detectDialect(root) {
    const suites = root.name === 'testsuite' ? [root, ...collectSuites(root)] : collectSuites(root);
    for (const suite of suites) {
        if (attribute(suite, 'name') === 'pytest')
            return 'pytest';
        for (const properties of childrenNamed(suite, 'properties')) {
            const hasPythonVersion = childrenNamed(properties, 'property').some((property) => attribute(property, 'name') === 'python_version');
            if (hasPythonVersion)
                return 'pytest';
        }
    }
    return 'junit';
}
function categorizeFailure(element) {
    const haystack = `${attribute(element, 'message') ?? ''} ${attribute(element, 'type') ?? ''} ${textContent(element)}`.toLowerCase();
    for (const [category, pattern] of CATEGORY_PATTERNS) {
        if (pattern.test(haystack))
            return category;
    }
    return 'unknown';
}
function normalizeTestcase(testcase, suiteName, metadata, sourcePath) {
    const testName = attribute(testcase, 'name');
    if (testName === undefined || testName.trim() === '') {
        throw new MalformedArtifactError('XML_INVALID', 'testcase is missing the required name attribute', sourcePath);
    }
    const classname = attribute(testcase, 'classname');
    const suite = classname !== undefined && classname.trim() !== '' ? classname : suiteName;
    if (suite.trim() === '') {
        throw new MalformedArtifactError('XML_INVALID', `cannot determine a suite for testcase "${testName}"`, sourcePath);
    }
    const errors = childrenNamed(testcase, 'error');
    const failures = childrenNamed(testcase, 'failure');
    const skipped = childrenNamed(testcase, 'skipped');
    let status = 'passed';
    let categorized;
    if (errors.length > 0) {
        status = 'error';
        categorized = errors[0];
    }
    else if (failures.length > 0) {
        status = 'failed';
        categorized = failures[0];
    }
    else if (skipped.length > 0) {
        status = 'skipped';
    }
    let retryCount = 0;
    for (const child of testcase.children) {
        if (isElement(child) && RETRY_ELEMENTS.has(child.name))
            retryCount += 1;
    }
    const retriesAttribute = attribute(testcase, 'retries');
    if (retriesAttribute !== undefined) {
        const parsed = Number.parseInt(retriesAttribute, 10);
        if (Number.isInteger(parsed) && parsed > 0)
            retryCount += parsed;
    }
    const time = attribute(testcase, 'time');
    let durationMs = null;
    if (time !== undefined && time.trim() !== '') {
        const seconds = Number(time);
        if (Number.isFinite(seconds) && seconds >= 0)
            durationMs = Math.round(seconds * 1000);
    }
    return {
        repository: metadata.repository,
        commitSha: metadata.commitSha,
        ...(metadata.runId !== undefined ? { runId: metadata.runId } : {}),
        ...(metadata.runAttempt !== undefined ? { runAttempt: metadata.runAttempt } : {}),
        suite,
        testName,
        testId: `${suite}::${testName}`,
        status,
        durationMs,
        retryCount,
        failureCategory: categorized !== undefined ? categorizeFailure(categorized) : null,
    };
}
export function parseJunitArtifact(input) {
    let root;
    try {
        root = parseXml(input.xml);
    }
    catch (error) {
        if (error instanceof MalformedArtifactError && error.sourcePath === undefined) {
            throw new MalformedArtifactError(error.code, error.detail, input.sourcePath);
        }
        throw error;
    }
    if (root.name !== 'testsuite' && root.name !== 'testsuites') {
        throw new MalformedArtifactError('ROOT_UNSUPPORTED', `unsupported root element <${root.name}>; expected <testsuite> or <testsuites>`, input.sourcePath);
    }
    const suites = root.name === 'testsuite' ? [root, ...collectSuites(root)] : collectSuites(root);
    const outcomes = [];
    for (const suite of suites) {
        const suiteName = attribute(suite, 'name') ?? '';
        for (const testcase of childrenNamed(suite, 'testcase')) {
            outcomes.push(normalizeTestcase(testcase, suiteName, input.metadata, input.sourcePath));
        }
    }
    if (outcomes.length === 0) {
        throw new MalformedArtifactError('NO_TESTCASES', 'artifact contains no <testcase> elements; refusing to report an empty success', input.sourcePath);
    }
    return {
        metadata: input.metadata,
        dialect: detectDialect(root),
        outcomes,
    };
}
