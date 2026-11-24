import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";

export const photos = () => getAdminDb().collection("photos");
export const faces = () => getAdminDb().collection("faces");
export const searches = () => getAdminDb().collection("search");

// Firebase Storage link that works for anyone holding the object's download token.
export const downloadUrl = (bucket: string, path: string, token: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
