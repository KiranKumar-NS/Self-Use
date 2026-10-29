import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { Note, NoteCategory } from '../models/note.model';
import { AuthService } from './auth.service';

/** Admin-only notebook. Small collection, so it is loaded whole and filtered client-side (no indexes). */
@Injectable({ providedIn: 'root' })
export class NoteService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get ref() { return collection(this.firestore, 'notes'); }

  /** All notes, including trashed ones (callers split on isDeleted). */
  async getAll(): Promise<Note[]> {
    const snapshot = await getDocs(this.ref);
    return snapshot.docs.map(d => d.data() as Note);
  }

  async create(data: Partial<Note> & { category: NoteCategory }): Promise<Note> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);
    const note = {
      id: docRef.id,
      category: data.category,
      title: data.title || '',
      contentHtml: data.contentHtml || '',
      contentText: data.contentText || '',
      tags: data.tags || [],
      pinned: data.pinned ?? false,
      medicine: data.medicine ?? null,
      market: data.market ?? null,
      createdBy: user.uid,
      createdByName: user.displayName,
      isDeleted: false,
      deletedAt: null,
    };
    await setDoc(docRef, { ...note, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    // Local copy uses a client timestamp so the new note sorts first without a re-read.
    return { ...note, createdAt: Timestamp.now(), updatedAt: Timestamp.now() } as Note;
  }

  async update(id: string, data: Partial<Note>): Promise<void> {
    const { id: _id, createdAt, createdBy, createdByName, updatedAt, ...rest } = data;
    await updateDoc(doc(this.firestore, 'notes', id), { ...rest, updatedAt: serverTimestamp() });
  }

  async moveToTrash(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'notes', id), { isDeleted: true, deletedAt: serverTimestamp() });
  }

  async restore(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'notes', id), { isDeleted: false, deletedAt: null, updatedAt: serverTimestamp() });
  }

  async deleteForever(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'notes', id));
  }
}
