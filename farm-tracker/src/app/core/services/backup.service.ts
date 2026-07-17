import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  documentId,
  QueryDocumentSnapshot,
  QueryConstraint,
  QuerySnapshot,
} from '@angular/fire/firestore';
import { Transaction } from '../models/transaction.model';
import { Loan, Repayment } from '../models/loan.model';
import { InventoryEvent } from '../models/inventory.model';
import { Animal } from '../models/animal.model';
import { Buyer } from '../models/buyer.model';
import { Supplier } from '../models/supplier.model';
import { Category } from '../models/category.model';
import { Segment } from '../models/segment.model';
import { AppUser } from '../models/user.model';
import { Task } from '../models/task.model';
import { Schedule } from '../models/schedule.model';
import { Harvest } from '../models/harvest.model';
import { BreedingRecord } from '../models/breeding.model';
import { CropActivity } from '../models/crop-activity.model';
import { InventoryItem } from '../models/inventory-item.model';
import { AuthService } from './auth.service';
import { LoanService } from './loan.service';
import { TagService } from './tag.service';

export interface LoanRepaymentsEntry {
  loanId: string;
  repayments: Repayment[];
}

export interface BackupData {
  expenses: Transaction[];
  income: Transaction[];
  loans: Loan[];
  repaymentsByLoan: LoanRepaymentsEntry[];
  inventoryEvents: InventoryEvent[];
  animals: Animal[];
  buyers: Buyer[];
  suppliers: Supplier[];
  categories: Category[];
  segments: Segment[];
  users: AppUser[];
  tasks: Task[];
  schedules: Schedule[];
  harvests: Harvest[];
  breedingRecords: BreedingRecord[];
  cropActivities: CropActivity[];
  inventoryItems: InventoryItem[];
  tags: string[];
  exportedBy: string;
  exportedAt: Date;
}

/**
 * Collects ALL persisted app data for a full backup export.
 * Every collection is fetched all-time and uncapped (paginated);
 * soft-deleted docs (isDeleted === true) are excluded, matching
 * what every service query and the summary aggregates consider live data.
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private loanService = inject(LoanService);
  private tagService = inject(TagService);

  /**
   * Paginated full-collection fetch ordered by document ID — no composite
   * index needed and legacy docs missing sort fields are never skipped.
   * isDeleted is filtered client-side so legacy docs without the field survive.
   */
  private async fetchAll<T>(collectionName: string): Promise<T[]> {
    const PAGE_SIZE = 300;
    const col = collection(this.firestore, collectionName);
    const all: T[] = [];
    let lastDoc: QueryDocumentSnapshot | null = null;

    while (true) {
      const constraints: QueryConstraint[] = lastDoc
        ? [orderBy(documentId()), startAfter(lastDoc), limit(PAGE_SIZE)]
        : [orderBy(documentId()), limit(PAGE_SIZE)];
      const snapshot: QuerySnapshot = await getDocs(query(col, ...constraints));

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as any;
        if (data.isDeleted !== true) {
          all.push({ ...data, id: docSnap.id } as T);
        }
      }

      if (snapshot.docs.length < PAGE_SIZE) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return all;
  }

  async collectFullBackup(): Promise<BackupData> {
    // Fetch in two parallel waves to keep concurrent connections reasonable
    const [transactions, loans, inventoryEvents, animals, buyers, suppliers, categories, segments] =
      await Promise.all([
        this.fetchAll<Transaction>('transactions'),
        this.fetchAll<Loan>('loans'),
        this.fetchAll<InventoryEvent>('inventoryEvents'),
        this.fetchAll<Animal>('animals'),
        this.fetchAll<Buyer>('buyers'),
        this.fetchAll<Supplier>('suppliers'),
        this.fetchAll<Category>('categories'),
        this.fetchAll<Segment>('segments'),
      ]);

    const [users, tasks, schedules, harvests, breedingRecords, cropActivities, inventoryItems, tags] =
      await Promise.all([
        this.fetchAll<AppUser>('users'),
        this.fetchAll<Task>('tasks'),
        this.fetchAll<Schedule>('schedules'),
        this.fetchAll<Harvest>('harvests'),
        this.fetchAll<BreedingRecord>('breedingRecords'),
        this.fetchAll<CropActivity>('cropActivities'),
        this.fetchAll<InventoryItem>('inventoryItems'),
        this.tagService.getTags(),
      ]);

    // Repayment subcollections: only loans that can have them
    const loansWithRepayments = loans.filter(
      l => l.loanCategory === 'formal' || (l.totalRepaid ?? 0) > 0
    );
    const repaymentsByLoan: LoanRepaymentsEntry[] = [];
    const CHUNK = 10;
    for (let i = 0; i < loansWithRepayments.length; i += CHUNK) {
      const chunk = loansWithRepayments.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(async l => ({
          loanId: l.id,
          repayments: await this.loanService.getRepayments(l.id),
        }))
      );
      for (const r of results) {
        if (r.repayments.length > 0) repaymentsByLoan.push(r);
      }
    }

    const user = this.auth.currentUser();

    return {
      expenses: transactions.filter(t => t.type === 'expense'),
      income: transactions.filter(t => t.type === 'income'),
      loans,
      repaymentsByLoan,
      inventoryEvents,
      animals,
      buyers,
      suppliers,
      categories,
      segments,
      users,
      tasks,
      schedules,
      harvests,
      breedingRecords,
      cropActivities,
      inventoryItems,
      tags,
      exportedBy: user?.displayName || user?.email || 'unknown',
      exportedAt: new Date(),
    };
  }
}
