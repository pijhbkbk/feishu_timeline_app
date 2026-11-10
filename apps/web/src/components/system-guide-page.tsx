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
        rule: '同一开发轮次首次有效到货日起算6个日历月，月末取目标月最后一天，后续到货不重置；不阻塞首台计划、试制和评审主线。',
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
        rule: '通过后进入排产计划；不通过时由外饰件厂家整改，登记整改完成后重新进行整车复审。',
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
        rule: '完成后进入第17步，按实际抽检日期登记色差一致性评审。',
      },
    ],
  },
  {
    title: '阶段4：实际周评、年度复核与颜色退出',
    summary: '批量生产后记录实际抽检，核对月度产量和年度复核结果，再处理颜色退出。',
    accent: 'teal',
    steps: [
      {
        step: 17,
        name: '整车色差一致性评审',
        owner: '质量管理部',
        output: '实际抽检评审记录',
        rule: '按实际抽检日期记录，一场可包含多色和多车；未抽检颜色不产生评审逾期。历史固定月期次保留原范围。',
        key: 'monthly',
      },
      {
        step: 18,
        name: '颜色退出',
        owner: '涂装工艺部',
        output: '颜色整合清单',
        rule: '先核对颜色档案的年度窗口及完整产量，再由业务成员记录退出结论与原因；未知数量或缺月保持待跟进。',
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
    title: '驾驶室整改',
    marker: '12↩11',
    copy: '第12步样车驾驶室评审不通过时，退回第11步并生成新轮次，历史记录完整保留。',
  },
  {
    title: '外饰件整改',
    marker: '14 整车复审',
    copy: '第14步不通过时，外饰件厂家整改完成后重新进行整车复审；保留有效的驾驶室评审、标准、颜色及收费历史。',
  },
  {
    title: '固定收费',
    marker: '10000元',
    copy: '第13步颜色开发收费固定金额10000元，需要留存收费状态、凭证和财务确认信息。',
  },
  {
    title: '按实际日期周评',
    marker: '实际抽检',
    copy: '周评记录实际抽检日期、车辆、颜色和人员；未抽检颜色不产生评审逾期。已有历史月期次保持原有记录和范围。',
  },
  {
    title: '年度产量复核',
    marker: '首尾13个月',
    copy: '2026-09入清单的颜色在2027-10复核，统计2026-09至2027-09，首尾都计入。累计恰好20台继续保留，低于20台进入退出评审；缺月或未知数量保持待跟进。',
  },
];

const operationSteps = [
  ['进入工作台', '查看项目流程、当前待办、实际评审和颜色复核提醒。'],
  ['新建项目', '填写颜色名称、客户、车型、开始时间等基础信息。'],
  ['查看项目看板', '横向查看项目18个流程节点。'],
  ['点击工序节点', '打开工序详情，查看负责人、责任部门、截止时间、材料和流转记录。'],
  ['提交材料', '上传颜色样板、开发报告、评审报告、收费凭证和试验报告等材料。'],
  ['完成工序或提交评审', '普通工序点击完成；第12步选择通过或不通过。'],
  ['记录实际周评', '按实际抽检日期登记多色、多车和人员，并在需要时明确关联项目与评审。'],
  ['核对产量与年度复核', '按颜色、基地、车型和月份维护产量，核对唯一计数口径及颜色档案中的年度窗口。'],
];

const roleGuides = [
  {
    role: '工作台',
    badge: '流程',
    copy: '从项目流程和当前待办进入工序，完成操作后返回原项目。',
    entry: '工作台',
  },
  {
    role: '颜色项目',
    badge: '项目',
    copy: '创建和维护项目、材料、试制及两类整改，保留每轮评审历史。',
    entry: '颜色项目',
  },
  {
    role: '颜色清单与工作簿',
    badge: '表格',
    copy: '自由编辑、保存和恢复工作簿；明确映射与校验后再应用到业务记录。',
    entry: '颜色清单',
  },
  {
    role: '周评',
    badge: '抽检',
    copy: '按实际日期维护车辆、颜色、测量和检验人员，同一场活动可记录多色。',
    entry: '周评',
  },
  {
    role: '产量统计',
    badge: '产量',
    copy: '更正原记录的台数，明确选择车型明细或月总量口径；空白未知与0分开保留。',
    entry: '产量统计',
  },
  {
    role: '人员库',
    badge: '人员',
    copy: '直接维护人员档案及岗位说明，保留历史作者；同名人员不自动合并。',
    entry: '人员库',
  },
];

const materialHints = [
  ['1 反映市场需求', '客户提供的颜色样板', '项目材料库'],
  ['2 新颜色开发报告', '新颜色开发需求报告', '开发报告'],
  ['4 样板颜色确认', '面漆颜色确认单', '评审材料'],
  ['9 涂料性能试验', '性能试验报告', '试验报告'],
  ['12 样车驾驶室评审', '评审报告、样车照片', '评审记录'],
  ['13 颜色开发收费', '收费凭证', '费用凭证'],
  ['17 整车色差评审', '实际抽检评审记录及附件', '周评与评审记录'],
  ['18 颜色退出', '年度复核依据、退出结论与颜色整合清单', '颜色档案与退出记录'],
];

const quickLinks: Array<[string, string, string]> = [
  ['进入工作台', '/dashboard', '查看项目总览与待办'],
  ['查看颜色项目', '/projects', '查看项目和18个流程节点'],
  ['新建项目', '/projects/new', '发起颜色开发流程'],
  ['打开颜色清单', '/admin/color-database', '编辑工作簿或查看正式颜色记录'],
  ['记录实际周评', '/inspections', '维护实际抽检、车辆与检验人员'],
  ['核对产量', '/production', '维护月度产量和统计口径'],
  ['维护人员库', '/admin/people', '直接维护人员档案'],
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
    '没有抽检的颜色会产生周评逾期吗？',
    '不会。按实际抽检登记周评，一场可包含多色和多车；未抽检颜色不产生评审逾期。已有历史固定月期次仍按原范围处理。',
  ],
  [
    '半年性能试验从哪天起算？',
    '从同一开发轮次首次有效到货日起算6个日历月，遇月末取目标月最后一天，后续到货不重置期限。',
  ],
  [
    '颜色退出由谁决定？',
    '先核对颜色档案给出的统计窗口与完整月度产量。累计恰好20台继续保留，低于20台进入退出评审；缺月或未知量保持待跟进。退出结论由业务成员明确记录并留存原因。',
  ],
];

export function SystemGuidePage() {
  return (
    <div className="system-guide-page" data-testid="system-guide-page">
      <nav className="guide-anchor-nav" aria-label="系统导览锚点" data-testid="guide-page">
        <a href="#guide-flow">流程说明</a>
        <a href="#guide-operation">操作步骤</a>
        <a href="#guide-roles">共同维护</a>
        <a href="#guide-faq">常见问题</a>
      </nav>

      <section className="guide-hero">
        <div className="guide-hero-copy">
          <p className="eyebrow">流程导览</p>
          <h2>轻卡定制颜色开发项目管理系统</h2>
          <p>
            涂装工艺部获准成员在同一界面维护颜色、项目、工作簿、实际周评、人员和产量。
          </p>
          <div className="guide-action-row">
            <Link href="/dashboard" className="button button-primary">
              进入工作台
            </Link>
            <Link href="/projects/new" className="button button-secondary">
              新建项目
            </Link>
            <Link href="/projects" className="button button-secondary">
              查看项目看板
            </Link>
          </div>
        </div>
        <div className="guide-hero-panel" aria-label="颜色开发全生命周期">
          {['需求', '开发', '采购', '试制', '评审', '生产', '周评', '复核'].map((item, index) => (
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
                      <dt>业务协作方</dt>
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
          <p className="muted">从进入工作台到核对产量与复核，用8步完成日常操作。</p>
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
            <p className="eyebrow">共同维护</p>
            <h2 className="section-title">涂装工艺部如何共同维护</h2>
          </div>
          <p className="muted">获准成员使用相同入口；具体操作仍受当前负责人、账号资格和记录状态约束。流程中的业务协作方不代表需要切换账号角色。</p>
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
          <p className="muted">从原项目或工序提交材料，按材料类型、版本和状态查看原件与历史。</p>
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
      return '实际抽检';
    case 'exit':
      return '退出治理';
  }
}
