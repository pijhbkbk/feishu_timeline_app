interface BackgroundView {uKey:string;parent:unknown;dispose():void}
/** Replaces only the pinned native background view. Do not register another
 * lifetime disposable on each retry: that retains every old decoded cache. */
export function createBackgroundRetry<T extends BackgroundView>(extensions:Map<string,T>,host:unknown,injector:unknown,repaint:()=>void,isDisposed:()=>boolean){
  let generation=0;
  return ()=>{
    const key='WorksheetBackgroundImageExtension',existing=extensions.get(key);
    if(!existing)throw new Error('背景视图尚未就绪，请稍后重试图片。');
    const version=++generation;
    const replacement=Reflect.construct(existing.constructor,[injector,()=>{if(!isDisposed()&&version===generation)repaint();}]) as T;
    if(replacement.uKey!==key){replacement.dispose();throw new Error('背景视图版本不匹配，工作簿内容保留。');}
    replacement.parent=host;extensions.set(key,replacement);existing.dispose();
  };
}
