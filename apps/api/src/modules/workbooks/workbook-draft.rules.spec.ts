import { describe, expect, it } from 'vitest';
import { draftExpectation } from './workbook.rules';
const id='10000000-0000-4000-8000-000000000001';
describe('explicit draft slot identity and version',()=>{
  it('allows null/zero only for a new slot and UUID/positive version for an existing slot',()=>{
    expect(draftExpectation({expectedDraftId:null,expectedDraftRevision:0},true)).toEqual({id:null,revision:0});
    expect(draftExpectation({expectedDraftId:id,expectedDraftRevision:1})).toEqual({id,revision:1});
  });
  it('refuses missing, mismatched, noninteger and overflowing expectations',()=>{
    for(const input of [{},{expectedDraftId:null,expectedDraftRevision:1},{expectedDraftId:id,expectedDraftRevision:0},{expectedDraftId:id,expectedDraftRevision:-1},{expectedDraftId:id,expectedDraftRevision:0.5},{expectedDraftId:id,expectedDraftRevision:2147483647},{expectedDraftId:'not-a-uuid',expectedDraftRevision:1}])expect(()=>draftExpectation(input,true)).toThrow();
    expect(()=>draftExpectation({expectedDraftId:null,expectedDraftRevision:0})).toThrow();
  });
});
