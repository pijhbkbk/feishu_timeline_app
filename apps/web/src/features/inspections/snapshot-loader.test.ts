import { describe, expect, it, vi } from 'vitest';
import type { Activity, Measurement, Reading, Snapshot } from './client';
import { acknowledge, buildRows } from './model';
import { ActivitySnapshotLoader } from './snapshot-loader';
function fixture(groups = 2, perGroup = 3): Snapshot {
  return {
    activity: { id: 'activity', activityDate: '2026-10-13T00:00:00Z', productionBaseId: 'base', productionBase: { id: 'base', name: '合成测试基地' }, batchLabel: null, note: null, revision: 1, projectId: null, recurringTaskId: null, reviewRecordId: null, reviewRecord: null },
    occurrences: [{ id: 'occurrence', revision: 1, activityId: 'activity', objectId: 'object', colorId: 'color', overallConclusion: 'PENDING', visualConclusion: null, handlingOpinion: null, note: null, originalSource: null, object: { id: 'object', objectCode: '合成测试对象', objectKind: 'VEHICLE', vin: null, vehicleModel: '轻卡', vehicleClass: null, revision: 1, sampleId: null }, color: { id: 'color', name: '测试颜色', code: 'TEST', productionBaseId: 'base' }, _count: { measurements: groups, defects: 0 } }],
    measurements: Array.from({ length: groups }, (_, index): Measurement => ({ id: `group-${index}`, revision: 1, occurrenceId: 'occurrence', pointLabel: `测点${index}`, groupLabel: `组${index}`, instrumentLabel: '原仪器', methodLabel: '原方法', standardVersionId: 'standard', originalCriteria: '保留原依据', conclusion: 'PENDING' })),
    readings: Array.from({ length: groups }, (_, index) => Array.from({ length: perGroup }, (_, angle): Reading => ({ id: `reading-${index}-${angle}`, revision: 1, measurementId: `group-${index}`, angleLabel: `${angle}°`, lValue: null, aValue: null, bValue: null, deltaE: null, note: null }))).flat(), defects: [],
  };
}

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const signal = () => new AbortController().signal;
function setup() {
 const initial = fixture(), readSnapshot = vi.fn(async (_id: string, _signal: AbortSignal) => { void _id; void _signal; return initial; }), readActivity = vi.fn(async (_id: string, _signal: AbortSignal): Promise<Activity> => { void _id; void _signal; return { ...initial.activity }; });
 return { initial, readSnapshot, readActivity, loader: new ActivitySnapshotLoader('activity', { readSnapshot, readActivity }) };
}

describe('activity-owned snapshot reuse', () => {
 it('shares the initial full read across layer changes without using a cancelled child to publish', async () => {
  const s=setup(), first=deferred<Snapshot>(); s.readSnapshot.mockImplementationOnce(()=>first.promise);
  const oldSignal=new AbortController(); const old=s.loader.load('occurrence',oldSignal.signal).catch(error=>error);
  oldSignal.abort(); const next=s.loader.load('reading',signal());
  expect(s.readSnapshot).toHaveBeenCalledTimes(1);expect(s.readSnapshot.mock.calls[0]![1].aborted).toBe(false);
  first.resolve(s.initial);expect(await next).toBe(s.initial);expect(await old).toMatchObject({name:'AbortError'});
  expect(s.readActivity).not.toHaveBeenCalled();expect(s.loader.isCurrent(s.initial)).toBe(true);
 });
 it('only a different layer reuses children, with fresh activity metadata',async()=>{
  const s=setup();const first=await s.loader.load('occurrence',signal());
  s.readActivity.mockResolvedValueOnce({...first.activity,note:'最新活动备注',participants:[{personId:'person',person:{id:'person',name:'最新人员名称',isActive:false}}]});
  const next=await s.loader.load('reading',signal());
  expect(s.readSnapshot).toHaveBeenCalledTimes(1);expect(s.readActivity).toHaveBeenCalledTimes(1);
  expect(next).not.toBe(first);expect(next.occurrences).toBe(first.occurrences);expect(next.readings).toBe(first.readings);
  expect(next.activity.note).toBe('最新活动备注');expect(next.activity.participants![0]!.person.isActive).toBe(false);
 });
 it.each(['manual refresh','conflict refresh','form saved','import saved'])('%s on the same layer always reads the complete snapshot',async()=>{
  const s=setup();await s.loader.load('reading',signal());
  const fresh=fixture();fresh.occurrences[0]!.color.name='外部更正后的名称';s.readSnapshot.mockResolvedValueOnce(fresh);
  expect(await s.loader.load('reading',signal())).toBe(fresh);
  expect(s.readSnapshot).toHaveBeenCalledTimes(2);expect(s.readActivity).not.toHaveBeenCalled();
 });
 it('a changed activity revision on layer switch requires a full read',async()=>{
  const s=setup();await s.loader.load('occurrence',signal());
  const changed=fixture();changed.activity.revision=2;changed.readings[0]!.note='另一个用户已保存';
  s.readActivity.mockResolvedValueOnce(changed.activity);s.readSnapshot.mockResolvedValueOnce(changed);
  expect(await s.loader.load('reading',signal())).toBe(changed);expect(s.readSnapshot).toHaveBeenCalledTimes(2);
 });
 it('submission freezes the reused rows even when the activity revision is unchanged',async()=>{
  const s=setup();await s.loader.load('occurrence',signal());
  s.readActivity.mockResolvedValueOnce({...s.initial.activity,editable:false,reviewRecordId:'review',reviewRecord:{id:'review',submittedAt:'2026-10-13T01:00:00Z',result:'DRAFT'}});
  const locked=await s.loader.load('reading',signal());
  expect(locked.activity.revision).toBe(1);expect(s.readSnapshot).toHaveBeenCalledTimes(1);
  expect(buildRows(locked,'reading').every(row=>row.editable.length===0)).toBe(true);
 });
 it.each([401,403,404])('does not fall back to old facts on detail HTTP %i',async status=>{
  const s=setup();const first=await s.loader.load('occurrence',signal());s.readActivity.mockRejectedValueOnce(Object.assign(new Error('当前不可读取'),{status}));
  await expect(s.loader.load('reading',signal())).rejects.toMatchObject({status});
  expect(s.loader.isCurrent(first)).toBe(false);expect(s.readSnapshot).toHaveBeenCalledTimes(1);
  await s.loader.load('reading',signal());expect(s.readSnapshot).toHaveBeenCalledTimes(2);
 });
 it('same-layer refresh supersedes the shared initial read; its late response cannot publish',async()=>{
  const s=setup(),oldRead=deferred<Snapshot>(),newRead=deferred<Snapshot>();s.readSnapshot.mockImplementationOnce(()=>oldRead.promise).mockImplementationOnce(()=>newRead.promise);
  const old=s.loader.load('occurrence',signal()).catch(error=>error);const other=s.loader.load('reading',signal()).catch(error=>error);
  const current=s.loader.load('reading',signal());expect(s.readSnapshot).toHaveBeenCalledTimes(2);expect(s.readSnapshot.mock.calls[0]![1].aborted).toBe(true);
  const fresh=fixture();fresh.activity.revision=2;newRead.resolve(fresh);expect(await current).toBe(fresh);
  oldRead.resolve(s.initial);expect(await old).toMatchObject({name:'AbortError'});expect(await other).toMatchObject({name:'AbortError'});
  expect(s.loader.isCurrent(fresh)).toBe(true);expect(s.loader.isCurrent(s.initial)).toBe(false);
 });
 it('a fresh read supersedes pending metadata validation without allowing old metadata to replace it',async()=>{
  const s=setup();await s.loader.load('occurrence',signal());const pending=deferred<Activity>();s.readActivity.mockImplementationOnce(()=>pending.promise);
  const old=s.loader.load('reading',signal()).catch(error=>error);const fresh=fixture();fresh.activity.revision=3;s.readSnapshot.mockResolvedValueOnce(fresh);
  expect(await s.loader.load('reading',signal())).toBe(fresh);expect(s.readActivity.mock.calls[0]![1].aborted).toBe(true);
  pending.resolve({...s.initial.activity,note:'迟到'});expect(await old).toMatchObject({name:'AbortError'});expect(s.loader.isCurrent(fresh)).toBe(true);
 });
 it('invalidates a completed result before any superseded outer callback publishes it',async()=>{
  const s=setup();const result=await s.loader.load('occurrence',signal());expect(s.loader.isCurrent(result)).toBe(true);
  const pending=deferred<Snapshot>();s.readSnapshot.mockImplementationOnce(()=>pending.promise);const fresh=s.loader.load('occurrence',signal());
  expect(s.loader.isCurrent(result)).toBe(false);const next=fixture();pending.resolve(next);await fresh;
 });
 it('disposes in-flight ownership and supports StrictMode setup-cleanup-setup on the same loader',async()=>{
  const s=setup(),pending=deferred<Snapshot>();s.readSnapshot.mockImplementationOnce(()=>pending.promise);
  const old=s.loader.load('occurrence',signal()).catch(error=>error);s.loader.dispose();expect(s.readSnapshot.mock.calls[0]![1].aborted).toBe(true);
  const fresh=fixture();s.readSnapshot.mockResolvedValueOnce(fresh);expect(await s.loader.load('occurrence',signal())).toBe(fresh);
  pending.resolve(s.initial);expect(await old).toMatchObject({name:'AbortError'});expect(s.loader.isCurrent(fresh)).toBe(true);
 });
 it('retains the canonical acknowledged revisions and parent dependency tokens across a layer switch',async()=>{
  const s=setup();const first=await s.loader.load('reading',signal());const group=first.measurements[0]!;
  acknowledge(first,{activityId:'activity',revision:2,items:[{...group,revision:2,entity:'measurement',methodLabel:'本人刚确认保存'}]});
  s.readActivity.mockResolvedValueOnce({...first.activity});const next=await s.loader.load('measurement',signal());
  expect(next.measurements[0]).toMatchObject({revision:2,methodLabel:'本人刚确认保存'});expect(s.readSnapshot).toHaveBeenCalledTimes(1);
  expect(buildRows(next,'reading')[0]!.dependencies).toEqual({'measurement:group-0':2});
 });
 it('rejects a response with the wrong activity identity',async()=>{
  const s=setup();await s.loader.load('occurrence',signal());s.readActivity.mockResolvedValueOnce({...s.initial.activity,id:'another'});
  await expect(s.loader.load('reading',signal())).rejects.toThrow('活动读取身份不一致');expect(s.loader.isCurrent(s.initial)).toBe(false);
 });
 it('an already cancelled consumer neither starts nor supersedes a read',async()=>{
  const s=setup();await s.loader.load('occurrence',signal());const aborted=new AbortController();aborted.abort();
  await expect(s.loader.load('reading',aborted.signal)).rejects.toMatchObject({name:'AbortError'});expect(s.readSnapshot).toHaveBeenCalledTimes(1);expect(s.loader.isCurrent(s.initial)).toBe(true);
 });
});
