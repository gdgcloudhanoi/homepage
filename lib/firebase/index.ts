import { getFirestore } from "firebase/firestore";
import { getFirebaseApp } from "./app";

// Kept in ./app so analytics can load the app without pulling in Firestore.
export { getFirebaseApp };

export const getFirebaseDb = () => getFirestore(getFirebaseApp());
