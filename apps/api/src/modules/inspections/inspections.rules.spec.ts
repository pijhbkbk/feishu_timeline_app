import { describe, expect, it } from 'vitest';
import { activityDate, conclusion, instrumentNumber, parseInspectionBatch, readingValues, recordRef } from './inspections.rules';
const occurrence={entity:'occurrence',kind:'create',clientId:'vehicle-one',objectId:'object-one',colorId:'color-base-a',values:{overallConclusion:'PENDING',visualConclusion:null,handlingOpinion:null,note:null}};
const measurement={entity:'measurement',kind:'create',clientId:'measurement-one',occurrence:{clientId:'vehicle-one'},values:{pointLabel:'驾驶室',groupLabel:'初测',standardVersionId:null,instrumentLabel:null,methodLabel:null,originalCriteria:null,conclusion:'PASS'}};
const reading={entity:'reading',kind:'create',clientId:'reading-one',measurement:{clientId:'measurement-one'},values:{angleLabel:'15°',lValue:'80.500',aValue:null,bValue:'0',deltaE:null,note:null}};
describe('inspection facts are separate from workflow conclusions',()=>{
  it('keeps a pending whole vehicle after a passed measurement point',()=>{
    const parsed=parseInspectionBatch({operationId:'op',expectedRevision:1,items:[reading,measurement,occurrence]});
    expect(parsed.items.map(x=>x.entity)).toEqual(['occurrence','measurement','reading']);
    expect(parsed.items[0]).toMatchObject({values:{overallConclusion:'PENDING'}});
    expect(parsed.items[1]).toMatchObject({values:{conclusion:'PASS'}});
  });
  it('preserves unknown reading versus explicit zero without calculating thresholds',()=>{
    const result=readingValues(reading.values);expect(result.aValue).toBeNull();expect(result.bValue?.toString()).toBe('0');expect(result.deltaE).toBeNull();
    expect(instrumentNumber('-0.001')?.toString()).toBe('-0.001');
  });
  it.each(['',undefined,0,'=1+1','NaN','1.0000001','100000000'])('rejects invalid instrument number %s',value=>expect(()=>instrumentNumber(value)).toThrow());
  it('requires real dates and never shifts a date through the browser timezone',()=>{
    expect(activityDate('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');expect(()=>activityDate('2026-02-29')).toThrow();
    expect(()=>activityDate('2026-09-30T16:00:00Z')).toThrow();
  });
  it('requires explicit overall conclusion, rejects review result enums',()=>{expect(()=>conclusion(undefined)).toThrow();expect(()=>conclusion('APPROVED')).toThrow();});
  it('rejects read-only relation/flow/revision injection',()=>{
    for(const field of ['projectId','reviewRecordId','submittedAt','activityId'])expect(()=>parseInspectionBatch({operationId:'op',expectedRevision:1,items:[{...occurrence,[field]:'injected'}]})).toThrow();
    expect(()=>parseInspectionBatch({operationId:'op',expectedRevision:1,items:[{...occurrence,values:{...occurrence.values,overallConclusion:'PASS',workflowStatus:'APPROVED'}}]})).toThrow();
  });
  it('requires one unambiguous stable relation identity and rejects duplicate draft IDs',()=>{
    expect(()=>recordRef({id:'id',clientId:'draft'})).toThrow();expect(()=>recordRef({})).toThrow();
    expect(()=>parseInspectionBatch({operationId:'op',expectedRevision:1,items:[occurrence,occurrence]})).toThrow();
  });
  it('requires child revision on update and bounds batch size',()=>{
    expect(()=>parseInspectionBatch({operationId:'op',expectedRevision:1,items:[{entity:'reading',kind:'update',id:'reading',values:reading.values}]})).toThrow();
    expect(()=>parseInspectionBatch({operationId:'op',expectedRevision:1,items:Array.from({length:201},(_,index)=>({...occurrence,clientId:`draft-${index}`}))})).toThrow();
  });
});
