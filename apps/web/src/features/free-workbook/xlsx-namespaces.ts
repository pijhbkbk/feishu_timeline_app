import { XMLValidator } from 'fast-xml-parser';
import { strToU8 } from 'fflate';
import { CATALOG_XLSX_LIMITS } from '../color-register/sheet-exchange';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XML = 'http://www.w3.org/XML/1998/namespace';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REVISION = 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision';
const CALC_FEATURES = 'http://schemas.microsoft.com/office/spreadsheetml/2018/calcfeatures';
// ExcelJS emits these ignorable style extensions itself. They remain qualified
// and byte-preserved, only inside extLst; they are never treated as main data.
const STYLE_EXTENSIONS = new Set([
  'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main',
  'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main',
  'http://schemas.microsoft.com/office/spreadsheetml/2015/02/main',
]);
const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/;
const invalid = () => new Error('XLSX XML 命名空间或结构不受支持；源文件未修改。');
const limited = () => new Error('XLSX XML 结构或正规化后大小超限；源文件未修改。');
type Attribute = { name: string; value: string };
type Metadata = 'revisionPtr' | 'calcFeatures' | 'feature';
type Frame = { name: string; outputName: string; namespaces: Map<string, string>; uri: string; local: string; extension: boolean; metadata: Metadata | undefined };

// Native Excel adds runtime revision and calculation-version metadata. Keep
// its qualified bytes; never reinterpret it as SpreadsheetML business data.
// These URIs are deliberately not added to the general style extension set.
function metadataKind(uri: string | undefined, local: string, stack: Frame[]): Metadata | undefined {
  const parent = stack.at(-1);
  if (uri === REVISION && local === 'revisionPtr' && stack.length === 1 && parent?.uri === MAIN && parent.local === 'workbook') return 'revisionPtr';
  if (uri !== CALC_FEATURES) return undefined;
  if (local === 'feature' && parent?.metadata === 'calcFeatures') return 'feature';
  if (local === 'calcFeatures' && stack.length === 3 && stack[0]?.uri === MAIN && stack[0].local === 'workbook'
    && stack[1]?.uri === MAIN && stack[1].local === 'extLst' && parent?.uri === MAIN && parent.local === 'ext') return 'calcFeatures';
  return undefined;
}

// Decode only namespace identifiers. All source text and attribute value bytes
// remain untouched in the emitted XML; no entity resolver or external I/O exists.
function namespaceValue(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-fA-F]+));)/.test(value)) throw invalid();
  return value.replace(/&([^;]*);/g, (_match, entity: string) => {
    const predefined: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, entity)) return predefined[entity]!;
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) throw invalid();
    const number = Number.parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10);
    if (!Number.isSafeInteger(number) || number < 1 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) throw invalid();
    return String.fromCodePoint(number);
  });
}

function opening(tag: string): { name: string; attributes: Attribute[]; selfClosing: boolean } {
  const name = NAME.exec(tag.slice(1))?.[0];
  if (!name) throw invalid();
  let position = name.length + 1;
  const attributes: Attribute[] = [];
  while (position < tag.length) {
    const whitespace = /^\s*/.exec(tag.slice(position))![0];
    position += whitespace.length;
    if (tag.slice(position) === '>' || tag.slice(position) === '/>') break;
    if (!whitespace) throw invalid();
    const attribute = NAME.exec(tag.slice(position))?.[0];
    if (!attribute) throw invalid();
    position += attribute.length;
    const equals = /^\s*=\s*(["'])/.exec(tag.slice(position));
    if (!equals) throw invalid();
    position += equals[0].length;
    const end = tag.indexOf(equals[1]!, position);
    if (end < 0) throw invalid();
    const value = tag.slice(position, end);
    if (value.includes('<')) throw invalid();
    attributes.push({ name: attribute, value });
    if (attributes.length > 256) throw limited();
    position = end + 1;
  }
  return { name, attributes, selfClosing: tag.endsWith('/>') };
}

/** ExcelJS 4.4 matches literal element names rather than namespace/localName.
 * Rewrite only validated SpreadsheetML element names, preserving source XML
 * text, attributes, comments and CDATA verbatim. Other XML/media parts never
 * enter this function. Unknown elements are explicitly rejected, not stripped;
 * supported style extensions and narrowly scoped native Excel runtime
 * metadata keep their qualified names.
 */
function normalizePart(bytes: Uint8Array, rootName: string): Uint8Array {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) throw invalid();
  const stack: Frame[] = [];
  const chunks: string[] = [];
  let position = 0, tokens = 0, roots = 0, outputBytes = 0, changed = false;
  const append = (text: string) => {
    outputBytes += strToU8(text).byteLength;
    if (outputBytes > CATALOG_XLSX_LIMITS.expandedBytes) throw limited();
    chunks.push(text);
  };
  const appendText = (text: string) => {
    if (stack.at(-1)?.metadata && /\S/.test(text)) throw invalid();
    append(text);
  };
  while (position < source.length) {
    const start = source.indexOf('<', position);
    if (start < 0) { appendText(source.slice(position)); break; }
    appendText(source.slice(position, start));
    if (++tokens > 1_000_000) throw limited();
    let end: number;
    if (source.startsWith('<!--', start) || source.startsWith('<![CDATA[', start) || source.startsWith('<?', start)) {
      const marker = source.startsWith('<!--', start) ? '-->' : source.startsWith('<![CDATA[', start) ? ']]>' : '?>';
      end = source.indexOf(marker, start + 2);
      if (end < 0) throw invalid();
      if (stack.at(-1)?.metadata && marker === ']]>' && /\S/.test(source.slice(start + 9, end))) throw invalid();
      end += marker.length;
      append(source.slice(start, end));
      position = end;
      continue;
    }
    if (source.startsWith('<!', start)) throw invalid();
    let quote = '';
    for (end = start + 1; end < source.length; end++) {
      const char = source[end]!;
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= source.length) throw invalid();
    end++;
    const tag = source.slice(start, end);
    if (tag.startsWith('</')) {
      const name = /^<\/([^\s>]+)\s*>$/.exec(tag)?.[1], frame = stack.pop();
      if (!frame || name !== frame.name) throw invalid();
      append(tag.replace(`</${frame.name}`, `</${frame.outputName}`));
    } else {
      const node = opening(tag);
      const namespaces = new Map(stack.at(-1)?.namespaces ?? [['xml', XML]]);
      for (const attribute of node.attributes) {
        if (attribute.name !== 'xmlns' && !attribute.name.startsWith('xmlns:')) continue;
        const prefix = attribute.name === 'xmlns' ? '' : attribute.name.slice(6), uri = namespaceValue(attribute.value);
        if (prefix === 'xmlns' || uri === XMLNS || (prefix === 'xml') !== (uri === XML) || (prefix && !uri)) throw invalid();
        namespaces.set(prefix, uri);
      }
      if (namespaces.size > 64 || stack.length >= 128) throw limited();
      const [prefix, local] = node.name.includes(':') ? node.name.split(':') as [string, string] : ['', node.name];
      const uri = namespaces.get(prefix), main = uri === MAIN;
      const metadata = metadataKind(uri, local, stack), parentMetadata = stack.at(-1)?.metadata;
      if (parentMetadata && !(parentMetadata === 'calcFeatures' && metadata === 'feature')) throw invalid();
      if ((!main && !metadata && !(prefix && uri && STYLE_EXTENSIONS.has(uri) && stack.at(-1)?.extension)) || (namespaces.has('') && namespaces.get('') !== MAIN)) throw invalid();
      const expandedAttributes = new Set<string>();
      const attributeLocals = new Set<string>();
      for (const attribute of node.attributes) {
        if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) continue;
        const [attributePrefix, attributeLocal] = attribute.name.includes(':') ? attribute.name.split(':') as [string, string] : ['', attribute.name];
        const uri = attributePrefix ? namespaces.get(attributePrefix) : '';
        // ExcelJS reads relationship attributes by the literal r: prefix. Do
        // not report a successful import while silently losing another alias.
        if (uri === undefined || (attributePrefix === 'r' && uri !== REL) || (uri === REL && attributePrefix !== 'r')) throw invalid();
        const key = `${uri}|${attributeLocal}`;
        // The bounded preflight parser reads local attribute names, whereas
        // ExcelJS reads their original spelling. Ambiguous locals must not let
        // a namespaced value hide an oversized unqualified allocation index.
        if (expandedAttributes.has(key) || attributeLocals.has(attributeLocal)) throw invalid();
        expandedAttributes.add(key);
        attributeLocals.add(attributeLocal);
      }
      const isRoot = stack.length === 0;
      if (isRoot && (++roots !== 1 || !main || local !== rootName)) throw invalid();
      // Root insertion is sufficient: all descendant element namespaces have
      // been checked, and a foreign/empty default rebind fails closed above.
      const defaultDeclaration = isRoot && !namespaces.has('') ? ` xmlns="${MAIN}"` : '';
      const outputName = main ? local : node.name;
      changed ||= node.name !== outputName || Boolean(defaultDeclaration);
      append(`<${outputName}${defaultDeclaration}${tag.slice(node.name.length + 1)}`);
      if (!node.selfClosing) stack.push({ name: node.name, outputName, namespaces, uri: uri!, local, metadata, extension: Boolean(stack.at(-1)?.extension) || (main && local === 'extLst') });
    }
    position = end;
  }
  if (stack.length || roots !== 1) throw invalid();
  return changed ? strToU8(chunks.join('')) : bytes;
}

/** Called only after inspectCatalogArchive has validated ZIP/CRC/allocation. */
export function normalizeSpreadsheetNamespaces(files: Readonly<Record<string, Uint8Array>>): Record<string, Uint8Array> {
  const entries = Object.entries(files);
  if (entries.length > CATALOG_XLSX_LIMITS.zipEntries || entries.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0) > CATALOG_XLSX_LIMITS.expandedBytes) throw limited();
  const result: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  let total = 0;
  for (const [path, bytes] of entries) {
    const root = path === 'xl/workbook.xml' ? 'workbook' : path === 'xl/styles.xml' ? 'styleSheet' : path === 'xl/sharedStrings.xml' ? 'sst' : /^xl\/worksheets\/[^/]+\.xml$/.test(path) ? 'worksheet' : null;
    const output = root ? normalizePart(bytes, root) : bytes;
    if ((total += output.byteLength) > CATALOG_XLSX_LIMITS.expandedBytes) throw limited();
    result[path] = output;
  }
  return result;
}
