import { shanghaiToday, shiftDate } from '../inspections/week-range';
export const PARTS = ['驾驶室','前围侧板','前围面板','保险杠','导流罩'];
export const BASES = [{id:'demo-xg',name:'新港'},{id:'demo-sd',name:'山东'},{id:'demo-sc',name:'四川'},{id:'demo-fy',name:'阜阳'}];
export const COLORS = ['云白','松柏绿','海蓝','暖砂黄','银灰','朱红','墨黑','浅玉白','雾蓝','麦黄','青灰','深绿','珠光白','橙红','铂银','湖蓝','栗棕','浅金','石墨灰','珍珠白'].map((name,i)=>({id:`demo-color-${i+1}`,name,swatch:['#f6f3e8','#78917e','#648b9c','#cfb579','#aab0ac','#b07770','#414b47','#e8eee5','#a1b9c1','#ddc576','#92a5a0','#416954','#f4f1ed','#c87e62','#c4c7c4','#648d9f','#8b6c5f','#d7c8a6','#6b7474','#f4f3ed'][i]}));
export type Review = {id:string;baseId:string;date:string;colorId:string;model:string;vin:string;productionDate:string;scores:string[][];rectify:string;conclusion:string;action:string;deadline:string;paintUnit:string;responsible:string;rectificationUnit:string;signatures:string;sourceId:string;legacy:string[]};
export type Data = {reviews:Review[];matrices:Record<string,Record<string,string[]>>;sourceAnnualTotals?:Record<string,string>};
export type Saved = {revision:number;data:Data;history:{revision:number;at:string;data:Data}[]};
export function newReview(baseId:string,date=shanghaiToday()):Review { return {id:crypto.randomUUID(),baseId,date,colorId:'',model:'',vin:'',productionDate:'',scores:Array.from({length:4},()=>Array(5).fill('')),rectify:'',conclusion:'',action:'',deadline:'',paintUnit:'',responsible:'',rectificationUnit:'',signatures:'',sourceId:'',legacy:[]}; }
export function seed(empty=false):Data {
 const reviews=empty?[]:Array.from({length:6},(_,i)=>({...newReview(BASES[0]!.id,'2026-11-09'),id:`demo-review-${i+1}`,colorId:COLORS[i%3]!.id,model:`示例车型${i%2+1}`,vin:`DEMO-${String(i+1).padStart(4,'0')}`,productionDate:shiftDate('2026-11-09',-1),scores:Array.from({length:4},(_,r)=>Array.from({length:5},(_,c)=>c===4&&i%2?'/':c===0?'A':(i===3&&r===2&&c===2?'C':'B'))),rectify:i===3?'是':i===5?'':'否',conclusion:i===3?'人工记录：前围面板待复查。':'',sourceId:'demo-paper-01',legacy:i===5?['否','是','否','否','否']:[]}));
 const matrices:Data['matrices']={};
 if(!empty)for(const b of BASES)for(const year of ['2025','2026'])for(const basis of (b.id==='demo-fy'&&year==='2025'?['exclude','include']:['monthly'])){
  matrices[`${b.id}:${year}:${basis}`]=Object.fromEntries(COLORS.map((c,i)=>[c.id,Array.from({length:12},(_,m)=>basis==='include'||m>8?'':String(m===2&&i%3===0?0:(i+1)*3+m+(basis==='include'?4:0)))]));
 }
 return {reviews,matrices,sourceAnnualTotals:empty?{}:Object.fromEntries(COLORS.map((c,i)=>[c.id,String(100+i*17)]))};
}
export function matrixRows(data:Data,key:string){return COLORS.map(c=>({ ...c,values:data.matrices[key]?.[c.id]??Array(12).fill('') as string[]}));}
export function sum(values:string[]):string {const known=values.filter(v=>v!=='');return known.length?String(known.reduce((s,v)=>s+Number(v),0)):'';}
export function quantityError(value:string){return value!==''&&(!/^\d{1,9}$/.test(value)||!Number.isSafeInteger(Number(value)))?'请输入 0–999999999 的整数；未知请留空。':'';}
export function gradeError(value:string){return !['','A','B','C','D','/'].includes(value)?'评分只接受 A、B、C、D、/ 或空白。':'';}
export function dateError(value:string,required=false){if(!value)return required?'请填写日期。':'';try{shiftDate(value,0);return '';}catch{return '请输入有效日期（YYYY-MM-DD）。';}}
export function validate(data:Data):string {
 for(const r of data.reviews){const label=`车身号 ${r.vin||'未填写'}`;if(!r.vin.trim()||!r.model.trim()||!COLORS.some(c=>c.id===r.colorId))return `${label}：请填写颜色、车型和车身号。`;if(dateError(r.date,true)||dateError(r.productionDate,true)||dateError(r.deadline))return `${label}：请核对评审、生产和整改日期。`;if(r.scores.some(row=>row.some(v=>gradeError(v))))return `${label}：${gradeError('?')}`;}
 for(const rows of Object.values(data.matrices))for(const values of Object.values(rows))for(const v of values)if(quantityError(v))return quantityError(v);
 return '';
}
export function parseRectangle(text:string):string[][] {if(text.length>100000)throw Error('一次最多粘贴 100 KB 文本。');const lines=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(r=>r.split('\t'));if(!lines.length||lines.length>200||lines.some(r=>r.length!==lines[0]!.length)||lines[0]!.length>20)throw Error('请粘贴规则的矩形区域（最多 200 行 × 20 列）。');return lines;}
export function preparePaste(text:string,row:number,col:number,rows:number,cols:number,validateCell:(v:string)=>string){const values=parseRectangle(text);if(row+values.length>rows||col+values[0]!.length>cols)throw Error('粘贴超出当前表格范围，整次未应用。');for(const line of values)for(const v of line){const error=validateCell(v);if(error)throw Error(`${error} 整次粘贴未应用。`);}return values;}
export const STORAGE='truck-color-table-preview-v1';
export const storageKey=(scenario:string)=>`${STORAGE}:${scenario}`;
export function readSaved(key:string):Saved|null {const raw=localStorage.getItem(key);if(!raw)return null;const value=JSON.parse(raw) as Saved;if(!Number.isInteger(value.revision)||!Array.isArray(value.data?.reviews)||!value.data?.matrices||!Array.isArray(value.history))throw Error('预览存档格式异常，保留原存档，请勿覆盖。');return value;}
