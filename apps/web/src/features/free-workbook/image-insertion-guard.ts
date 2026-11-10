export interface ImageInsertionScope {
  unitId:string;sheetId:string;selection:string;revision:number;
}
interface PendingImage {drawingId:string;unitId:string;subUnitId:string}
const movedMessage='图片上传期间工作表、选区或内容已变化。已上传原件保留，请回到原位置重试。';

/** Tracks uploads only until their first insertion. Imported/saved drawings and
 * undo/redo have their own explicit destinations and do not acquire a token. */
export class ImageInsertionGuard {
  private pending=new Map<string,ImageInsertionScope>();
  private disposed=false;
  constructor(private readScope:()=>ImageInsertionScope){}
  begin():string{
    if(this.disposed)throw new Error('图片视图已经关闭。');
    if(this.pending.size>=50)throw new Error('尚有 50 个图片插入请求，请保存后重新读取。');
    const id=crypto.randomUUID();this.pending.set(id,{...this.readScope()});return id;
  }
  assertCurrent(id:string):void{
    const expected=this.pending.get(id);
    if(this.disposed||!expected)throw new Error('图片插入请求已经失效，原件保留。');
    const actual=this.readScope();
    if(actual.unitId!==expected.unitId||actual.sheetId!==expected.sheetId||actual.selection!==expected.selection||actual.revision!==expected.revision)throw new Error(movedMessage);
  }
  validate(images:readonly PendingImage[]):void{
    for(const image of images){
      const scope=this.pending.get(image.drawingId);if(!scope)continue;
      this.assertCurrent(image.drawingId);
      if(image.unitId!==scope.unitId||image.subUnitId!==scope.sheetId)throw new Error(movedMessage);
    }
  }
  release(id:string):void{this.pending.delete(id);}
  dispose():void{this.disposed=true;this.pending.clear();}
}
