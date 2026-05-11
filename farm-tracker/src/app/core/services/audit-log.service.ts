import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  DocumentSnapshot,
} from '@angular/fire/firestore';
import { AuditLog, EntityType } from '../models/audit-log.model';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private firestore = inject(Firestore);

  async getLogs(
    filters: {
      entityType?: EntityType;
      entityId?: string;
      userId?: string;
    } = {},
    pageSize = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ logs: AuditLog[]; lastDoc: DocumentSnapshot | null }> {
    let q = query(
      collection(this.firestore, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(pageSize)
    );

    if (filters.entityType) {
      q = query(q, where('entityType', '==', filters.entityType));
    }
    if (filters.entityId) {
      q = query(q, where('entityId', '==', filters.entityId));
    }
    if (filters.userId) {
      q = query(q, where('userId', '==', filters.userId));
    }
    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map((d) => d.data() as AuditLog);
    const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { logs, lastDoc: last };
  }

  async getByEntity(entityType: EntityType, entityId: string): Promise<AuditLog[]> {
    const q = query(
      collection(this.firestore, 'auditLogs'),
      where('entityType', '==', entityType),
      where('entityId', '==', entityId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as AuditLog);
  }
}
