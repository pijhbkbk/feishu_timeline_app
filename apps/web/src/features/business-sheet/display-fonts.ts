/**
 * Resolve the observed localized-name mismatch without rewriting workbook styles.
 * On the affected Mac, CSS "等线" falls back to Songti SC (whose bold glyphs are
 * broken), while local("DengXian-Regular") resolves the installed correct face.
 * Only installed fonts are used; no proprietary font bytes are distributed.
 */
let prepared: Promise<void> | undefined;
export function prepareDisplayFonts(): Promise<void> {
  return prepared ||= (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const candidates = [
      { regular: 'local("DengXian-Regular"), local("DengXian")', bold: 'local("DengXian-Bold"), local("DengXian Bold")' },
      { regular: 'local("MicrosoftYaHei"), local("Microsoft YaHei")', bold: 'local("MicrosoftYaHei-Bold"), local("Microsoft YaHei Bold")' },
      { regular: 'local("PingFangSC-Regular"), local("PingFang SC Regular")', bold: 'local("PingFangSC-Semibold"), local("PingFang SC Semibold")' },
      { regular: 'local("NotoSansCJKsc-Regular"), local("Noto Sans CJK SC")', bold: 'local("NotoSansCJKsc-Bold"), local("Noto Sans CJK SC Bold")' },
    ];
    for (const candidate of candidates) {
      const regular = new FontFace('等线', candidate.regular, { style: 'normal', weight: '400' });
      try { await regular.load(); } catch { continue; }
      document.fonts.add(regular);
      const bold = new FontFace('等线', candidate.bold, { style: 'normal', weight: '700' });
      try { await bold.load(); document.fonts.add(bold); } catch { /* The browser synthesizes bold from the resolved regular face. */ }
      break;
    }
    // This is awaited before any Univer layout or measurement cache is created.
    await document.fonts.ready;
  })();
}
