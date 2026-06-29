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
  where,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Task, TaskStatus, Subtask } from '../models/task.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get tasksRef() {
    return collection(this.firestore, 'tasks');
  }

  async create(data: Partial<Task>): Promise<string> {
    const user = this.authService.userProfile()!;
    const taskRef = doc(this.tasksRef);

    await setDoc(taskRef, {
      id: taskRef.id,
      title: data.title || '',
      description: data.description || '',
      priority: data.priority || 'medium',
      status: data.status || 'todo',
      visibility: data.visibility || 'shared',
      assignee: data.assignee || user.uid,
      assigneeName: data.assigneeName || user.displayName,
      dueDate: data.dueDate || null,
      subtasks: data.subtasks || [],
      tags: data.tags || [],
      kanbanOrder: data.kanbanOrder || Date.now(),
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null,
    });
    return taskRef.id;
  }

  async getAll(filter: 'all' | 'mine' = 'all'): Promise<Task[]> {
    const uid = this.authService.currentUser()!.uid;
    const q = query(this.tasksRef, orderBy('kanbanOrder', 'asc'));
    const snapshot = await getDocs(q);
    let tasks = snapshot.docs.map((d) => d.data() as Task).filter(t => !t.isDeleted);

    // Filter: personal tasks only visible to creator
    tasks = tasks.filter((t) => {
      if (t.visibility === 'personal' && t.createdBy !== uid) return false;
      return true;
    });

    // Filter: "mine" shows only tasks assigned to me or created by me
    if (filter === 'mine') {
      tasks = tasks.filter((t) => t.assignee === uid || t.createdBy === uid);
    }

    return tasks;
  }

  async getByStatus(filter: 'all' | 'mine' = 'all'): Promise<Record<TaskStatus, Task[]>> {
    const tasks = await this.getAll(filter);
    return {
      backlog: tasks.filter((t) => t.status === 'backlog'),
      todo: tasks.filter((t) => t.status === 'todo'),
      in_progress: tasks.filter((t) => t.status === 'in_progress'),
      done: tasks.filter((t) => t.status === 'done'),
    };
  }

  async getById(taskId: string): Promise<Task | null> {
    const docSnap = await getDoc(doc(this.firestore, 'tasks', taskId));
    return docSnap.exists() ? (docSnap.data() as Task) : null;
  }

  async update(taskId: string, data: Partial<Task>): Promise<void> {
    await updateDoc(doc(this.firestore, 'tasks', taskId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const updateData: any = { status, updatedAt: serverTimestamp() };
    if (status === 'done') {
      updateData.completedAt = serverTimestamp();
    } else {
      updateData.completedAt = null;
    }
    await updateDoc(doc(this.firestore, 'tasks', taskId), updateData);
  }

  async toggleSubtask(taskId: string, subtasks: Subtask[]): Promise<void> {
    await updateDoc(doc(this.firestore, 'tasks', taskId), {
      subtasks,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(taskId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'tasks', taskId));
  }

  async softDelete(taskId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'tasks', taskId), {
      isDeleted: true,
      updatedAt: serverTimestamp(),
    });
  }
}
