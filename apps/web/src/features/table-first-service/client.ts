import { parseProductionQuantity } from '../production-sheet/production-adapter';
export { parseProductionQuantity };
import { apiRequest } from '../../lib/auth-client';
export { apiRequest };
export type User = { id:string; name:string; username:string; teamAccessApproved:boolean; isSystemAdmin:boolean };
export type Color = { id:string; name:string; code?:string|null };
export type Basis = { colorId:string; baseId:string; month:string; snapshotHash:string; revision:number; factId:string|null; factRevision:number|null; quantity:string|null; editable:boolean; mode:string|null; reconciliationRequired:boolean; totalFactId:string|null; totalQuantity:string|null; modelCount:number; modelKnownQuantity:string|null; facts:{id:string;scope:string;revision:number;quantity:string|null;vehicleModel:string}[] };
export type Matrix = {items:(Color&{cells:Basis[]})[];total:number;page:number;pageSize:number};
export type Visual = {id:string;clientId?:string;activityId?:string;objectId?:string;revision:number;activityRevision:number;objectRevision:number;baseId:string;date:string;colorId:string;objectCode:string;vehicleModel:string;productionDate:string|null;scores:{ordinal:number;values:(string|null)[]}[]|null;conclusion:string|null;action:string|null;rectify:boolean|null;deadline:string|null;paintUnit:string|null;responsibleUnit:string|null;rectificationUnit:string|null;editable:boolean;originalSource?:unknown;updatedAt?:string};
export type VisualPage = {items:Visual[];total:number;page:number;pageSize:number};
export type Patch = {basis:Basis;value:string};
export type Draft = {production:Record<string,Patch>;reviews:Record<string,Visual>;pending?:{page:string;body:unknown}};
export const emptyDraft = ():Draft=>({production:{},reviews:{}});
export const blankScores=()=>Array.from({length:4},(_,i)=>({ordinal:i+1,values:Array<string|null>(5).fill(null)}));
export function mutation(r:Visual){return {...(r.clientId?{clientId:r.clientId}:{id:r.id,expectedRevision:r.revision,expectedActivityRevision:r.activityRevision,expectedObjectRevision:r.objectRevision}),baseId:r.baseId,date:r.date,colorId:r.colorId,objectCode:r.objectCode,vehicleModel:r.vehicleModel,productionDate:r.productionDate,scores:r.scores,conclusion:r.conclusion,action:r.action,rectify:r.rectify,deadline:r.deadline,paintUnit:r.paintUnit,responsibleUnit:r.responsibleUnit,rectificationUnit:r.rectificationUnit};}
export const cellKey=(b:Pick<Basis,'colorId'|'baseId'|'month'>)=>`${b.colorId}:${b.baseId}:${b.month}`;
export const bj=(at:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date(at));

export function quantityError(value:string){try{parseProductionQuantity(value);return '';}catch(e){return (e as Error).message;}}
