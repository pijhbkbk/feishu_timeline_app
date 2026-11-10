'use client';
import {useEffect,useState} from 'react';
import {useAuth} from '../../components/auth-provider';
import {Workspace} from './app';
export function TableFirstRoute({page}:{page:'review'|'production'}) {
  const {user,logout}=useAuth();
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  if(!mounted||!user)return null;
  if(!user.isSystemAdmin&&!user.teamAccessApproved)return <p role="alert">当前账号尚未获准维护业务。</p>;
  return <Workspace key={user.id} user={{...user,teamAccessApproved:!!user.teamAccessApproved,isSystemAdmin:!!user.isSystemAdmin}} logout={logout} routePage={page}/>;
}
