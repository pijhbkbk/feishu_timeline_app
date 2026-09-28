export type R26BusinessRecordAction = {
  href: string;
  label: string;
  guidance: string;
};

export function getR26BusinessRecordAction(
  nodeCode: string,
  projectId: string,
): R26BusinessRecordAction | null {
  const pages: Record<string, [string, string, string]> = {
    DEVELOPMENT_REPORT: ['development-report', '填写开发报告', '保存开发报告并补齐本工序材料后，返回进行完成检查。'],
    PAINT_DEVELOPMENT: ['samples', '登记开发样件', '登记本轮开发样件，记录供应商和颜色信息。'],
    SAMPLE_COLOR_CONFIRMATION: ['samples', '确认颜色样件', '核对本轮样件和确认结论，再完成本工序。'],
    PAINT_PROCUREMENT: ['paint-procurement', '办理油漆采购', '记录采购订单与到货结果，保留对应材料。'],
    PERFORMANCE_TEST: ['performance-tests', '登记性能试验', '填写试验指标与结论，补齐试验报告。'],
    STANDARD_BOARD_PRODUCTION: ['standard-boards', '制作与管理标准板', '登记标准板及制作材料。'],
    BOARD_DETAIL_UPDATE: ['standard-boards', '更新标准板明细', '核对标准板和发放明细后，返回进行完成检查。'],
    TRIAL_PRODUCTION: ['pilot-production', '记录首台生产', '登记本轮试制记录、问题及验证结果。'],
    CAB_REVIEW: ['reviews', '办理驾驶室评审', '填写评审记录、材料和通过或退回结论。'],
    DEVELOPMENT_ACCEPTANCE: ['fees', '办理开发收费', '登记开发收费与记账结果。'],
    COLOR_CONSISTENCY_REVIEW: ['reviews', '办理一致性评审', '填写本轮一致性评审结论。'],
    MASS_PRODUCTION_PLAN: ['production-plans', '办理排产计划', '填写并确认排产计划。'],
    MASS_PRODUCTION: ['mass-production', '登记批量生产', '登记批量生产记录与完成结果。'],
    VISUAL_COLOR_DIFFERENCE_REVIEW: ['color-evaluation', '办理月度评审', '选择本人已领取且到期的月份进行评审。'],
    PROJECT_CLOSED: ['color-exit', '办理颜色退出', '核对主链路与月度记录后提交人工决定。'],
  };
  const entry = pages[nodeCode];
  if (entry) return { href: `/projects/${encodeURIComponent(projectId)}/${entry[0]}`, label: entry[1], guidance: entry[2] };
  if (nodeCode !== 'FIRST_UNIT_PRODUCTION_PLAN') return null;

  return {
    href: `/projects/${encodeURIComponent(projectId)}/pilot-production`,
    label: '新建并确认首台生产计划',
    guidance:
      '先新建首台生产计划，再在计划列表中点击“确认”。完成后返回项目工作区重新检查。',
  };
}
