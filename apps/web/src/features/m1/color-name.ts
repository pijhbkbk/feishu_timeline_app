export function displayColorName(projectName: string, colorName?: string | null) {
  return colorName && colorName !== '未关联颜色' ? colorName : projectName;
}
