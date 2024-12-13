import { firebaseConfig } from "@/app/events/devfest-cloud-2024/firebase";
import { initializeApp } from "firebase/app";

const app = initializeApp(firebaseConfig);

export default function useFirebase() {
  return { app };
}
