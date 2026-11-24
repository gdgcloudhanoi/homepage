"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WEBVIEW_UA =
  /wv\)|WebView|FBAV\/|FBAN\/|Instagram|Twitter|LinkedInApp/i;

function isWebView() {
  const ua = navigator.userAgent;
  return (
    WEBVIEW_UA.test(ua) ||
    (/iPad|iPhone|iPod/.test(ua) && !/Safari\//i.test(ua)) ||
    (/Android/.test(ua) && !/Chrome\//i.test(ua) && !/Firefox\//i.test(ua))
  );
}

const subscribe = () => () => {};

// Asks visitors inside in-app browsers (Facebook, Instagram, …) to reopen the
// page in their default browser.
export function OpenInBrowser({ children }: { children: React.ReactNode }) {
  const t = useTranslations("openInBrowser");
  const webView = useSyncExternalStore(subscribe, isWebView, () => false);
  const [dismissed, setDismissed] = useState(false);

  const openInBrowser = () => {
    const url = window.location.href;
    if (/android/i.test(navigator.userAgent)) {
      window.location.href = `intent:${url}#Intent;action=android.intent.action.VIEW;end`;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      {children}
      <Dialog
        open={webView && !dismissed}
        onOpenChange={(open) => setDismissed(!open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissed(true)}>
              {t("continueHere")}
            </Button>
            <Button onClick={openInBrowser}>{t("openInBrowser")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
