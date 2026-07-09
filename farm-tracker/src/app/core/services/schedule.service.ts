import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
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

  /** Process all overdue schedules. Called on app startup. */
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

      // Per-schedule counters
      let created = 0;
      let currentDue = dueDate;

      while (currentDue <= now) {
        if (schedule.type === 'recurring_transaction' && schedule.transactionTemplate) {
          await this.createTransactionFromTemplate(schedule, currentDue);
          created++;
          totalTransactions++;
        }

        if (schedule.type === 'reminder' && schedule.reminderConfig?.autoCreateTask) {
          await this.createTaskFromReminder(schedule, currentDue);
          created++;
          totalTasks++;
        }

        currentDue = this.calculateNextDueDate(currentDue, schedule.frequency);

        // Safety: don't process more than 12 missed occurrences per schedule
        if (created >= 12) break;
      }

      // Update schedule with next due date
      await updateDoc(doc(this.firestore, 'schedules', schedule.id), {
        nextDueDate: Timestamp.fromDate(currentDue),
        lastProcessedDate: Timestamp.now(),
        processedCount: schedule.processedCount + created,
      });
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
