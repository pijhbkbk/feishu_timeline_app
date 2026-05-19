import React from 'react';
import Link from 'next/link';

type GuideStep = {
  step: number;
  name: string;
  owner: string;
  output: string;
  rule: string;
  key?: 'review' | 'monthly' | 'exit';
};

type GuideStage = {
  title: string;
  summary: string;
  accent: 'primary' | 'success' | 'warning' | 'teal';
  steps: GuideStep[];
};

const guideStages: GuideStage[] = [
  {
    title: '阶段1：需求与颜色开发',
    summary: '从市场需求发起，到开发报告、涂料开发、样板确认和新颜色取号。',
    accent: 'primary',
    steps: [
      {
        step: 1,
        name: '反映市场需求',
        owner: '营销公司',
        output: '客户提供的颜色样板',
        rule: '填写市场需求并启动颜色开发项目。',
      },
      {
        step: 2,
        name: '新颜色开发报告',
        owner: '涂装工艺部',
        output: '新颜色开发需求报告',
        rule: '承接市场需求，明确开发目标和基础资料。',
      },
      {
        step: 3,
        name: '涂料开发',
        owner: '涂装工艺部',
        output: '涂料厂家样板',
        rule: '组织涂料厂家完成样板开发。',
      },
      {
        step: 4,
        name: '样板颜色确认',
        owner: '涂装工艺部',
        output: '面漆颜色确认单',
        rule: '完成后自动并行创建第5步和第6步。',
      },
      {
        step: 5,
        name: '新颜色取号',
        owner: '涂装工艺部',
        output: '色板编号',
        rule: '非阻塞节点，用于完成新颜色编号记录。',
      },
    ],
  },
  {
    title: '阶段2：采购、标准板与试验',
    summary: '围绕涂料采购、标准板制作下发、色板明细和性能试验推进。',
    accent: 'success',
    steps: [
      {
        step: 6,
        name: '涂料采购',
        owner: '采购部',
        output: '涂料采购记录',
        rule: '完成后自动并行创建第7步、第9步和第10步。',
      },
      {
        step: 7,
        name: '标准板制作、下发',
        owner: '涂装工艺部',
        output: '标准色板',
        rule: '承接涂料采购，完成标准板制作和下发。',
      },
      {
        step: 8,
        name: '色板明细更新',
        owner: '涂装工艺部',
        output: '颜色库清单明细',
        rule: '承接标准板制作，维护色板明细。',
      },
      {
        step: 9,
        name: '涂料性能试验',
        owner: '质量管理部',
        output: '性能试验报告',
        rule: '独立进行，不阻塞首台计划、试制和评审主线。',
      },
    ],
  },
  {
    title: '阶段3：试制、评审与批量生产',
    summary: '完成首台计划、样车试制、驾驶室评审、收费、颜色一致性评审和批量生产。',
    accent: 'warning',
    steps: [
      {
        step: 10,
        name: '首台生产计划',
        owner: '生产部 / 涂装厂',
        output: '试制计划',
        rule: '承接第6步涂料采购完成后进入。',
      },
      {
        step: 11,
        name: '样车试制',
        owner: '生产部 / 涂装厂',
        output: '样车',
        rule: '按首台计划完成样车试制记录。',
      },
      {
        step: 12,
        name: '样车驾驶室评审',
        owner: '质量管理部',
        output: '评审报告 / 样车照片',
        rule: '关键节点：不通过时退回第11步并生成新轮次。',
        key: 'review',
      },
      {
        step: 13,
        name: '颜色开发收费',
        owner: '财务部',
        output: '固定金额10000元收费记录',
        rule: '固定金额10000元，跟踪收费凭证和财务确认。',
      },
      {
        step: 14,
        name: '颜色一致性评审',
        owner: '质量管理部',
        output: '颜色一致性评审报告',
        rule: '评审通过后进入排产计划。',
      },
      {
        step: 15,
        name: '排产计划',
        owner: '生产部 / 涂装厂',
        output: '排产计划',
        rule: '承接颜色一致性评审，安排批量生产。',
      },
      {
        step: 16,
        name: '批量生产',
        owner: '生产部 / 涂装厂',
        output: '批量生产记录',
        rule: '完成后进入第17步每月一次的色差一致性评审。',
      },
    ],
  },
  {
    title: '阶段4：月度评审与颜色退出',
    summary: '批量生产后持续12个月月度评审，并基于年产量与人工结论完成颜色退出治理。',
    accent: 'teal',
    steps: [
      {
        step: 17,
        name: '整车色差一致性评审',
        owner: '质量管理部',
        output: '月度色差评审表',
        rule: '关键节点：每月一次，共12个月。',
        key: 'monthly',
      },
      {
        step: 18,
        name: '颜色退出',
        owner: '涂装工艺部',
        output: '颜色整合清单',
        rule: '关键节点：人工录入年产量，系统给出退出建议。',
        key: 'exit',
      },
    ],
  },
];

const businessRules = [
  {
    title: '自动流转',
    marker: '1→2→3',
    copy: '普通主线工序完成后，由后端按冻结规则创建下一步任务。',
  },
  {
    title: '并行工序',
    marker: '4→5+6',
    copy: '第4步完成后，自动并行创建第5步和第6步；第6步完成后，自动并行创建第7步、第9步和第10步。',
  },
  {
    title: '非阻塞工序',
    marker: '9 独立',
    copy: '第9步涂料性能试验独立进行，不阻塞主线继续进入首台计划、样车试制和评审。',
  },
  {
    title: '评审退回',
    marker: '12↩11',
    copy: '第12步样车驾驶室评审不通过时，退回第11步并生成新轮次，历史记录完整保留。',
  },
  {
    title: '固定收费',
    marker: '10000元',
    copy: '第13步颜色开发收费固定金额10000元，需要留存收费状态、凭证和财务确认信息。',
  },
  {
    title: '月度评审与颜色退出',
    marker: '12个月',
    copy: '第16步完成后进入第17步，每月一次共12个月；第18步录入年产量后，系统给出颜色退出建议。',
  },
];

const operationSteps = [
  ['进入工作台', '查看项目总览、逾期、本月评审和颜色退出风险。'],
  ['新建项目', '填写颜色名称、客户、车型、开始时间等基础信息。'],
  ['查看项目看板', '横向查看项目18个流程节点。'],
  ['点击工序节点', '打开工序详情，查看负责人、责任部门、截止时间、材料和流转记录。'],
  ['提交材料', '上传颜色样板、开发报告、评审报告、收费凭证、月度评审表等材料。'],
  ['完成工序或提交评审', '普通工序点击完成；第12步选择通过或不通过。'],
  ['处理月度评审', '批量生产后，在第17步台账中按月完成整车色差一致性评审。'],
  ['查看数据中心', '查看项目进度、工序效率、返工、月度评审和颜色退出统计。'],
];

const roleGuides = [
  {
    role: '营销公司',
    badge: '营销',
    copy: '发起市场需求、提交客户颜色样板、跟踪颜色开发收费。',
    entry: '新建项目｜项目看板',
  },
  {
    role: '涂装工艺部',
    badge: '工艺',
    copy: '涂料开发、样板确认、标准板制作、色板明细、颜色一致性评审。',
    entry: '我的待办｜工序清单',
  },
  {
    role: '采购部',
    badge: '采购',
    copy: '负责涂料采购和采购材料提交。',
    entry: '我的待办｜材料中心',
  },
  {
    role: '质量管理部',
    badge: '质量',
    copy: '涂料性能试验、样车驾驶室评审、整车色差一致性评审。',
    entry: '评审任务｜月度评审',
  },
  {
    role: '生产部 / 涂装厂',
    badge: '生产',
    copy: '首台生产计划、样车试制、排产计划、批量生产。',
    entry: '项目看板｜工序清单',
  },
  {
    role: '财务部',
    badge: '财务',
    copy: '颜色开发收费确认。',
    entry: '开发费用｜数据中心',
  },
];

const materialHints = [
  ['1 反映市场需求', '客户提供的颜色样板', '项目材料库'],
  ['2 新颜色开发报告', '新颜色开发需求报告', '开发报告'],
  ['4 样板颜色确认', '面漆颜色确认单', '评审材料'],
  ['9 涂料性能试验', '性能试验报告', '试验报告'],
  ['12 样车驾驶室评审', '评审报告、样车照片', '评审记录'],
  ['13 颜色开发收费', '收费凭证', '费用凭证'],
  ['17 整车色差评审', '月度色差评审表', '月度台账'],
  ['18 颜色退出', '年产量记录、颜色整合清单', '退出治理'],
];

const quickLinks: Array<[string, string, string]> = [
  ['进入工作台', '/dashboard', '查看项目总览与待办'],
  ['查看项目看板', '/projects/timeline', '查看18个流程节点'],
  ['新建项目', '/projects/new', '发起颜色开发流程'],
  ['查看我的待办', '/tasks/my', '处理分配给我的工序'],
  ['进入材料中心', '/materials', '提交和归档材料'],
  ['查看月度评审', '/monthly-reviews', '处理第17步台账'],
  ['进入数据中心', '/analytics', '查看统计与风险'],
];

const faqs = [
  [
    '为什么完成第4步后出现两个任务？',
    '第4步样板颜色确认完成后，系统会按冻结规则自动并行创建第5步新颜色取号和第6步涂料采购。',
  ],
  [
    '第9步没完成，为什么还能继续主线？',
    '第9步涂料性能试验周期较长，规则上独立进行，不阻塞首台计划、样车试制和后续主线。',
  ],
  [
    '第12步评审不通过怎么办？',
    '第12步样车驾驶室评审不通过时，系统退回第11步样车试制并生成新轮次，整改要求和退回原因会保留。',
  ],
  ['颜色开发收费金额是多少？', '第13步颜色开发收费固定金额为10000元。'],
  [
    '第17步为什么有12个月？',
    '第16步批量生产完成后，需要连续12个月开展整车色差一致性评审，用于观察批产后的颜色稳定性。',
  ],
  [
    '颜色退出由谁决定？',
    '系统会根据人工录入的年产量给出退出建议，最终仍由业务责任人录入人工结论并留存原因。',
  ],
];

export function SystemGuidePage() {
  return (
    <div className="system-guide-page" data-testid="system-guide-page">
      <nav className="guide-anchor-nav" aria-label="系统导览锚点" data-testid="guide-page">
        <a href="#guide-flow">流程说明</a>
        <a href="#guide-operation">操作步骤</a>
        <a href="#guide-roles">角色指南</a>
        <a href="#guide-faq">常见问题</a>
      </nav>

      <section className="guide-hero">
        <div className="guide-hero-copy">
          <p className="eyebrow">流程导览</p>
          <h2>轻卡定制颜色开发项目管理系统</h2>
          <p>
            从市场需求、颜色开发、样车评审、批量生产，到月度色差评审和颜色退出，全流程在线管理。
          </p>
          <div className="guide-action-row">
            <Link href="/dashboard" className="button button-primary">
              进入工作台
            </Link>
            <Link href="/projects/new" className="button button-secondary">
              新建项目
            </Link>
            <Link href="/projects/timeline" className="button button-secondary">
              查看项目看板
            </Link>
          </div>
        </div>
        <div className="guide-hero-panel" aria-label="颜色开发全生命周期">
          {['需求', '开发', '采购', '试制', '评审', '生产', '月评', '退出'].map((item, index) => (
            <span key={item} className="guide-lifecycle-step">
              <small>{String(index + 1).padStart(2, '0')}</small>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="guide-section" id="guide-flow">
        <div className="section-header">
          <div>
            <p className="eyebrow">流程说明</p>
            <h2 className="section-title">轻卡定制颜色开发流程</h2>
          </div>
          <p className="muted">18个工序分为4个阶段，关键节点会影响退回、周期评审和颜色退出治理。</p>
        </div>
        <div className="guide-stage-grid">
          {guideStages.map((stage, index) => (
            <article key={stage.title} className={`guide-stage-card guide-stage-${stage.accent}`}>
              <div className="guide-stage-heading">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{stage.title}</h3>
              </div>
              <p>{stage.summary}</p>
              <ol className="guide-stage-list">
                {stage.steps.map((step) => (
                  <li key={step.step} className={step.key ? `guide-key-step guide-key-${step.key}` : undefined}>
                    <span>{step.step}</span>
                    <strong>{step.name}</strong>
                    {step.key ? <em>{getKeyLabel(step.key)}</em> : null}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>

        <details className="guide-details" open>
          <summary>展开或收起18步详细清单</summary>
          <div className="guide-step-detail-grid">
            {guideStages.flatMap((stage) =>
              stage.steps.map((step) => (
                <article key={step.step} className={step.key ? `guide-step-detail guide-key-${step.key}` : 'guide-step-detail'}>
                  <span className="guide-step-number">第{step.step}步</span>
                  <h3>{step.name}</h3>
                  <dl>
                    <div>
                      <dt>责任部门</dt>
                      <dd>{step.owner}</dd>
                    </div>
                    <div>
                      <dt>输出物</dt>
                      <dd>{step.output}</dd>
                    </div>
                    <div>
                      <dt>规则</dt>
                      <dd>{step.rule}</dd>
                    </div>
                  </dl>
                </article>
              )),
            )}
          </div>
        </details>
      </section>

      <section className="guide-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">业务规则</p>
            <h2 className="section-title">关键业务规则</h2>
          </div>
          <p className="muted">以下规则由后端流程控制，前端页面只负责展示、输入和操作入口。</p>
        </div>
        <div className="guide-rule-grid">
          {businessRules.map((rule) => (
            <article key={rule.title} className="guide-rule-card">
              <span>{rule.marker}</span>
              <h3>{rule.title}</h3>
              <p>{rule.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section" id="guide-operation">
        <div className="section-header">
          <div>
            <p className="eyebrow">操作步骤</p>
            <h2 className="section-title">如何使用本系统</h2>
          </div>
          <p className="muted">从进入工作台到查看数据中心，用8步完成日常项目操作。</p>
        </div>
        <ol className="guide-operation-list">
          {operationSteps.map(([title, copy], index) => (
            <li key={title}>
              <span>{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section" id="guide-roles">
        <div className="section-header">
          <div>
            <p className="eyebrow">角色指南</p>
            <h2 className="section-title">各角色怎么使用</h2>
          </div>
          <p className="muted">不同部门优先关注自己的工序、材料和待办入口。</p>
        </div>
        <div className="guide-role-grid">
          {roleGuides.map((item) => (
            <article key={item.role} className="guide-role-card">
              <span>{item.badge}</span>
              <h3>{item.role}</h3>
              <p>{item.copy}</p>
              <strong>{item.entry}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">材料归档</p>
            <h2 className="section-title">关键材料提交说明</h2>
          </div>
          <p className="muted">材料中心按项目、工序、材料类型、版本和状态归档，不直接存储附件二进制。</p>
        </div>
        <div className="guide-material-table" role="table" aria-label="关键材料提交说明">
          <div className="guide-material-row guide-material-head" role="row">
            <span role="columnheader">工序</span>
            <span role="columnheader">必交材料</span>
            <span role="columnheader">归档位置</span>
          </div>
          {materialHints.map(([node, material, target]) => (
            <div key={node} className="guide-material-row" role="row">
              <span role="cell">{node}</span>
              <span role="cell">{material}</span>
              <span role="cell">{target}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section guide-quick-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">快速入口</p>
            <h2 className="section-title">现在开始管理颜色开发项目</h2>
          </div>
          <p className="muted">从导览页直接进入日常使用的核心功能区。</p>
        </div>
        <div className="guide-quick-grid">
          {quickLinks.map(([label, href, description]) => (
            <Link key={href} href={href} className="guide-quick-link">
              <span>{label}</span>
              <small>{description}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="guide-section" id="guide-faq">
        <div className="section-header">
          <div>
            <p className="eyebrow">常见问题</p>
            <h2 className="section-title">容易误解的流程点</h2>
          </div>
        </div>
        <div className="guide-faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question} open>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function getKeyLabel(key: NonNullable<GuideStep['key']>) {
  switch (key) {
    case 'review':
      return '关键评审';
    case 'monthly':
      return '12个月';
    case 'exit':
      return '退出治理';
  }
}
