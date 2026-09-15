import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
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
  onSnapshot,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { AppUser, UserRole } from '../models/user.model';
import { ToastService } from './toast.service';

const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Contact the administrator.';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private toast = inject(ToastService);

  currentUser = signal<User | null>(null);
  userProfile = signal<AppUser | null>(null);
  userRole = signal<UserRole | null>(null);
  isLoading = signal(true);

  isAdmin = computed(() => this.userRole() === 'admin');
  isManager = computed(() => this.userRole() === 'manager');
  isViewer = computed(() => this.userRole() === 'viewer');
  isLoggedIn = computed(() => !!this.currentUser());
  assignedSegments = computed(() => this.userProfile()?.assignedSegments ?? []);
  /** Non-admin users are always read-scoped to assignedSegments (client-side only).
   *  Empty assignment = no data visible. Admins are never restricted. */
  isSegmentRestricted = computed(() => this.isLoggedIn() && !this.isAdmin());

  private readyResolvers: (() => void)[] = [];
  private profileUnsub: (() => void) | null = null;
  /** One forced token refresh per session when the profile says admin/manager
   *  but the ID token carries no role claim (claim set after last token mint). */
  private claimRefreshTried = false;

  /**
   * Resolves once the initial auth state (claims + profile) has loaded.
   * Falls through after timeoutMs so a hung auth check can't block navigation
   * forever — callers then see the current (logged-out) state.
   */
  whenReady(timeoutMs = 10_000): Promise<void> {
    if (!this.isLoading()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.readyResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  constructor() {
    onAuthStateChanged(this.auth, async (user) => {
      this.detachProfileListener();
      this.currentUser.set(user);
      this.claimRefreshTried = false;
      if (!user) {
        this.userRole.set(null);
        this.userProfile.set(null);
        this.markReady();
        return;
      }
      this.isLoading.set(true);
      await this.loadRoleClaim(user, false);
      this.watchProfile(user.uid);
    });
  }

  /** Reads the `role` custom claim from the ID token into userRole. */
  private async loadRoleClaim(user: User, forceRefresh: boolean): Promise<void> {
    try {
      const tokenResult = await user.getIdTokenResult(forceRefresh);
      this.userRole.set((tokenResult.claims['role'] as UserRole) || null);
    } catch (err) {
      console.error('Error loading user claims:', err);
    }
  }

  /** Live listener on own users/{uid} doc: keeps profile fresh and signs the
   *  user out the moment an admin flips isActive off. */
  private watchProfile(uid: string): void {
    this.profileUnsub = onSnapshot(
      doc(this.firestore, 'users', uid),
      async (snap) => {
        if (this.auth.currentUser?.uid !== uid) return; // stale after sign-out/re-auth
        if (snap.exists()) {
          const profile = snap.data() as AppUser;
          this.userProfile.set(profile);
          if (!this.userRole()) {
            await this.resolveMissingRoleClaim(uid, profile);
            if (this.auth.currentUser?.uid !== uid) return; // signed out during refresh
          }
        }
        this.markReady();
        if (snap.exists() && (snap.data() as AppUser).isActive === false) {
          void this.kickDeactivatedUser();
        }
      },
      (err) => {
        console.error('Error loading user profile:', err);
        this.markReady();
      },
    );
  }

  /**
   * The ID token has no `role` claim. The Firestore profile role is NOT
   * trusted for access (firestore.rules read the claim), but it tells us
   * whether a claim is *expected*: for admin/manager profiles retry once
   * with a forced token refresh (claim may have been set after the last
   * token was minted), and if it is still missing say so loudly instead of
   * silently downgrading — the admin must run firebase/set-custom-claims.js.
   */
  private async resolveMissingRoleClaim(uid: string, profile: AppUser): Promise<void> {
    const user = this.auth.currentUser;
    const expectsClaim = profile.role === 'admin' || profile.role === 'manager';
    if (user && expectsClaim && !this.claimRefreshTried) {
      this.claimRefreshTried = true;
      await this.loadRoleClaim(user, true);
      if (this.userRole()) return;
    }
    if (!this.userRole()) {
      this.userRole.set('viewer');
      if (expectsClaim) {
        console.warn(`[auth] users/${uid} says role "${profile.role}" but the Auth token has no role claim. ` +
          `Run: node firebase/set-custom-claims.js ${uid} ${profile.role}`);
        this.toast.warning(`Your ${profile.role} role is not activated yet — you are in view-only mode. ` +
          'Ask the admin to run set-custom-claims for your account, then log in again.');
      }
    }
  }

  private async kickDeactivatedUser(): Promise<void> {
    this.detachProfileListener();
    await this.logout();
    this.toast.error(DEACTIVATED_MESSAGE);
    await this.router.navigateByUrl('/auth/login');
  }

  private detachProfileListener(): void {
    this.profileUnsub?.();
    this.profileUnsub = null;
  }

  private markReady(): void {
    this.isLoading.set(false);
    this.readyResolvers.forEach((resolve) => resolve());
    this.readyResolvers = [];
  }

  async login(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    try {
      const snap = await getDoc(doc(this.firestore, 'users', credential.user.uid));
      if (snap.exists()) {
        const profile = snap.data() as AppUser;
        if (profile.isActive === false) {
          await signOut(this.auth);
          throw new Error(DEACTIVATED_MESSAGE);
        }
        // Prime the signal so authGuard checks a real profile immediately
        this.userProfile.set(profile);
      }
    } catch (err) {
      if (err instanceof Error && err.message === DEACTIVATED_MESSAGE) throw err;
      // Fail open on network errors — firestore.rules still block data server-side
      console.error('Error checking user status at login:', err);
    }
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

      try {
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
      } catch (writeErr) {
        // Roll back the Auth account so a failed profile write can't leave an
        // orphaned login (email-already-in-use on every future retry). The
        // secondary auth is signed in AS the new user, so it can delete itself.
        try {
          await credential.user.delete();
        } catch (rollbackErr) {
          console.error('Failed to roll back orphaned Auth account:', rollbackErr);
        }
        throw writeErr;
      }

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

  /** Read-side check (segment id, not name). Empty assignment on a viewer = see all. */
  canViewSegment(segmentId: string): boolean {
    return !this.isSegmentRestricted() || this.assignedSegments().includes(segmentId);
  }
}
