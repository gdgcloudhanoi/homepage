"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import Footer from "@/app/events/bwai-cloud-2025/components/Footer";
import Gallery from "@/app/events/bwai-cloud-2025/components/Gallery";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/app/events/bwai-cloud-2025/components/LanguageSwitcher";

export default function Page() {
  const t = useTranslations();

  return (
    <div className="flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur shadow-md">
        <nav className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link className="flex gap-2 font-semibold" href="/events/bwai-cloud-2025">
            <ChevronLeftIcon />
            {t("home")}
          </Link>
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center"
            >
              <Image
                src="/bwai-cloud-2025/gdg_cloud_hanoi.png"
                alt="Logo"
                width={192}
                height={60}
                className="h-8 object-contain"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center"
            >
              <LanguageSwitcher />
            </motion.div>
          </div>
        </nav>
      </header>
      <div className="h-18"></div>
      <Gallery />
      <Footer />
    </div>
  );
}
