import { InjectionToken, Provider } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FirebaseApp');
export const FIRESTORE = new InjectionToken<Firestore>('Firestore');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FirebaseAuth');
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('FirebaseStorage');

let _app: FirebaseApp | null = null;
let _firestore: Firestore | null = null;
let _auth: Auth | null = null;
let _storage: FirebaseStorage | null = null;

function getOrCreateApp(): FirebaseApp {
  if (!_app) {
    _app = initializeApp(environment.firebase);
  }
  return _app;
}

function getOrCreateFirestore(): Firestore {
  if (!_firestore) {
    _firestore = initializeFirestore(getOrCreateApp(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  }
  return _firestore;
}

function getOrCreateAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getOrCreateApp());
  }
  return _auth;
}

function getOrCreateStorage(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(getOrCreateApp());
  }
  return _storage;
}

export function provideFirebase(): Provider[] {
  return [
    { provide: FIREBASE_APP, useFactory: getOrCreateApp },
    { provide: FIRESTORE, useFactory: getOrCreateFirestore },
    { provide: FIREBASE_AUTH, useFactory: getOrCreateAuth },
    { provide: FIREBASE_STORAGE, useFactory: getOrCreateStorage },
  ];
}
