const MilkingRecord = require('../../src/models/MilkingRecord');

describe('MilkingRecord indexes', () => {
  it('has compound indexes on {cow, milkSessionAt, _id} and {cowGroup, milkSessionAt, _id}', () => {
    // _id trails both indexes as a pagination tiebreaker - without it,
    // Mongo's sort is unstable across the many records that share the same
    // milkSessionAt (a whole shift/day), and skip/limit paging can
    // duplicate or drop rows across pages (Finding 1).
    const indexKeys = MilkingRecord.schema.indexes().map(([keys]) => keys);
    expect(indexKeys).toContainEqual({ cow: 1, milkSessionAt: 1, _id: 1 });
    expect(indexKeys).toContainEqual({ cowGroup: 1, milkSessionAt: 1, _id: 1 });
  });
});
