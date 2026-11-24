"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

import { Button } from "@/components/ui/button";
import {
  readConsent,
  reopenConsent,
  setAnalyticsConsent,
  subscribeConsent,
  track,
  trackPageView,
} from "@/lib/firebase/analytics";

const reportWebVitals: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (metric.name === "LCP" || metric.name === "INP" || metric.name === "CLS") {
    track(metric.name, {
      value: metric.delta,
      metric_id: metric.id,
      metric_value: metric.value,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
    });
  }
};

export function Analytics() {
  const pathname = usePathname();
  // "pending" on the server and during hydration, so the banner never flashes for decided visitors.
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "pending");

  useReportWebVitals(reportWebVitals);
  useEffect(() => {
    trackPageView();
  }, [pathname]);

  if (consent !== null || pathname.startsWith("/platform")) return null;

  return (
    <div
      role="region"
      aria-label="Cookie"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas text-ink"
    >
      <div className="mx-auto flex max-w-frame flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4 lg:px-20">
        <p className="text-caption text-mute">
          Trang dùng Google Analytics để thống kê lượt truy cập. Khi chưa đồng ý,
          chỉ gửi thống kê ẩn danh, không lưu cookie.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setAnalyticsConsent(false)}>
            Từ chối
          </Button>
          <Button onClick={() => setAnalyticsConsent(true)}>Đồng ý</Button>
        </div>
      </div>
    </div>
  );
}

export function ConsentSettingsButton() {
  return (
    <button type="button" onClick={reopenConsent} className="hover:text-ink">
      Tuỳ chọn cookie
    </button>
  );
}
