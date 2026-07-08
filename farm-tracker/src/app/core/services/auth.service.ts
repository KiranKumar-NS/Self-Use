import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { AppUser, UserRole } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  currentUser = signal<User | null>(null);
  userProfile = signal<AppUser | null>(null);
  userRole = signal<UserRole | null>(null);
  isLoading = signal(true);

  isAdmin = computed(() => this.userRole() === 'admin');
  isManager = computed(() => this.userRole() === 'manager');
  isViewer = computed(() => this.userRole() === 'viewer');
  isLoggedIn = computed(() => !!this.currentUser());
  assignedSegments = computed(() => this.userProfile()?.assignedSegments ?? []);

  constructor() {
    onAuthStateChanged(this.auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          this.userRole.set((tokenResult.claims['role'] as UserRole) || null);
          const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
          if (userDoc.exists()) {
            this.userProfile.set(userDoc.data() as AppUser);
            // If role not in claims, default to viewer (don't trust Firestore role)
            if (!this.userRole()) {
              this.userRole.set('viewer');
            }
          }
        } catch (err) {
          console.error('Error loading user profile:', err);
        }
      } else {
        this.userRole.set(null);
        this.userProfile.set(null);
      }
      this.isLoading.set(false);
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async register(email: string, password: string, displayName: string, role: UserRole, assignedSegments: string[]): Promise<string> {
    // Use secondary app to create user without affecting current login
    const { initializeApp, deleteApp } = await import('@angular/fire/app');
    const { getAuth, createUserWithEmailAndPassword: createUser } = await import('@angular/fire/auth');
    const { environment } = await import('../../environments/environment');

    const secondaryApp = initializeApp(environment.firebase, 'secondary-' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const credential = await createUser(secondaryAuth, email, password);
      const uid = credential.user.uid;

      await setDoc(doc(this.firestore, 'users', uid), {
        uid,
        email,
        displayName,
        role,
        assignedSegments,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: this.currentUser()?.uid || uid,
      } as Partial<AppUser>);

      await deleteApp(secondaryApp);
      return uid;
    } catch (err) {
      await deleteApp(secondaryApp);
      throw err;
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  requireUser(): AppUser {
    const user = this.userProfile();
    if (!user) throw new Error('Session expired. Please log in again.');
    return user;
  }

  hasSegmentAccess(segment: string): boolean {
    if (this.isAdmin()) return true;
    return this.assignedSegments().includes(segment);
  }
}
