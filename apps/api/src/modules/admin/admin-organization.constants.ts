export const BUSINESS_DIVISIONS = [
  { code: 'BU_TECHNOLOGY', name: '技术中心' },
  { code: 'BU_COMMERCIAL_VEHICLE_MARKETING', name: '商用车营销事业部' },
  { code: 'BU_PASSENGER_VEHICLE_MARKETING', name: '乘用车营销事业部' },
  { code: 'BU_MANUFACTURING', name: '制造中心' },
  { code: 'BU_INTERNATIONAL', name: '国际事业部' },
  { code: 'BU_PROCUREMENT', name: '采购中心' },
] as const;

export const BUSINESS_DIVISION_CODES = BUSINESS_DIVISIONS.map(
  (division) => division.code,
);

const BUSINESS_DIVISION_BY_CODE: ReadonlyMap<string, string> = new Map(
  BUSINESS_DIVISIONS.map((division) => [division.code, division.name]),
);

export function isBusinessDivision(department: {
  code: string;
  name: string;
}): boolean {
  return BUSINESS_DIVISION_BY_CODE.get(department.code) === department.name;
}
