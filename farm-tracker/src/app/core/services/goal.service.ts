import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Goal, GoalStatus, Milestone } from '../models/goal.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class GoalService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get goalsRef() {
    return collection(this.firestore, 'goals');
  }

  async create(data: Partial<Goal>): Promise<string> {
    const user = this.authService.userProfile()!;
    const goalRef = doc(this.goalsRef);

    await setDoc(goalRef, {
      id: goalRef.id,
      title: data.title || '',
      description: data.description || '',
      type: data.type || 'monthly',
      status: 'not_started',
      progress: 0,
      dueDate: data.dueDate || null,
      milestones: data.milestones || [],
      assignee: data.assignee || user.uid,
      assigneeName: data.assigneeName || user.displayName,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return goalRef.id;
  }

  async getAll(): Promise<Goal[]> {
    const q = query(this.goalsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Goal);
  }

  async getById(goalId: string): Promise<Goal | null> {
    const docSnap = await getDoc(doc(this.firestore, 'goals', goalId));
    return docSnap.exists() ? (docSnap.data() as Goal) : null;
  }

  async update(goalId: string, data: Partial<Goal>): Promise<void> {
    await updateDoc(doc(this.firestore, 'goals', goalId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async updateProgress(goalId: string, milestones: Milestone[]): Promise<void> {
    const done = milestones.filter((m) => m.done).length;
    const total = milestones.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const status: GoalStatus = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';

    await updateDoc(doc(this.firestore, 'goals', goalId), {
      milestones,
      progress,
      status,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(goalId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'goals', goalId));
  }
}
