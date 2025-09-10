import FAQComponent from "@/app/events/bwai-cloud-2025/components/FAQ";
import Footer from "@/app/events/bwai-cloud-2025/components/Footer";
import Gallery from "@/app/events/bwai-cloud-2025/components/Gallery";
import Header from "@/app/events/bwai-cloud-2025/components/Header";
import Hero from "@/app/events/bwai-cloud-2025/components/Hero";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col">
      <Header />
      <div className="h-24 md:hidden"></div>
      <Hero />
      <FAQComponent />
      <div
        id="gallery"
        className="relative container mx-auto px-4 py-16 max-w-7xl"
      >
        <div className="text-center space-y-4 pb-6 mx-auto">
          <h3 className="mx-auto mt-4 max-w-xs text-2xl font-semibold sm:max-w-none sm:text-4xl md:text-5xl">
            {t("gallery")}
          </h3>
        </div>
      </div>
      <Gallery />
      <Footer />
    </div>
  );
}
