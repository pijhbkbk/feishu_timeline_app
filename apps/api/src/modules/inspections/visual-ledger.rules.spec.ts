import { describe, expect, it } from 'vitest';
import { parseVisualBatch, visualDate } from './visual-ledger.rules';
const item=()=>({clientId:'draft-1',baseId:'base-1',date:'2026-01-01',colorId:'color-1',objectCode:'SYN-01',vehicleModel:'合成',productionDate:null,scores:Array.from({length:4},(_,i)=>({ordinal:i+1,values:['A','B','C','D','/']})),rectify:null});
describe('visual ledger original values and date-only contract',()=>{
 it('retains ordered originals and manual undecided, without an automatic aggregate',()=>{const parsed=parseVisualBatch({operationId:'operation-1',items:[item()]});expect(parsed.items[0]).toMatchObject({rectify:null,productionDate:null,scores:item().scores});expect(parsed.items[0]).not.toHaveProperty('overallConclusion');});
 it('rejects invented row counts, ordinal changes and legacy booleans as grades',()=>{for(const scores of [item().scores.slice(0,3),item().scores.slice().reverse(),[{ordinal:1,values:[true,'A','B','C','D']},...item().scores.slice(1)]])expect(()=>parseVisualBatch({operationId:'op',items:[{...item(),scores}]})).toThrow();});
 it('stores calendar dates without a device/UTC+8 round trip',()=>{for(const day of ['2026-01-01','2026-12-31','2028-02-29'])expect(visualDate(day)?.toISOString()).toBe(day+'T00:00:00.000Z');expect(visualDate('')).toBeNull();for(const day of ['2026-02-29','2026-01-01T00:00:00+08:00','2026-13-01'])expect(()=>visualDate(day)).toThrow();});
 it('rejects client authors, revisions missing on updates and unsupported fields',()=>{for(const invalid of [{...item(),actorUserId:'another'},{...item(),id:'record-1'},{...item(),overallConclusion:'PASS'}])expect(()=>parseVisualBatch({operationId:'op',items:[invalid]})).toThrow();});
});
