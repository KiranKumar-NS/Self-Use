/**
 * Tests for NotificationService.
 * Tests notification generation logic: overdue loans, tasks, budget alerts.
 */

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(),
  query: vi.fn(), orderBy: vi.fn(), where: vi.fn(), limit: vi.fn(),
  startAfter: vi.fn(), writeBatch: vi.fn(), runTransaction: vi.fn(),
  serverTimestamp: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(),
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
  },
  DocumentSnapshot: class {},
}));

vi.mock('@angular/fire/auth', () => ({
  Auth: class {},
  onAuthStateChanged: vi.fn(),
}));

const mockLoanService = {
  getAll: vi.fn().mockResolvedValue({ loans: [] }),
};
const mockTaskService = {
  getAll: vi.fn().mockResolvedValue([]),
};
const mockSegmentService = {
  getAll: vi.fn().mockResolvedValue([]),
};
const mockSummaryService = {
  getForMonth: vi.fn().mockResolvedValue([]),
};

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual as any,
    inject: vi.fn((token: any) => {
      const name = token?.name || '';
      if (name === 'LoanService') return mockLoanService;
      if (name === 'TaskService') return mockTaskService;
      if (name === 'SegmentService') return mockSegmentService;
      if (name === 'SummaryService') return mockSummaryService;
      return {};
    }),
  };
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    localStorageMock.clear();
    vi.clearAllMocks();
    mockLoanService.getAll.mockResolvedValue({ loans: [] });
    mockTaskService.getAll.mockResolvedValue([]);
    mockSegmentService.getAll.mockResolvedValue([]);
    mockSummaryService.getForMonth.mockResolvedValue([]);
    service = new NotificationService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('refresh', () => {
    it('should generate notification for simple loan overdue > 30 days', async () => {
      mockLoanService.getAll.mockResolvedValue({
        loans: [{
          id: 'loan-1',
          date: { toDate: () => new Date('2026-05-01') },
          personName: 'Raju',
          balanceRemaining: 5000,
          repaymentStatus: 'pending',
          loanCategory: 'simple',
        }],
      });

      await service.refresh();

      const notifications = service.notifications();
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      const loanNotif = notifications.find(n => n.id.includes('loan_overdue'));
      expect(loanNotif).toBeDefined();
      expect(loanNotif!.severity).toBe('warning');
      expect(loanNotif!.title).toContain('Raju');
    });

    it('should not generate notification for completed loans', async () => {
      mockLoanService.getAll.mockResolvedValue({
        loans: [{
          id: 'loan-1',
          date: { toDate: () => new Date('2026-01-01') },
          personName: 'Raju',
          balanceRemaining: 0,
          repaymentStatus: 'completed',
        }],
      });

      await service.refresh();
      expect(service.notifications()).toHaveLength(0);
    });

    it('should generate error for overdue EMI payment', async () => {
      mockLoanService.getAll.mockResolvedValue({
        loans: [{
          id: 'loan-2',
          date: { toDate: () => new Date('2026-01-01') },
          personName: 'Bank',
          balanceRemaining: 50000,
          repaymentStatus: 'partial',
          loanCategory: 'formal',
          repaymentType: 'emi',
          emiAmount: 5000,
          nextPaymentDueDate: { toDate: () => new Date('2026-06-15') }, // 16 days overdue
          nextPaymentNumber: 6,
          loanSourceName: 'SBI',
        }],
      });

      await service.refresh();

      const notifications = service.notifications();
      const overdue = notifications.find(n => n.id.includes('payment_overdue'));
      expect(overdue).toBeDefined();
      expect(overdue!.severity).toBe('error');
      expect(overdue!.title).toContain('EMI #6');
    });

    it('should generate warning for EMI due within 5 days', async () => {
      mockLoanService.getAll.mockResolvedValue({
        loans: [{
          id: 'loan-3',
          date: { toDate: () => new Date('2026-01-01') },
          personName: 'Bank',
          balanceRemaining: 50000,
          repaymentStatus: 'partial',
          loanCategory: 'formal',
          repaymentType: 'emi',
          emiAmount: 5000,
          nextPaymentDueDate: { toDate: () => new Date('2026-07-04') }, // 3 days from now
          nextPaymentNumber: 7,
          loanSourceName: 'SBI',
        }],
      });

      await service.refresh();

      const notifications = service.notifications();
      const due = notifications.find(n => n.id.includes('payment_due'));
      expect(due).toBeDefined();
      expect(due!.severity).toBe('warning');
      expect(due!.title).toContain('due soon');
    });

    it('should generate notification for overdue tasks', async () => {
      mockTaskService.getAll.mockResolvedValue([{
        id: 'task-1',
        title: 'Vaccinate goats',
        status: 'todo',
        dueDate: { toDate: () => new Date('2026-06-25') },
      }]);

      await service.refresh();

      const notifications = service.notifications();
      const taskNotif = notifications.find(n => n.type === 'task_overdue');
      expect(taskNotif).toBeDefined();
      expect(taskNotif!.title).toContain('Vaccinate goats');
    });

    it('should not notify for completed tasks', async () => {
      mockTaskService.getAll.mockResolvedValue([{
        id: 'task-1',
        title: 'Done task',
        status: 'done',
        dueDate: { toDate: () => new Date('2026-06-01') },
      }]);

      await service.refresh();
      expect(service.notifications().filter(n => n.type === 'task_overdue')).toHaveLength(0);
    });

    it('should generate error for exceeded budget', async () => {
      mockSegmentService.getAll.mockResolvedValue([{
        id: 'seg1', name: 'Goats',
        budgets: { monthlyExpenseLimit: 10000 },
      }]);
      mockSummaryService.getForMonth.mockResolvedValue([{
        segment: 'seg1', totalExpense: 12000,
      }]);

      await service.refresh();

      const notifications = service.notifications();
      const budget = notifications.find(n => n.type === 'budget_exceeded');
      expect(budget).toBeDefined();
      expect(budget!.severity).toBe('error');
      expect(budget!.title).toContain('exceeded');
    });

    it('should generate warning for budget >= 80% but < 100%', async () => {
      mockSegmentService.getAll.mockResolvedValue([{
        id: 'seg1', name: 'Goats',
        budgets: { monthlyExpenseLimit: 10000 },
      }]);
      mockSummaryService.getForMonth.mockResolvedValue([{
        segment: 'seg1', totalExpense: 8500,
      }]);

      await service.refresh();

      const notifications = service.notifications();
      const budget = notifications.find(n => n.type === 'budget_warning');
      expect(budget).toBeDefined();
      expect(budget!.severity).toBe('warning');
    });

    it('should not generate budget alert below 80%', async () => {
      mockSegmentService.getAll.mockResolvedValue([{
        id: 'seg1', name: 'Goats',
        budgets: { monthlyExpenseLimit: 10000 },
      }]);
      mockSummaryService.getForMonth.mockResolvedValue([{
        segment: 'seg1', totalExpense: 5000,
      }]);

      await service.refresh();
      const budgetNotifs = service.notifications().filter(n =>
        n.type === 'budget_warning' || n.type === 'budget_exceeded');
      expect(budgetNotifs).toHaveLength(0);
    });
  });

  describe('dismiss', () => {
    it('should remove notification and persist to localStorage', async () => {
      mockTaskService.getAll.mockResolvedValue([{
        id: 'task-1', title: 'Test', status: 'todo',
        dueDate: { toDate: () => new Date('2026-06-01') },
      }]);

      await service.refresh();
      expect(service.notifications().length).toBeGreaterThan(0);

      const id = service.notifications()[0].id;
      service.dismiss(id);

      expect(service.notifications().find(n => n.id === id)).toBeUndefined();
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('dismissAll', () => {
    it('should clear all notifications', async () => {
      mockTaskService.getAll.mockResolvedValue([
        { id: 'task-1', title: 'A', status: 'todo', dueDate: { toDate: () => new Date('2026-06-01') } },
        { id: 'task-2', title: 'B', status: 'todo', dueDate: { toDate: () => new Date('2026-06-01') } },
      ]);

      await service.refresh();
      expect(service.notifications().length).toBe(2);

      service.dismissAll();
      expect(service.notifications()).toHaveLength(0);
    });
  });
});
