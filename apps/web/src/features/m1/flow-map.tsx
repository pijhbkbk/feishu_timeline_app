'use client';

import { displayColorName } from './color-name';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { R26WorkspaceResponse } from '../v2/real-types';
import { M1Icon } from './icon';
import { taskHref } from './context';
// Layout is only geometry. All node status, task identity and history come from the API.
const positions: Record<number, [number, number]> = { 1:[310,32],2:[310,124],3:[310,216],4:[310,308],5:[578,308],6:[310,400],7:[578,400],8:[846,400],9:[42,400],10:[310,492],11:[310,584],12:[310,676],13:[42,768],14:[310,860],15:[310,952],16:[310,1044],17:[310,1136],18:[310,1228] };
const edges: Array<[number,number,'main'|'branch'|'return']> = [[1,2,'main'],[2,3,'main'],[3,4,'main'],[4,5,'branch'],[4,6,'main'],[6,9,'branch'],[6,7,'branch'],[7,8,'branch'],[6,10,'main'],[10,11,'main'],[11,12,'main'],[12,13,'branch'],[12,14,'main'],[14,15,'main'],[15,16,'main'],[16,17,'main'],[17,18,'main'],[4,3,'return'],[12,11,'return'],[14,3,'return'],[17,16,'return']];
function edgePath(from: number, to: number, type: string) {
  const a = positions[from]!, b = positions[to]!;
  if (type === 'return') { const x = from === 14 ? 1085 : 558; return `M${a[0]+218} ${a[1]+28} H${x} V${b[1]+28} H${b[0]+218}`; }
  if (a[0] === b[0]) return `M${a[0]+109} ${a[1]+56} V${b[1]}`;
  const right = a[0] < b[0]; return `M${a[0]+(right?218:0)} ${a[1]+28} H${(a[0]+b[0]+218)/2} V${b[1]+28} H${b[0]+(right?0:218)}`;
}
export function M1FlowMap({ workspace, source, selectedNode }: { workspace: R26WorkspaceResponse; source: 'dashboard' | 'project'; selectedNode?: string | undefined }) {
  const query = useSearchParams();
  const [zoom,setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const storageKey = `m1-map:${source}:${workspace.project.id}`;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const saved = sessionStorage.getItem(`${storageKey}:${Math.round(el.clientWidth)}`);
    if (saved) { try { const p=JSON.parse(saved); el.scrollTo(Number(p.x)||0,Number(p.y)||0); } catch { /* ignore an obsolete view */ } }
    else { el.scrollLeft=Math.max(0,310-(el.clientWidth-218)/2); }
    if (!saved && selectedNode) { const n=workspace.flowMap.nodes.find(n=>n.taskId===selectedNode || n.nodeCode===selectedNode); if(n) el.scrollTop=Math.max(0,(positions[n.stepNumber]?.[1]??0)-160); }
  },[storageKey, selectedNode, workspace.flowMap.nodes]);
  return <section className="m1-map" aria-label={`${displayColorName(workspace.project.name,workspace.flowMap.colorName)}流程地图`}>
    <div className="m1-map-actions"><span className="m1-badge">{workspace.flowMap.progressText}</span><div className="m1-button-group"><button className="m1-icon-button" aria-label="缩小流程地图" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.15))}><M1Icon name="zoomOut"/></button><button className="m1-button" onClick={()=>setZoom(1)} aria-label="恢复流程地图比例">{Math.round(zoom*100)}%</button><button className="m1-icon-button" aria-label="放大流程地图" disabled={zoom>=1.6} onClick={()=>setZoom(z=>Math.min(1.6,z+.15))}><M1Icon name="zoomIn"/></button></div></div>
    <div className="m1-map-scroll" ref={scroller} tabIndex={0} aria-label="完整流程，可横向及纵向滚动" onScroll={e=>sessionStorage.setItem(`${storageKey}:${Math.round(e.currentTarget.clientWidth)}`,JSON.stringify({x:e.currentTarget.scrollLeft,y:e.currentTarget.scrollTop}))}>
      <div className="m1-map-canvas" style={{width:1115*zoom,height:1340*zoom}}>
        <svg className="m1-map-lines" width={1115*zoom} height={1340*zoom} viewBox="0 0 1115 1340" aria-label="主线、并行与返工关系"><defs><marker id={`m1-arrow-${source}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="currentColor"/></marker></defs>{edges.map(([a,b,type])=><path key={`${a}-${b}`} d={edgePath(a,b,type)} className={type==='return'?'m1-return-line':''} markerEnd={`url(#m1-arrow-${source})`}><title>{a} 至 {b}{type==='return'?'返工':''}</title></path>)}</svg>
        {workspace.flowMap.nodes.map(node=>{const p=positions[node.stepNumber]; if(!p)return null; const done=['COMPLETED','COMPLETED_LATE'].includes(node.status);const current=node.isActive||['IN_PROGRESS','PENDING_REVIEW','PENDING','OVERDUE','RETURNED','MONTHLY_TRACKING'].includes(node.status);const label=node.nodeCode==='DEVELOPMENT_REPORT'?'已获批开发报告':node.nodeCode==='PROJECT_INITIATION'?'市场需求':node.stepName; const cls=`m1-flow-node ${done?'is-done':current?'is-current':''} ${node.taskId===selectedNode||node.nodeCode===selectedNode?'is-selected':''}`;const content=<>{done&&<M1Icon name="check" size={16}/>}<span>{label}</span><span className="m1-node-status">{node.statusLabel}</span></>;return node.taskId?<Link key={node.nodeCode} href={taskHref(workspace.project.id,node.taskId,source,query.toString())} className={cls} style={{left:p[0]*zoom,top:p[1]*zoom,width:218*zoom,minHeight:56*zoom}} aria-label={`${label}，${node.statusLabel}`} data-node-code={node.nodeCode}>{content}</Link>:<div key={node.nodeCode} data-node-code={node.nodeCode} className={cls} style={{left:p[0]*zoom,top:p[1]*zoom,width:218*zoom,minHeight:56*zoom}}>{content}</div>;})}
      </div>
    </div>
    <div className="m1-map-legend"><span>已完成</span><span>当前节点</span><span>未开始</span><span>虚线：返工</span></div>
  </section>;
}
