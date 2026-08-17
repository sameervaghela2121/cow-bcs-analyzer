const MilkingRecord = require('../../src/models/MilkingRecord');

describe('MilkingRecord indexes', () => {
  it('has compound indexes on {cow, milkSessionAt} and {cowGroup, milkSessionAt}', () => {
    const indexKeys = MilkingRecord.schema.indexes().map(([keys]) => keys);
    expect(indexKeys).toContainEqual({ cow: 1, milkSessionAt: 1 });
    expect(indexKeys).toContainEqual({ cowGroup: 1, milkSessionAt: 1 });
  });
});
