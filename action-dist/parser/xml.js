import { MalformedArtifactError } from './errors.js';
const START_TAG = /^<([A-Za-z_][A-Za-z0-9_.:-]*)((?:\s+[A-Za-z_][A-Za-z0-9_.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/;
const END_TAG = /^<\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>/;
const ATTRIBUTE = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
export function parseXml(source) {
    let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    const length = source.length;
    const roots = [];
    const stack = [];
    let text = '';
    const fail = (message) => {
        throw new MalformedArtifactError('XML_INVALID', `${message} at offset ${index}`);
    };
    const decodeEntities = (value) => value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (match, entity) => {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
            const code = Number.parseInt(entity.slice(2), 16);
            if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
                fail(`invalid character reference ${match}`);
            }
            return String.fromCodePoint(code);
        }
        if (entity.startsWith('#')) {
            const code = Number.parseInt(entity.slice(1), 10);
            if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
                fail(`invalid character reference ${match}`);
            }
            return String.fromCodePoint(code);
        }
        switch (entity) {
            case 'lt':
                return '<';
            case 'gt':
                return '>';
            case 'amp':
                return '&';
            case 'quot':
                return '"';
            case 'apos':
                return "'";
            default:
                return fail(`unknown entity ${match}`);
        }
    });
    const appendText = (value) => {
        const parent = stack[stack.length - 1];
        if (parent) {
            parent.children.push(value);
        }
        else if (value.trim() !== '') {
            fail('text content outside the root element');
        }
    };
    const flushText = () => {
        if (text.length === 0)
            return;
        appendText(decodeEntities(text));
        text = '';
    };
    while (index < length) {
        const open = source.indexOf('<', index);
        if (open === -1) {
            text += source.slice(index);
            index = length;
            break;
        }
        if (open > index) {
            text += source.slice(index, open);
        }
        index = open;
        if (source.startsWith('<!--', index)) {
            const end = source.indexOf('-->', index + 4);
            if (end === -1)
                fail('unterminated comment');
            index = end + 3;
            continue;
        }
        if (source.startsWith('<![CDATA[', index)) {
            const end = source.indexOf(']]>', index + 9);
            if (end === -1)
                fail('unterminated CDATA section');
            flushText();
            appendText(source.slice(index + 9, end));
            index = end + 3;
            continue;
        }
        if (source.startsWith('<?', index)) {
            const end = source.indexOf('?>', index + 2);
            if (end === -1)
                fail('unterminated processing instruction');
            index = end + 2;
            continue;
        }
        if (source.startsWith('<!', index)) {
            const end = source.indexOf('>', index + 2);
            if (end === -1)
                fail('unterminated declaration');
            index = end + 1;
            continue;
        }
        if (source.startsWith('</', index)) {
            const match = END_TAG.exec(source.slice(index));
            if (!match)
                fail('malformed closing tag');
            flushText();
            const name = match[1];
            const current = stack.pop();
            if (!current)
                fail(`unexpected closing tag </${name}>`);
            if (current.name !== name)
                fail(`mismatched closing tag </${name}>, expected </${current.name}>`);
            index += match[0].length;
            continue;
        }
        const match = START_TAG.exec(source.slice(index));
        if (!match)
            fail('malformed start tag');
        flushText();
        const name = match[1];
        const rawAttributes = match[2] ?? '';
        const selfClosing = match[3] === '/';
        const attributes = {};
        ATTRIBUTE.lastIndex = 0;
        let attributeMatch;
        while ((attributeMatch = ATTRIBUTE.exec(rawAttributes)) !== null) {
            const attributeName = attributeMatch[1];
            if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
                fail(`duplicate attribute "${attributeName}"`);
            }
            const rawValue = attributeMatch[2] !== undefined ? attributeMatch[2] : attributeMatch[3];
            attributes[attributeName] = decodeEntities(rawValue);
        }
        const element = { name, attributes, children: [] };
        const parent = stack[stack.length - 1];
        if (parent) {
            parent.children.push(element);
        }
        else {
            if (roots.length > 0)
                fail('multiple root elements');
            roots.push(element);
        }
        if (!selfClosing)
            stack.push(element);
        index += match[0].length;
    }
    flushText();
    if (stack.length > 0)
        fail(`unclosed tag <${stack[stack.length - 1].name}>`);
    if (roots.length === 0)
        fail('no root element');
    return roots[0];
}
