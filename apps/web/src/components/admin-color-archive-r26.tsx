'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import {
  fetchAdminColorArchive,
  type AdminColorArchiveResponse,
  type AdminColorMaterial,
} from '../lib/admin-client';
import { API_BASE_URL } from '../lib/auth-client';
import { useAuth } from './auth-provider';
import { formatColorStatus, formatDate } from './admin-color-database-r26';

export function AdminColorArchiveR26({ colorId }: { colorId: string }) {
  const { user } = useAuth();
  const isAdministrator = Boolean(user && (user.isSystemAdmin || user.roleCodes.includes('admin')));
  const [data, setData] = useState<AdminColorArchiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdminColorArchive(colorId);
        if (active) setData(result);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '颜色档案加载失败。');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [colorId]);

  if (loading && !data) return <main className="r26-color-archive"><div className="r26-color-db__skeleton" aria-label="正在加载颜色档案"><span /><span /></div></main>;

  return (
    <main className="r26-color-archive" data-testid="admin-color-archive-page">
      <Link href="/admin/color-database" className="r26-admin-back">
        ← 返回颜色数据库{isAdministrator ? '' : '（授权项目）'}
      </Link>
      {error ? <div className="r26-admin-home__error" role="alert"><span>{error}</span></div> : null}
      {data ? (
        <>
          <header className="r26-color-archive__hero">
            <span className="r26-color-archive__swatch" style={{ backgroundColor: data.displayColor ?? '#d7dde7' }} />
            <div className="r26-color-archive__title">
              <span>{formatColorStatus(data.status)}</span>
              <h1>{data.name}</h1>
              <p>{data.code ? `颜色编号：${data.code}` : '临时颜色档案 · 尚未生成正式编号'}</p>
              {!data.displayColor ? <small>尚未录入显示色值</small> : null}
            </div>
            <div className="r26-color-archive__completion"><strong>{data.completenessPercent}%</strong><span>工序材料覆盖</span></div>
          </header>

          <section className="r26-color-archive__facts" aria-label="颜色基本信息">
            <Fact label="适用车型" value={data.vehicleModels.join('、') || '尚未记录'} />
            <Fact label="颜色类型" value={data.colorType ?? '尚未记录'} />
            <Fact label="主要供应商" value={data.suppliers.join('、') || '尚未记录'} />
            <Fact label="首次开发项目" value={formatProjectLabel(data.firstProject.name, data.firstProject.code)} />
            <Fact label="关联项目" value={`${data.projects.length} 个`} />
            <Fact label="归档材料" value={`${data.materialCount} 份 · 覆盖 ${data.coveredSteps}/18 工序`} />
          </section>

          <section className="r26-color-archive__projects">
            <h2>关联项目</h2>
            <div>{data.projects.map((project) => <Link key={project.id} href={`/projects/${project.id}`}>{cleanProjectName(project.name)}{isDemoProjectCode(project.code) ? null : <span>{project.code}</span>}</Link>)}</div>
          </section>

          <section className="r26-color-archive__materials">
            <div className="r26-color-archive__section-heading">
              <div><h2>生命周期材料</h2><p>文件仍存放于原附件系统，这里只建立可追溯的归档视图。</p></div>
              <strong>{data.materialCount} 份</strong>
            </div>
            {data.stages.map((stage) => (
              <details key={stage.key} open={stage.materials.length > 0}>
                <summary><span>{stage.title}<small>第 {stage.stepRange} 步</small></span><strong>{stage.materials.length} 份</strong></summary>
                {stage.materials.length ? <div className="r26-color-archive__material-list">{stage.materials.map((material) => <MaterialRow material={material} key={material.id} />)}</div> : <p className="r26-color-archive__stage-empty">当前阶段尚无已归档材料。</p>}
              </details>
            ))}
            {data.unclassifiedMaterials.length ? (
              <details open><summary><span>待分类材料<small>未识别到具体工序</small></span><strong>{data.unclassifiedMaterials.length} 份</strong></summary><div className="r26-color-archive__material-list">{data.unclassifiedMaterials.map((material) => <MaterialRow material={material} key={material.id} />)}</div></details>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function MaterialRow({ material }: { material: AdminColorMaterial }) {
  const href = `${API_BASE_URL}${material.previewUrl ?? material.downloadUrl}`;
  return (
    <article className="r26-color-material">
      <div className="r26-color-material__icon" aria-hidden="true">{fileExtension(material.fileName)}</div>
      <div className="r26-color-material__body">
        <div><strong>{material.fileName}</strong><span className={material.versionStatus === 'CURRENT' ? 'is-current' : 'is-history'}>{material.versionStatus === 'CURRENT' ? '当前版本' : '历史版本'}</span></div>
        <p>第 {material.stepNumber ?? '—'} 步 · {material.stepName} · V{material.versionNo}</p>
        <small>{material.uploader?.name ?? '未知上传人'} · {material.uploader?.departmentName ?? '部门未记录'} · {formatProjectLabel(material.projectName, material.projectCode)} · {formatDate(material.uploadedAt)} · {formatFileSize(material.fileSize)}</small>
      </div>
      <a href={href} target="_blank" rel="noreferrer">{material.previewUrl ? '查看' : '下载'}</a>
    </article>
  );
}

function fileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toUpperCase();
  return extension && extension.length <= 5 ? extension : '文件';
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatProjectLabel(name: string, code: string) {
  const cleanName = cleanProjectName(name);
  return isDemoProjectCode(code) ? cleanName : `${cleanName}（${code}）`;
}

function cleanProjectName(name: string) {
  return name
    .replace(/[（(]\s*DEMO[-_\s]?ACTIVE[^）)]*[）)]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isDemoProjectCode(code: string) {
  return /DEMO[-_\s]?ACTIVE/i.test(code);
}
