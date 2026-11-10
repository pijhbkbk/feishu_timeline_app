import { describe,it,expect,vi } from 'vitest';
import { committedSnapshot } from './committed-snapshot';
describe('formal snapshot while calculation is in flight',()=>{
 function setup(){let release!:()=>void;const state={editing:true,composing:false,disposed:false};const gate=new Promise<void>(resolve=>{release=resolve;});const read=vi.fn(()=>({value:'committed-cell'})),endEditing=vi.fn(async()=>{state.editing=false;});const options={isDisposed:()=>state.disposed,isComposing:()=>state.composing,isEditing:()=>state.editing,endEditing,calculate:()=>gate,read};return {state,options,release,read,endEditing};}
 it.each(['editing','composing','disposed'] as const)('does not acknowledge %s started after initial commit',async field=>{const fixture=setup(),pending=committedSnapshot(fixture.options);await Promise.resolve();fixture.state[field]=true;fixture.release();await expect(pending).rejects.toThrow();expect(fixture.read).not.toHaveBeenCalled();expect(fixture.endEditing).toHaveBeenCalledTimes(1);expect(fixture.state[field]).toBe(true);});
 it('reads exactly the committed model after calculation when no later edit exists',async()=>{const fixture=setup(),pending=committedSnapshot(fixture.options);await Promise.resolve();fixture.release();await expect(pending).resolves.toEqual({value:'committed-cell'});expect(fixture.read).toHaveBeenCalledTimes(1);});
 it('does not end an active composition',async()=>{const fixture=setup();fixture.state.composing=true;await expect(committedSnapshot(fixture.options)).rejects.toThrow('中文选词');expect(fixture.endEditing).not.toHaveBeenCalled();});
});
