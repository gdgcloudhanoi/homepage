"use client";

import Image from "next/image";
import { motion } from "motion/react";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
        style={{ willChange: "transform" }}
      >
        <Image src="/gdg.png" alt="GDG" width={128} height={128} priority />
      </motion.div>
    </main>
  );
}
