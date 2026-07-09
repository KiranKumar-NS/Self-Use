import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Schedule, RepeatFrequency } from '../models/schedule.model';
import { TransactionFormData } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { TransactionService } from './transaction.service';
import { TaskService } from './task.service';
import { getMonthString, getYear } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);
  private taskService = inject(TaskService);

  private get schedulesRef() {
    return collection(this.firestore, 'schedules');
  }

  async create(data: Partial<Schedule>): Promise<string> {
    const user = this.authService.requireUser();
    const scheduleRef = doc(this.schedulesRef);

    await setDoc(scheduleRef, {
      id: scheduleRef.id,
      type: data.type || 'reminder',
      title: data.title || '',
      description: data.description || '',
      frequency: data.frequency || 'monthly',
      startDate: data.startDate || Timestamp.now(),
      ...(data.endDate ? { endDate: data.endDate } : {}),
      nextDueDate: data.nextDueDate || data.startDate || Timestamp.now(),
      transactionTemplate: data.transactionTemplate || null,
      reminderConfig: data.reminderConfig || null,
      isActive: true,
      isDeleted: false,
      processedCount: 0,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
    });

    return scheduleRef.id;
  }

  async update(id: string, data: Partial<Schedule>): Promise<void> {
    await updateDoc(doc(this.firestore, 'schedules', id), { ...data });
  }

  async getAll(): Promise<Schedule[]> {
    const q = query(this.schedulesRef, where('isDeleted', '==', false), orderBy('nextDueDate', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Schedule);
  }

  async getActive(): Promise<Schedule[]> {
    const q = query(
      this.schedulesRef,
      where('isDeleted', '==', false),
      where('isActive', '==', true),
      orderBy('nextDueDate', 'asc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Schedule);
  }

  async getById(id: string): Promise<Schedule | null> {
    const docSnap = await getDoc(doc(this.firestore, 'schedules', id));
    return docSnap.exists() ? (docSnap.data() as Schedule) : null;
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'schedules', id), { isActive });
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'schedules', id), { isDeleted: true });
  }

  /** Process all overdue schedules. Called on app startup.
   *  Uses runTransaction to claim each schedule before processing,
   *  preventing duplicate processing from concurrent tabs/users. */
  async processOverdueSchedules(): Promise<{ transactions: number; tasks: number }> {
    const now = new Date();
    const schedules = await this.getActive();
    let totalTransactions = 0;
    let totalTasks = 0;

    for (const schedule of schedules) {
      const dueDate = schedule.nextDueDate.toDate();
      if (dueDate > now) continue;

      // Check end date
      if (schedule.endDate && schedule.endDate.toDate() < now) {
        await this.toggleActive(schedule.id, false);
        continue;
      }

      // Use a transaction to atomically claim this schedule for processing.
      // Re-read the schedule inside the transaction to detect concurrent processing.
      const scheduleRef = doc(this.firestore, 'schedules', schedule.id);
      let claimed = false;
      let freshDueDate = dueDate;

      try {
        await runTransaction(this.firestore, async (transaction) => {
          const freshDoc = await transaction.get(scheduleRef);
          const freshData = freshDoc.data() as Schedule;

          // Another tab/user already processed this — skip
          if (!freshData.isActive || freshData.isDeleted) {
            claimed = false;
            return;
          }

          freshDueDate = freshData.nextDueDate.toDate();
          if (freshDueDate > now) {
            claimed = false;
            return;
          }

          // Claim: advance nextDueDate immediately to prevent concurrent processing
          let nextDue = freshDueDate;
          let advanceCount = 0;
          while (nextDue <= now && advanceCount < 12) {
            nextDue = this.calculateNextDueDate(nextDue, freshData.frequency);
            advanceCount++;
          }

          transaction.update(scheduleRef, {
            nextDueDate: Timestamp.fromDate(nextDue),
            lastProcessedDate: Timestamp.now(),
            processedCount: freshData.processedCount + advanceCount,
          });

          claimed = true;
        });
      } catch {
        // Transaction conflict — another tab is processing this schedule
        continue;
      }

      if (!claimed) continue;

      // Now create the actual transactions/tasks outside the transaction
      // (these are idempotent by nature — if they fail, the schedule is already advanced)
      let currentDue = freshDueDate;
      let created = 0;

      while (currentDue <= now && created < 12) {
        try {
          if (schedule.type === 'recurring_transaction' && schedule.transactionTemplate) {
            await this.createTransactionFromTemplate(schedule, currentDue);
            totalTransactions++;
          }

          if (schedule.type === 'reminder' && schedule.reminderConfig?.autoCreateTask) {
            await this.createTaskFromReminder(schedule, currentDue);
            totalTasks++;
          }
        } catch {
          // If creation fails, we've already advanced the schedule — skip this occurrence
          // rather than creating duplicates on retry
        }

        currentDue = this.calculateNextDueDate(currentDue, schedule.frequency);
        created++;
      }
    }

    return { transactions: totalTransactions, tasks: totalTasks };
  }

  /** Get upcoming reminders (due within N days) */
  async getUpcomingReminders(daysAhead: number = 7): Promise<Schedule[]> {
    const schedules = await this.getActive();
    const now = new Date();
    const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    return schedules.filter(s => {
      if (s.type !== 'reminder') return false;
      const dueDate = s.nextDueDate.toDate();
      // Include items due within daysAhead OR already overdue
      const notifyBefore = s.reminderConfig?.notifyDaysBefore ?? 0;
      const notifyDate = new Date(dueDate.getTime() - notifyBefore * 24 * 60 * 60 * 1000);
      return notifyDate <= cutoff;
    });
  }

  /** Get pending recurring transactions (overdue) */
  async getPendingRecurring(): Promise<Schedule[]> {
    const schedules = await this.getActive();
    const now = new Date();
    return schedules.filter(s =>
      s.type === 'recurring_transaction' && s.nextDueDate.toDate() <= now
    );
  }

  calculateNextDueDate(currentDate: Date, frequency: RepeatFrequency): Date {
    const next = new Date(currentDate);
    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
    return next;
  }

  private async createTransactionFromTemplate(schedule: Schedule, date: Date): Promise<void> {
    const t = schedule.transactionTemplate!;
    const formData: TransactionFormData = {
      type: t.type,
      date: date,
      amount: t.amount,
      category: t.category,
      categoryName: t.categoryName,
      segment: t.segment,
      segmentName: t.segmentName,
      description: t.description,
      paymentMethod: t.paymentMethod,
      paidBy: t.paidBy,
      paidByName: t.paidByName,
      tags: [...(t.tags || []), 'auto-recurring'],
      month: getMonthString(date),
      year: getYear(date),
    };
    await this.transactionService.create(formData);
  }

  private async createTaskFromReminder(schedule: Schedule, dueDate: Date): Promise<void> {
    const r = schedule.reminderConfig!;
    await this.taskService.create({
      title: schedule.title,
      description: schedule.description,
      priority: r.taskPriority || 'medium',
      status: 'todo',
      visibility: 'shared',
      dueDate: Timestamp.fromDate(dueDate),
      tags: [r.reminderType, 'auto-reminder'],
    });
  }
}
