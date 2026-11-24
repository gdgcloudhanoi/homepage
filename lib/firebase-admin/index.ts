import "server-only";
import {
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export const getAdminApp = (): App =>
  getApps().length > 0 ? getApp() : initializeApp();

export const getAdminDb = () => getFirestore(getAdminApp());

export const getAdminBucket = () =>
  getStorage(getAdminApp()).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
