export const PROJECT_PAINT_SUPPLIER_VALUES = [
  '巴斯夫',
  '立邦',
  '艾仕得',
  '金力泰',
  '阿克苏诺贝尔',
  '兰陵化工',
] as const;

export type ProjectPaintSupplier = (typeof PROJECT_PAINT_SUPPLIER_VALUES)[number];

export const PROJECT_CREATE_MEMBERS_MAX_COUNT = 50;
