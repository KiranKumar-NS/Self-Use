import { Injectable, inject, signal, computed } from '@angular/core';
import { LoanService } from './loan.service';
import { TaskService } from './task.service';
import { SegmentService } from './segment.service';
import { SummaryService } from './summary.service';
import { AppNotification } from '../models/notification.model';
import { getMonthString } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private loanService = inject(LoanService);
  private taskService = inject(TaskService);
  private segmentService = inject(SegmentService);
  private summaryService = inject(SummaryService);

  notifications = signal<AppNotification[]>([]);
  unreadCount = computed(() => this.notifications().length);

  private dismissedIds = new Set<string>(
    (() => { try { return JSON.parse(localStorage.getItem('dismissed_notifications') || '[]'); } catch { return []; } })()
  );

  async refresh(): Promise<void> {
    const items: AppNotification[] = [];
    const now = new Date();

    // 1. Overdue loans + EMI/Interest due date alerts
    try {
      const loanResult = await this.loanService.getAll({}, 100);
      for (const loan of loanResult.loans) {
        if (loan.repaymentStatus === 'completed') continue;

        // Simple loan overdue (existing)
        const loanDate = loan.date.toDate();
        const daysSince = Math.floor((now.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > 30 && loan.loanCategory !== 'formal') {
          const id = `loan_overdue_${loan.id}`;
          if (!this.dismissedIds.has(id)) {
            items.push({
              id,
              type: 'loan_overdue',
              title: `Loan overdue: ${loan.personName}`,
              message: `₹${loan.balanceRemaining.toLocaleString('en-IN')} pending for ${daysSince} days`,
              severity: 'warning',
              link: `/loans/${loan.id}`,
              createdAt: now,
            });
          }
        }

        // Formal loan EMI/Interest payment alerts
        if (loan.loanCategory === 'formal' && loan.nextPaymentDueDate) {
          const dueDate = loan.nextPaymentDueDate.toDate();
          const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const sourceName = loan.loanSourceName ?? loan.personName;
          const isEMI = loan.repaymentType === 'emi';
          const paymentAmount = isEMI ? (loan.emiAmount ?? 0) : (loan.interestAmountPerPeriod ?? 0);
          const paymentLabel = isEMI ? `EMI #${loan.nextPaymentNumber ?? ''}` : 'Interest payment';

          if (daysUntil < 0) {
            // Overdue
            const id = `payment_overdue_${loan.id}_${loan.nextPaymentNumber}`;
            if (!this.dismissedIds.has(id)) {
              items.push({
                id,
                type: 'loan_overdue',
                title: `${paymentLabel} overdue: ${sourceName}`,
                message: `₹${paymentAmount.toLocaleString('en-IN')} was due ${Math.abs(daysUntil)} days ago`,
                severity: 'error',
                link: `/loans/${loan.id}`,
                createdAt: now,
              });
            }
          } else if (daysUntil <= 5) {
            // Due soon
            const id = `payment_due_${loan.id}_${loan.nextPaymentNumber}`;
            if (!this.dismissedIds.has(id)) {
              items.push({
                id,
                type: 'loan_overdue',
                title: `${paymentLabel} due soon: ${sourceName}`,
                message: `₹${paymentAmount.toLocaleString('en-IN')} due ${daysUntil === 0 ? 'today' : `in ${daysUntil} days`}`,
                severity: 'warning',
                link: `/loans/${loan.id}`,
                createdAt: now,
              });
            }
          }
        }
      }
    } catch {}

    // 2. Overdue tasks
    try {
      const tasks = await this.taskService.getAll();
      for (const task of tasks) {
        if (task.status === 'done' || !task.dueDate) continue;
        const dueDate = task.dueDate.toDate();
        if (dueDate < now) {
          const id = `task_overdue_${task.id}`;
          if (!this.dismissedIds.has(id)) {
            items.push({
              id,
              type: 'task_overdue',
              title: `Task overdue: ${task.title}`,
              message: `Due ${dueDate.toLocaleDateString('en-IN')}`,
              severity: 'warning',
              link: `/tasks/${task.id}`,
              createdAt: now,
            });
          }
        }
      }
    } catch {}

    // 3. Budget alerts
    try {
      const currentMonth = getMonthString(now);
      const [segments, summaries] = await Promise.all([
        this.segmentService.getAll(),
        this.summaryService.getForMonth(currentMonth),
      ]);

      for (const seg of segments) {
        const limit = seg.budgets?.monthlyExpenseLimit;
        if (!limit) continue;
        const summary = summaries.find(s => s.segment === seg.id);
        const spent = summary?.totalExpense || 0;
        const pct = (spent / limit) * 100;

        if (pct >= 100) {
          const id = `budget_exceeded_${seg.id}_${currentMonth}`;
          if (!this.dismissedIds.has(id)) {
            items.push({
              id,
              type: 'budget_exceeded',
              title: `Budget exceeded: ${seg.name}`,
              message: `₹${spent.toLocaleString('en-IN')} spent of ₹${limit.toLocaleString('en-IN')} limit (${Math.round(pct)}%)`,
              severity: 'error',
              link: '/dashboard',
              createdAt: now,
            });
          }
        } else if (pct >= 80) {
          const id = `budget_warning_${seg.id}_${currentMonth}`;
          if (!this.dismissedIds.has(id)) {
            items.push({
              id,
              type: 'budget_warning',
              title: `Budget warning: ${seg.name}`,
              message: `₹${spent.toLocaleString('en-IN')} spent of ₹${limit.toLocaleString('en-IN')} limit (${Math.round(pct)}%)`,
              severity: 'warning',
              link: '/dashboard',
              createdAt: now,
            });
          }
        }
      }
    } catch {}

    this.notifications.set(items);
  }

  dismiss(id: string): void {
    this.dismissedIds.add(id);
    localStorage.setItem('dismissed_notifications', JSON.stringify([...this.dismissedIds]));
    this.notifications.update(items => items.filter(n => n.id !== id));
  }

  dismissAll(): void {
    for (const n of this.notifications()) {
      this.dismissedIds.add(n.id);
    }
    localStorage.setItem('dismissed_notifications', JSON.stringify([...this.dismissedIds]));
    this.notifications.set([]);
  }
}
