import { describe, expect, it } from 'vitest';

import { dataSourceItemsZh, dataSourceLabelZh } from './dataSourceLabels';

describe('Chinese data-source selector labels', () => {
  it('keeps stored values while translating every supported source family', () => {
    expect(dataSourceItemsZh(['manual', 'Analytical', 'ExistingProject', 'CSV'])).toEqual([
      { value: 'manual', label: '手動輸入' },
      { value: 'Analytical', label: '解析計算' },
      { value: 'ExistingProject', label: '既有專案' },
      { value: 'CSV', label: 'CSV 檔案' },
    ]);
    expect(dataSourceLabelZh('unknown-future-source')).toBe('unknown-future-source');
  });
});
