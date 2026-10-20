/** Calculation completion is an asynchronous boundary. A new live edit during
 * that wait is absent from the sheet model and must not be acknowledged by a
 * formal save or business application. Keep it in the editor/local draft. */
export async function committedSnapshot<T>(options:{isDisposed():boolean;isComposing():boolean;isEditing():boolean;endEditing():Promise<unknown>;calculate():Promise<unknown>;read():T}):Promise<T>{
  const available=()=>{if(options.isDisposed())throw new Error('编辑器已关闭。');if(options.isComposing())throw new Error('请先完成中文选词，再保存。');};
  available();if(options.isEditing())await options.endEditing();available();
  await options.calculate();available();
  if(options.isEditing())throw new Error('计算期间有新的单元格输入，请完成输入后再保存；当前编辑仍保留。');
  return options.read();
}
