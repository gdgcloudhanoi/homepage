"use client";

import Loading from "@/components/loading";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      window.location.replace("/events/devfest-cloud-2026");
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return <Loading />;
}
