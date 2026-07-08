import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd } from './table.utils';

describe('table.utils', () => {
  const items = [
    { name: 'Banana', amount: 200 },
    { name: 'Apple', amount: 100 },
    { name: 'Cherry', amount: 300 },
  ];

  describe('sortData', () => {
    it('should return items unchanged when no column', () => {
      expect(sortData(items, '', 'asc')).toEqual(items);
    });

    it('should sort strings ascending', () => {
      const sorted = sortData(items, 'name', 'asc');
      expect(sorted.map(i => i.name)).toEqual(['Apple', 'Banana', 'Cherry']);
    });

    it('should sort strings descending', () => {
      const sorted = sortData(items, 'name', 'desc');
      expect(sorted.map(i => i.name)).toEqual(['Cherry', 'Banana', 'Apple']);
    });

    it('should sort numbers ascending', () => {
      const sorted = sortData(items, 'amount', 'asc');
      expect(sorted.map(i => i.amount)).toEqual([100, 200, 300]);
    });

    it('should sort numbers descending', () => {
      const sorted = sortData(items, 'amount', 'desc');
      expect(sorted.map(i => i.amount)).toEqual([300, 200, 100]);
    });

    it('should not mutate the original array', () => {
      const original = [...items];
      sortData(items, 'name', 'asc');
      expect(items).toEqual(original);
    });

    it('should sort date column using toMillis', () => {
      const dateItems = [
        { date: { toMillis: () => 2000 } },
        { date: { toMillis: () => 1000 } },
        { date: { toMillis: () => 3000 } },
      ];
      const sorted = sortData(dateItems, 'date', 'asc');
      expect(sorted.map(i => i.date.toMillis())).toEqual([1000, 2000, 3000]);
    });
  });

  describe('toggleSortState', () => {
    it('should flip direction when same column clicked', () => {
      const state = toggleSortState({ column: 'name', direction: 'asc' }, 'name');
      expect(state).toEqual({ column: 'name', direction: 'desc' });
    });

    it('should flip desc to asc', () => {
      const state = toggleSortState({ column: 'name', direction: 'desc' }, 'name');
      expect(state).toEqual({ column: 'name', direction: 'asc' });
    });

    it('should reset to asc for new column', () => {
      const state = toggleSortState({ column: 'name', direction: 'desc' }, 'amount');
      expect(state).toEqual({ column: 'amount', direction: 'asc' });
    });
  });

  describe('getSortIndicator', () => {
    it('should return up arrow for active asc', () => {
      expect(getSortIndicator('name', 'asc', 'name')).toBe('↑');
    });

    it('should return down arrow for active desc', () => {
      expect(getSortIndicator('name', 'desc', 'name')).toBe('↓');
    });

    it('should return bidirectional for inactive column', () => {
      expect(getSortIndicator('name', 'asc', 'amount')).toBe('↕');
    });
  });

  describe('paginate', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('should return first page', () => {
      expect(paginate(data, 1, 3)).toEqual([1, 2, 3]);
    });

    it('should return second page', () => {
      expect(paginate(data, 2, 3)).toEqual([4, 5, 6]);
    });

    it('should return partial last page', () => {
      expect(paginate(data, 4, 3)).toEqual([10]);
    });

    it('should return empty for out-of-range page', () => {
      expect(paginate(data, 5, 3)).toEqual([]);
    });

    it('should handle empty array', () => {
      expect(paginate([], 1, 10)).toEqual([]);
    });
  });

  describe('totalPages', () => {
    it('should return 1 for 0 items', () => {
      expect(totalPages(0, 10)).toBe(1);
    });

    it('should return 1 when items fit on one page', () => {
      expect(totalPages(5, 10)).toBe(1);
    });

    it('should round up for partial page', () => {
      expect(totalPages(11, 10)).toBe(2);
    });

    it('should handle exact multiples', () => {
      expect(totalPages(20, 10)).toBe(2);
    });
  });

  describe('pageStart', () => {
    it('should return 0 for empty list', () => {
      expect(pageStart(0, 1, 10)).toBe(0);
    });

    it('should return 1 for first page', () => {
      expect(pageStart(100, 1, 20)).toBe(1);
    });

    it('should return 21 for second page with pageSize 20', () => {
      expect(pageStart(100, 2, 20)).toBe(21);
    });
  });

  describe('pageEnd', () => {
    it('should return pageSize for first full page', () => {
      expect(pageEnd(100, 1, 20)).toBe(20);
    });

    it('should return itemCount for last partial page', () => {
      expect(pageEnd(15, 2, 10)).toBe(15);
    });

    it('should not exceed itemCount', () => {
      expect(pageEnd(5, 1, 10)).toBe(5);
    });
  });
});
