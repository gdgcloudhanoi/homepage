import { getFirebaseApp } from "@/lib/firebase";
import { getCrashlytics } from "firebase/crashlytics";

export function startCrashlytics() {
  getCrashlytics(getFirebaseApp(), {
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
  });
}
