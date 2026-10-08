import {M1RecordEntry} from '../../../../features/m1/record-entry';
export default async function Page({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <M1RecordEntry projectId={projectId} kind="report"/>;}
