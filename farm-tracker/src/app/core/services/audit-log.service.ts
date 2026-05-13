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
  QueryConstraint,
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
    const constraints: QueryConstraint[] = [
      orderBy('timestamp', 'desc'),
      limit(pageSize),
    ];

    if (filters.entityType) {
      constraints.push(where('entityType', '==', filters.entityType));
    }
    if (filters.entityId) {
      constraints.push(where('entityId', '==', filters.entityId));
    }
    if (filters.userId) {
      constraints.push(where('userId', '==', filters.userId));
    }
    if (lastDoc) {
      constraints.push(startAfter(lastDoc));
    }

    const q = query(collection(this.firestore, 'auditLogs'), ...constraints);
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
