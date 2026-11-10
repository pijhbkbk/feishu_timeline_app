import { BadRequestException } from '@nestjs/common';
import { identity, object, positiveInt, textField } from '../color-register/color-register.rules';
import { onlyFields } from '../production-facts/production-facts.rules';
import { activityDate } from './inspections.rules';

export function visualDate(value: unknown, required = false) {
  if (!required && (value === '' || value === null || value === undefined)) return null;
  return activityDate(value);
}
export function parseVisualBatch(raw: unknown) {
  const b = object(raw); onlyFields(b, ['operationId', 'items']);
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20) throw new BadRequestException('一次保存1–20辆车。');
  const items = b.items.map(raw => {
    const i = object(raw);
    onlyFields(i, ['id', 'clientId', 'expectedRevision', 'expectedActivityRevision', 'expectedObjectRevision', 'baseId', 'date', 'colorId', 'objectCode', 'vehicleModel', 'productionDate', 'scores', 'conclusion', 'action', 'rectify', 'deadline', 'paintUnit', 'responsibleUnit', 'rectificationUnit']);
    if (!(i.id && i.scores === null) && (!Array.isArray(i.scores) || i.scores.length !== 4)) throw new BadRequestException('每车须原样保留四条评分。');
    const scores = i.scores === null ? null : (i.scores as unknown[]).map((rawLine, index) => {
      const line = object(rawLine); onlyFields(line, ['ordinal', 'values']);
      if (line.ordinal !== index + 1 || !Array.isArray(line.values) || line.values.length !== 5 || line.values.some(v => v !== null && !['A', 'B', 'C', 'D', '/'].includes(v))) throw new BadRequestException('评分须为按序四条、每条五个原值：空白、A、B、C、D或/。');
      return { ordinal: index + 1, values: line.values as (string | null)[] };
    });
    if (i.rectify !== null && typeof i.rectify !== 'boolean') throw new BadRequestException('整改须为人工是、否或未判断。');
    const objectCode = textField(i.objectCode, '车身号', 128, true)!;
    if (objectCode !== objectCode.trim() || [...objectCode].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new BadRequestException('车身号不得含首尾空格或控制字符。');
    return {
      ...(i.id ? { clientId: undefined, id: identity(i.id), expectedRevision: positiveInt(i.expectedRevision, '台次版本'), expectedActivityRevision: positiveInt(i.expectedActivityRevision, '活动版本'), expectedObjectRevision: positiveInt(i.expectedObjectRevision, '车辆版本') } : { id: undefined, expectedRevision: undefined, expectedActivityRevision: undefined, expectedObjectRevision: undefined, clientId: identity(i.clientId, '草稿标识') }),
      baseId: identity(i.baseId, '基地'), date: visualDate(i.date, true)!, colorId: identity(i.colorId, '颜色'), objectCode,
      vehicleModel: textField(i.vehicleModel, '车型', 200), productionDate: visualDate(i.productionDate), scores,
      conclusion: textField(i.conclusion, '人工结论', 4000), action: textField(i.action, '整改说明', 4000), rectify: i.rectify as boolean | null,
      deadline: visualDate(i.deadline), paintUnit: textField(i.paintUnit, '涂装单位', 200), responsibleUnit: textField(i.responsibleUnit, '责任单位', 200), rectificationUnit: textField(i.rectificationUnit, '整改单位', 200),
    };
  });
  const keys = items.map(i => i.id ? `id:${i.id}` : `new:${i.clientId}`);
  if (new Set(keys).size !== keys.length) throw new BadRequestException('同一台次不能重复提交。');
  return { operationId: identity(b.operationId), items };
}
