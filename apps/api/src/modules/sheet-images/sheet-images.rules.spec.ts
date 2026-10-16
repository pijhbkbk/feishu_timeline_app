import { describe, expect, it } from 'vitest';
import { imageIdentifier, parseLayout, parseUpload } from './sheet-images.rules';

const base = { fieldKey: 'photos', mode: 'CELL', offsetX: 0, offsetY: 0, width: 120, height: 80 };
describe('sheet image stable metadata', () => {
  it('parses the bounded four multipart fields without using row/column positions as identity', () => {
    expect(parseUpload({ operationId: 'image-1', targetType: 'SHEET_PERSON', recordId: 'person-a', layout: JSON.stringify(base) })).toMatchObject({ recordId: 'person-a', layout: base });
  });
  it.each(['rowIndex', 'columnIndex', 'url', 'attachmentId', 'projectId', 'isDeleted'])('rejects mutable identity/persistence field %s', field => {
    expect(() => parseUpload({ operationId: 'image-1', targetType: 'SHEET_PERSON', recordId: 'person-a', layout: base, [field]: 'unsafe' })).toThrow();
  });
  it.each([0, -1, 4097, Number.POSITIVE_INFINITY, '20'])('rejects invalid dimensions %j', width => {
    expect(() => parseLayout({ operationId: 'change-1', expectedRevision: 1, layout: { ...base, width } })).toThrow();
  });
  it('makes original resource identity read-only on layout updates', () => {
    expect(() => parseLayout({ operationId: 'change-1', expectedRevision: 1, recordId: 'another-record', layout: base })).toThrow();
    expect(() => parseLayout({ operationId: 'change-1', expectedRevision: 1, layout: { ...base, recordId: 'another-record' } })).toThrow();
    expect(() => imageIdentifier('not-a-uuid')).toThrow();
  });
  it('allows signed floating offsets while preserving the record/photos anchor', () => {
    expect(parseLayout({ operationId: 'move-up-left', expectedRevision: 1, layout: { ...base, mode: 'FLOATING', offsetX: -300, offsetY: -80 } })).toMatchObject({ layout: { fieldKey: 'photos', offsetX: -300, offsetY: -80 } });
    expect(() => parseLayout({ operationId: 'too-far', expectedRevision: 1, layout: { ...base, offsetX: -4097 } })).toThrow();
  });
});
