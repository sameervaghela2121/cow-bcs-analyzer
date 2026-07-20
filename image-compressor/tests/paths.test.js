const { buildVariantObjectPath } = require('../src/paths');

describe('buildVariantObjectPath', () => {
  it('inserts the variant folder and normalizes the extension to .jpg', () => {
    expect(buildVariantObjectPath('3124/2026-07-16T00-00-00-000Z/cow.png', '300X300')).toBe(
      '3124/2026-07-16T00-00-00-000Z/300X300/cow.jpg'
    );
  });

  it('normalizes to .jpg even when the original already is one', () => {
    expect(buildVariantObjectPath('3124/2026-07-16T00-00-00-000Z/cow.jpg', '600X600')).toBe(
      '3124/2026-07-16T00-00-00-000Z/600X600/cow.jpg'
    );
  });

  it('keeps only the basename, dropping any prior extension, for filenames with dots', () => {
    expect(buildVariantObjectPath('3124/ts/cow.side.view.png', '300X300')).toBe(
      '3124/ts/300X300/cow.side.view.jpg'
    );
  });
});
