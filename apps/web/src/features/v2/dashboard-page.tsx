'use client';

import Link from 'next/link';

import { CheckIcon } from './icons';
import { useR26PrototypeStore } from './prototype-store';
import { Fact, PageIntro, PrimaryLink, StatusPill } from './ui';

const stages = ['需求立项', '开发确认', '采购与验证', '试制评审', '批量生产', '退出跟踪'];

export function DashboardPage() {
  const { progressSubmitted, recentActivities } = useR26PrototypeStore();

  return (
    <div className="r26-page r26-dashboard-page" data-testid="r26-dashboard">
      <PageIntro
        eyebrow="今天 · 采购部"
        title="张七巧，今天先把这一步推进。"
        description={
          progressSubmitted
            ? '涂料采购进展已记录，项目下一项已进入首台生产计划。'
            : '当前只有一项必须优先处理：为深海蓝项目补齐采购到货证据。'
        }
      />

      <section className={`r26-current-task ${progressSubmitted ? 'is-complete' : ''}`}>
        <div className="r26-current-task__main">
          <div className="r26-current-task__topline">
            <StatusPill tone={progressSubmitted ? 'completed' : 'current'}>
              {progressSubmitted ? '本次进展已完成' : '当前任务'}
            </StatusPill>
            <span>今天 17:00 截止</span>
          </div>
          <div className="r26-current-task__heading">
            <span className="r26-color-swatch" style={{ background: '#1f4e79' }} aria-label="深海蓝色样" />
            <div>
              <p>深海蓝 · 第 06 步</p>
              <h2>{progressSubmitted ? '涂料采购进展已提交' : '完成涂料采购到货确认'}</h2>
            </div>
          </div>
          <p className="r26-current-task__summary">
            {progressSubmitted
              ? '提交记录已写入本地原型会话，地图中的采购节点同步完成。'
              : '采购订单和供应商送货单已经齐备，还缺一份到货确认记录。'}
          </p>

          <div className="r26-current-task__facts">
            <Fact label="负责人" value="张七巧" note="采购部" />
            <Fact label="材料" value={progressSubmitted ? '3 / 3' : '2 / 3'} note={progressSubmitted ? '已齐备' : '缺到货确认记录'} />
            <Fact label="项目进度" value={progressSubmitted ? '8 / 18' : '7 / 18'} note="固定流程节点" />
            <Fact label="阻塞" value="无" note="可直接推进" />
          </div>

          <div className="r26-current-task__action">
            {progressSubmitted ? (
              <PrimaryLink href="/v2/projects/demo-r26?taskId=t006" testId="dashboard-primary-action">
                查看项目工作区
              </PrimaryLink>
            ) : (
              <PrimaryLink
                href="/v2/progress?projectId=demo-r26&taskId=t006"
                testId="dashboard-primary-action"
              >
                提交工作进展
              </PrimaryLink>
            )}
            <p>预计用时 60 秒</p>
          </div>
        </div>

        <aside className="r26-current-task__side" aria-label="项目六阶段进度">
          <div>
            <p className="r26-eyebrow">六阶段进度</p>
            <strong>{progressSubmitted ? '采购完成，准备生产计划' : '当前在采购与验证阶段'}</strong>
          </div>
          <ol>
            {stages.map((stage, index) => {
              const complete = index < (progressSubmitted ? 3 : 2);
              const current = index === (progressSubmitted ? 3 : 2);
              return (
                <li key={stage} className={complete ? 'is-complete' : current ? 'is-current' : undefined}>
                  <span>{complete ? <CheckIcon /> : index + 1}</span>
                  <div>
                    <strong>{stage}</strong>
                    <small>{complete ? '已完成' : current ? '进行中' : '未开始'}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>

      <section className="r26-kpi-grid" aria-label="今日工作摘要">
        <Fact label="我的待办" value={progressSubmitted ? '2' : '3'} note="按优先级排列" />
        <Fact
          label="今天到期"
          value={progressSubmitted ? '0' : '1'}
          note={progressSubmitted ? '今日任务已按时完成' : '采购到货确认'}
        />
        <Fact label="待我评审" value="1" note="驾驶室评审第 2 轮" />
        <Fact label="材料缺口" value={progressSubmitted ? '1' : '2'} note="跨两个项目" />
      </section>

      <section className="r26-dashboard-lower">
        <div className="r26-card r26-next-task">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">下一项</p>
              <h2>首台生产计划</h2>
            </div>
            <StatusPill tone="neutral">待开始</StatusPill>
          </div>
          <p>采购工序完成后，由赵知行确认首台排产时间与生产资源。</p>
          <dl>
            <div><dt>项目</dt><dd>深海蓝</dd></div>
            <div><dt>负责人</dt><dd>赵知行 · 生产部</dd></div>
            <div><dt>计划截止</dt><dd>7月26日</dd></div>
          </dl>
        </div>

        <div className="r26-card r26-activity-card">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">最近动态</p>
              <h2>与你相关的更新</h2>
            </div>
            <Link href="/v2/projects/demo-r26">打开项目</Link>
          </div>
          <ul>
            {recentActivities.slice(0, 4).map((activity, index) => (
              <li key={`${activity.time}-${index}`}>
                <span aria-hidden="true" />
                <div>
                  <strong>{activity.text}</strong>
                  <small>{activity.time}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
