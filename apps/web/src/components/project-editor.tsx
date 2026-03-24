'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from './auth-provider';
import {
  createProject,
  fetchUserDirectory,
  formatDate,
  getProjectPriorityLabel,
  getProjectStatusLabel,
  getWorkflowNodeLabel,
  PROJECT_MEMBER_TYPE_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  replaceProjectMembers,
  toDateInputValue,
  updateProject,
  type DirectoryUser,
  type ProjectDetail,
  type ProjectMemberInput,
  type ProjectMemberType,
  type ProjectPriority,
} from '../lib/projects-client';

type ProjectEditorProps =
  | {
      mode: 'create';
    }
  | {
      mode: 'edit';
      projectId: string;
      initialProject: ProjectDetail;
    };

type FormState = {
  code: string;
  name: string;
  description: string;
  priority: ProjectPriority;
  marketRegion: string;
  vehicleModel: string;
  ownerUserId: string;
  plannedStartDate: string;
  plannedEndDate: string;
};

type MemberDraft = {
  userId: string;
  memberType: ProjectMemberType;
  title: string;
  isPrimary: boolean;
};

const EMPTY_MEMBER: MemberDraft = {
  userId: '',
  memberType: 'MEMBER',
  title: '',
  isPrimary: false,
};

function buildFormState(project?: ProjectDetail): FormState {
  return {
    code: project?.code ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    priority: project?.priority ?? 'MEDIUM',
    marketRegion: project?.marketRegion ?? '',
    vehicleModel: project?.vehicleModel ?? '',
    ownerUserId: project?.ownerUserId ?? '',
    plannedStartDate: toDateInputValue(project?.plannedStartDate),
    plannedEndDate: toDateInputValue(project?.plannedEndDate),
  };
}

function buildMemberDrafts(project?: ProjectDetail): MemberDraft[] {
  if (!project || project.members.length === 0) {
    return [];
  }

  return project.members.map((member) => ({
    userId: member.userId,
    memberType: member.memberType,
    title: member.title ?? '',
    isPrimary: member.isPrimary,
  }));
}

export function ProjectEditor(props: ProjectEditorProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [formState, setFormState] = useState<FormState>(() =>
    props.mode === 'edit' ? buildFormState(props.initialProject) : buildFormState(),
  );
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>(() =>
    props.mode === 'edit' ? buildMemberDrafts(props.initialProject) : [],
  );
  const [currentProject, setCurrentProject] = useState<ProjectDetail | null>(
    props.mode === 'edit' ? props.initialProject : null,
  );
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isSavingMembers, setIsSavingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadDirectoryUsers();
  }, []);

  useEffect(() => {
    if (props.mode === 'edit') {
      setCurrentProject(props.initialProject);
      setFormState(buildFormState(props.initialProject));
      setMemberDrafts(buildMemberDrafts(props.initialProject));
    }
  }, [props]);

  useEffect(() => {
    if (props.mode === 'create' && user && !formState.ownerUserId) {
      setFormState((current) => ({
        ...current,
        ownerUserId: user.id,
      }));
    }
  }, [formState.ownerUserId, props.mode, user]);

  async function loadDirectoryUsers() {
    setIsLoadingUsers(true);
    setError(null);

    try {
      const users = await fetchUserDirectory();
      setDirectoryUsers(users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '用户目录加载失败。');
    } finally {
      setIsLoadingUsers(false);
    }
  }

  function updateField(key: keyof FormState, value: string) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function addMemberRow() {
    setMemberDrafts((current) => [...current, { ...EMPTY_MEMBER }]);
  }

  function updateMemberField<Key extends keyof MemberDraft>(
    index: number,
    key: Key,
    value: MemberDraft[Key],
  ) {
    setMemberDrafts((current) =>
      current.map((member, currentIndex) =>
        currentIndex === index
          ? {
              ...member,
              [key]: value,
            }
          : member,
      ),
    );
  }

  function removeMember(index: number) {
    setMemberDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProject(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const detail = await createProject({
        code: formState.code,
        name: formState.name,
        description: formState.description || null,
        priority: formState.priority,
        marketRegion: formState.marketRegion || null,
        vehicleModel: formState.vehicleModel || null,
        ownerUserId: formState.ownerUserId || null,
        plannedStartDate: formState.plannedStartDate || null,
        plannedEndDate: formState.plannedEndDate || null,
        members: normalizeMembers(memberDrafts),
      });

      setSuccessMessage('项目已创建，流程实例已自动初始化。');
      router.push(`/projects/${detail.id}/overview`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '项目创建失败。');
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleSaveProjectBasics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (props.mode !== 'edit') {
      return;
    }

    setIsSavingProject(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const detail = await updateProject(props.projectId, {
        name: formState.name,
        description: formState.description || null,
        priority: formState.priority,
        marketRegion: formState.marketRegion || null,
        vehicleModel: formState.vehicleModel || null,
        ownerUserId: formState.ownerUserId || null,
        plannedStartDate: formState.plannedStartDate || null,
        plannedEndDate: formState.plannedEndDate || null,
      });

      setCurrentProject(detail);
      setFormState(buildFormState(detail));
      setMemberDrafts(buildMemberDrafts(detail));
      setSuccessMessage('项目基础信息已更新。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '项目更新失败。');
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleSaveMembers() {
    if (props.mode !== 'edit') {
      return;
    }

    setIsSavingMembers(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const detail = await replaceProjectMembers(props.projectId, normalizeMembers(memberDrafts));
      setCurrentProject(detail);
      setMemberDrafts(buildMemberDrafts(detail));
      setSuccessMessage('项目成员已更新。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '项目成员更新失败。');
    } finally {
      setIsSavingMembers(false);
    }
  }

  const project = props.mode === 'edit' ? currentProject : null;

  return (
    <div className="page-stack">
      {project ? (
        <section className="page-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Project Overview</p>
              <h2 className="section-title">{project.name}</h2>
              <p className="muted">
                当前节点、目标日期、风险等级和流程实例在这里集中展示。
              </p>
            </div>
            <Link href={`/projects/${project.id}/workflow`} className="button button-secondary">
              查看流程页
            </Link>
          </div>
          <div className="summary-grid">
            <article className="summary-card">
              <span>当前节点</span>
              <strong>{getWorkflowNodeLabel(project.currentNodeCode)}</strong>
            </article>
            <article className="summary-card">
              <span>目标日期</span>
              <strong>{formatDate(project.targetDate)}</strong>
            </article>
            <article className="summary-card">
              <span>风险等级</span>
              <strong>{getProjectPriorityLabel(project.riskLevel)}</strong>
            </article>
            <article className="summary-card">
              <span>项目状态</span>
              <strong>{getProjectStatusLabel(project.status)}</strong>
            </article>
          </div>
          <div className="metadata-grid">
            <div className="metadata-item">
              <span>项目编号</span>
              <strong>{project.code}</strong>
            </div>
            <div className="metadata-item">
              <span>负责人</span>
              <strong>{project.ownerName ?? '未设置'}</strong>
            </div>
            <div className="metadata-item">
              <span>归属部门</span>
              <strong>{project.owningDepartmentName ?? '未设置'}</strong>
            </div>
            <div className="metadata-item">
              <span>流程实例</span>
              <strong>{project.currentWorkflowInstance?.instanceNo ?? '未创建'}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">{props.mode === 'create' ? 'Create Project' : 'Edit Basics'}</p>
            <h2 className="section-title">
              {props.mode === 'create' ? '新建项目' : '基础信息'}
            </h2>
            <p className="muted">项目创建成功后，后端会自动初始化 workflow instance。</p>
          </div>
        </div>
        <form
          className="form-grid"
          onSubmit={props.mode === 'create' ? handleCreateProject : handleSaveProjectBasics}
        >
          <label className="field">
            <span>项目编号</span>
            <input
              value={formState.code}
              onChange={(event) => updateField('code', event.target.value)}
              placeholder="例如: PROJ-2026-001"
              disabled={props.mode === 'edit'}
            />
          </label>
          <label className="field">
            <span>项目名称</span>
            <input
              value={formState.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="请输入项目名称"
            />
          </label>
          <label className="field">
            <span>负责人</span>
            <select
              value={formState.ownerUserId}
              onChange={(event) => updateField('ownerUserId', event.target.value)}
              disabled={isLoadingUsers}
            >
              <option value="">请选择负责人</option>
              {directoryUsers.map((directoryUser) => (
                <option key={directoryUser.id} value={directoryUser.id}>
                  {directoryUser.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>优先级</span>
            <select
              value={formState.priority}
              onChange={(event) =>
                updateField('priority', event.target.value as ProjectPriority)
              }
            >
              {PROJECT_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>市场</span>
            <input
              value={formState.marketRegion}
              onChange={(event) => updateField('marketRegion', event.target.value)}
              placeholder="例如: 华东 / 东南亚"
            />
          </label>
          <label className="field">
            <span>车型</span>
            <input
              value={formState.vehicleModel}
              onChange={(event) => updateField('vehicleModel', event.target.value)}
              placeholder="例如: 轻卡 A 平台"
            />
          </label>
          <label className="field">
            <span>计划开始日期</span>
            <input
              type="date"
              value={formState.plannedStartDate}
              onChange={(event) => updateField('plannedStartDate', event.target.value)}
            />
          </label>
          <label className="field">
            <span>计划结束日期</span>
            <input
              type="date"
              value={formState.plannedEndDate}
              onChange={(event) => updateField('plannedEndDate', event.target.value)}
            />
          </label>
          <label className="field field-full">
            <span>项目说明</span>
            <textarea
              value={formState.description}
              onChange={(event) => updateField('description', event.target.value)}
              placeholder="补充项目背景、约束和目标。"
              rows={4}
            />
          </label>
          <div className="inline-actions">
            <button type="submit" className="button button-primary" disabled={isSavingProject}>
              {isSavingProject
                ? '提交中…'
                : props.mode === 'create'
                  ? '创建项目'
                  : '保存基础信息'}
            </button>
            {props.mode === 'create' ? (
              <Link href="/projects" className="button button-secondary">
                返回列表
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Project Members</p>
            <h2 className="section-title">项目成员</h2>
            <p className="muted">成员管理独立保存，所有写操作都会记录审计日志。</p>
          </div>
          <button type="button" className="button button-secondary" onClick={addMemberRow}>
            添加成员
          </button>
        </div>
        {memberDrafts.length === 0 ? (
          <div className="empty-state">
            <strong>当前没有额外成员</strong>
            <p>如果不手工添加，后端会至少为负责人创建一个 OWNER 成员记录。</p>
          </div>
        ) : (
          <div className="member-list">
            {memberDrafts.map((member, index) => (
              <div key={`${member.userId}-${member.memberType}-${index}`} className="member-card">
                <label className="field">
                  <span>成员</span>
                  <select
                    value={member.userId}
                    onChange={(event) => updateMemberField(index, 'userId', event.target.value)}
                    disabled={isLoadingUsers}
                  >
                    <option value="">请选择成员</option>
                    {directoryUsers.map((directoryUser) => (
                      <option key={directoryUser.id} value={directoryUser.id}>
                        {directoryUser.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>成员类型</span>
                  <select
                    value={member.memberType}
                    onChange={(event) =>
                      updateMemberField(
                        index,
                        'memberType',
                        event.target.value as ProjectMemberType,
                      )
                    }
                  >
                    {PROJECT_MEMBER_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>岗位说明</span>
                  <input
                    value={member.title}
                    onChange={(event) => updateMemberField(index, 'title', event.target.value)}
                    placeholder="例如: 项目负责人 / 质量评审"
                  />
                </label>
                <label className="field field-checkbox">
                  <span>主成员</span>
                  <input
                    type="checkbox"
                    checked={member.isPrimary}
                    onChange={(event) =>
                      updateMemberField(index, 'isPrimary', event.target.checked)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => removeMember(index)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
        {props.mode === 'edit' ? (
          <div className="inline-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={isSavingMembers}
              onClick={() => void handleSaveMembers()}
            >
              {isSavingMembers ? '保存中…' : '保存成员'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function normalizeMembers(members: MemberDraft[]): ProjectMemberInput[] {
  return members
    .filter((member) => member.userId.trim().length > 0)
    .map((member) => ({
      userId: member.userId,
      memberType: member.memberType,
      title: member.title.trim() || null,
      isPrimary: member.isPrimary,
    }));
}
