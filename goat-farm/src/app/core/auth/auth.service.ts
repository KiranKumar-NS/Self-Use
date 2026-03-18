import { inject, Injectable, signal, computed } from '@angular/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.config';
import { AppUser, UserRole } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly firestore = inject(FIRESTORE);

  private readonly _firebaseUser = signal<User | null>(null);
  private readonly _appUser = signal<AppUser | null>(null);
  private readonly _loading = signal<boolean>(true);

  readonly isAuthenticated = computed(() => this._firebaseUser() !== null);
  readonly currentUser = this._appUser.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly userRole = computed(() => this._appUser()?.role ?? null);

  constructor() {
    onAuthStateChanged(this.auth, async (user) => {
      this._firebaseUser.set(user);
      if (user) {
        const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
        this._appUser.set(userDoc.exists() ? ({ uid: user.uid, ...userDoc.data() } as AppUser) : null);
      } else {
        this._appUser.set(null);
      }
      this._loading.set(false);
    });
  }

  currentFarmId(): string {
    return this._appUser()?.farmId ?? '';
  }

  currentUid(): string {
    return this._firebaseUser()?.uid ?? '';
  }

  hasRole(roles: UserRole[]): boolean {
    const role = this._appUser()?.role;
    return role ? roles.includes(role) : false;
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async register(
    email: string,
    password: string,
    displayName: string,
    phone: string,
    role: UserRole = 'worker',
    farmId: string = 'default',
  ): Promise<string> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    const uid = cred.user.uid;

    const userData: Omit<AppUser, 'uid'> = {
      email,
      displayName,
      phone,
      role,
      farmId,
      isActive: true,
      preferredLanguage: 'en',
      fcmTokens: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(doc(this.firestore, 'users', uid), userData);
    this._appUser.set({ uid, ...userData });

    return uid;
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }
}
