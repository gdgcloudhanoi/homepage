import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CircleCheckBig } from "lucide-react";

import Header from "@/components/header";
import { Footer, Legal } from "@/components/footer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Section, SectionLabel } from "@/components/section";
import { RegisterLink, RegistrationForm } from "./components/form";
import { TicketButton } from "./components/ticket-button";
import { getTicketPublicKey } from "./ticket";

const title = "DevFest Cloud Hanoi 2026";
const description =
  "Hội nghị Google Cloud và AI thường niên của GDG Cloud Hanoi. 13:00 - 17:30, Thứ Bảy, 31/10/2026 tại Mövenpick Living West Hanoi. Talk, codelab thực hành và networking. Miễn phí, đăng ký ngay.";

export const metadata: Metadata = {
  title,
  description,
  // Also drops ?ticket= from the indexed URL.
  alternates: { canonical: "/events/devfest-cloud-2026" },
  openGraph: {
    type: "website",
    siteName: "GDG Cloud Hanoi",
    locale: "vi_VN",
    url: "/events/devfest-cloud-2026",
    title,
    description,
    // Setting openGraph here drops the inherited app/opengraph-image.jpg.
    images: [{ url: "/opengraph-image.jpg", width: 1200, height: 630 }],
  },
};

const date = "Thứ Bảy, 31 tháng 10, 2026";

const ctaClass =
  "inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-5 text-base leading-8 font-medium text-canvas outline-none hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:bg-brand-active";

const registerLink = <RegisterLink className={ctaClass} />;

// Not a bracketed glyph: [x] / (*) are the form's selectors. mt-1 centres it on the 24px first line.
const checkMark = <CircleCheckBig className="mt-1 size-4 shrink-0 text-ink" />;

const features = [
  [
    "Talk chuyên sâu",
    "Chia sẻ từ các Google Developer Expert và chuyên gia trong ngành về Google Cloud, Gemini và AI agent.",
  ],
  [
    "Codelab thực hành",
    "Tự tay xây dựng ứng dụng với Gemini và các công cụ mới nhất của Google Cloud.",
  ],
  [
    "Kết nối",
    "Gặp gỡ, trao đổi với lập trình viên, kỹ sư và những người yêu công nghệ tại Hà Nội.",
  ],
  [
    "Minigame & quà tặng",
    "Tham gia minigame và nhận những phần quà nhỏ dành cho người tham dự.",
  ],
];

const gallery = [
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/1.jpg?alt=media&token=d1fa0f6d-8090-440a-8a06-5a8ceb1ee708",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/2.jpg?alt=media&token=e8f4dacf-8923-4b44-91ee-80894c948e9a",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/3.jpg?alt=media&token=59b4488d-7622-4875-8784-3b857199e585",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/4.jpg?alt=media&token=9a78e779-8ccb-4850-9201-b66d9d46dbe1",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/5.jpg?alt=media&token=6a502831-6316-481b-89b2-409538531793",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/6.jpg?alt=media&token=94a3699b-8670-4802-9ad8-968ced077b11",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/7.jpg?alt=media&token=a0895edf-6e3d-4aec-93c5-1368a2905b40",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/8.jpg?alt=media&token=5e5a5a2b-d754-47f4-aeae-4cbfa52011f1",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/9.jpg?alt=media&token=61a1cac1-a440-4dfd-a5d6-5c7dd87f12cd",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/10.jpg?alt=media&token=7e82ab17-dec0-484d-88de-ff5761ba3bc9",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/11.jpg?alt=media&token=68dded5b-6cdc-4f90-96e8-e37e698f232d",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/12.jpg?alt=media&token=d6eb198b-6665-4478-b0f9-7f2f41c67ca8",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/13.jpg?alt=media&token=a19f3965-fb5d-4e07-951a-48cce9a3ea10",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/14.jpg?alt=media&token=316bafd8-206b-4a57-b1b5-4d2554f833e3",
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/15.jpg?alt=media&token=0e50c571-2bd7-41c1-9fa4-32cf838cbd10",
];

const stats = [
  ["7", "Mùa DevFest Cloud"],
  ["80+", "Sự kiện cộng đồng từ 2019"],
  ["15.000+", "Thành viên & người theo dõi"],
];

// [time, kind, title, speaker, speaker role]
const agenda = [
  ["12:30 - 13:20", "", "Check-in & Networking"],
  [
    "13:30 - 14:10",
    "Techtalk",
    "MCP? I Hardly Know Her!",
    "Mr. Weiyuan Liu",
    "Director of Engineering @ Ascenda; Google Developer Expert @ Cloud and AI",
  ],
  [
    "14:10 - 14:25",
    "Techtalk",
    "Google Antigravity - The Enterprise Agent-first Developer Platform",
    "Mr. Huy Nguyen",
    "Customer Solutions Consultant @ Google Cloud",
  ],
  [
    "14:25 - 14:55",
    "Codelab",
    "Build an AI Agent with Google ADK",
    "Mr. Nguyen Anh Duong",
    "Founder & CEO @ ZenAI; Google Developer Expert @ ML",
  ],
  ["14:55 - 15:15", "", "Tea Break & Networking"],
  [
    "15:15 - 15:55",
    "Techtalk",
    "Untrusted Devices, Trusted AI with Firebase AI Logic",
    "Ms. Cleo",
    "Google Developer Expert @ Firebase, Cloud AI and Google Maps; Engineering Manager @ Factory",
  ],
  [
    "15:55 - 16:40",
    "Techtalk",
    "Gemini, What Am I Looking At? Shipping a Spatial AI App with AI Studio, Gemini 3.8 Flash and Cloud Run",
    "Ms. Nguyen Khanh Linh",
    "Google Developer Expert @ AI/ML; Head of AI @ Obello",
  ],
  [
    "16:40 - 17:15",
    "Buildathon",
    "DevFest Cloud Buildathon: Top 3 Project Presentations & Awards",
    "Top 3 Selected Teams",
  ],
  ["17:15 - 17:30", "", "Closing Session & Group Photo"],
];

const faqs = [
  [
    "Tham dự sự kiện có mất phí không?",
    "Không. Sự kiện hoàn toàn miễn phí, nhưng bạn cần đăng ký trước để được check-in. Số lượng chỗ có hạn, vì vậy hãy đăng ký sớm.",
  ],
  [
    "Sự kiện diễn ra khi nào và ở đâu?",
    "Sự kiện diễn ra từ 13:00 đến 17:30, thứ Bảy, 31/10/2026 tại Khách sạn Mövenpick Living West Hanoi, 21 Duy Tân, Cầu Giấy, Hà Nội.",
  ],
  [
    "Tôi không phải lập trình viên, có tham gia được không?",
    "Hoàn toàn được. Sự kiện dành cho sinh viên, lập trình viên, kỹ sư Cloud/DevOps, Data/ML và bất kỳ ai quan tâm đến Google Cloud và AI, dù bạn mới bắt đầu hay đã có nhiều kinh nghiệm.",
  ],
  [
    "Tôi có cần mang theo laptop không?",
    "Nên mang theo nếu bạn muốn tham gia các phiên codelab thực hành. Hãy sạc đầy pin và chuẩn bị sẵn một tài khoản Google.",
  ],
  [
    "Người tham dự sẽ nhận được gì?",
    "Kiến thức và kinh nghiệm thực tế từ các diễn giả, cơ hội kết nối với cộng đồng, cùng những phần quà nhỏ dành cho người tham dự.",
  ],
  [
    "Làm sao để nhận thông tin mới nhất về sự kiện?",
    "Theo dõi GDG Cloud Hanoi trên Facebook và LinkedIn, hoặc chọn nhận thông tin cập nhật khi đăng ký. Nếu có thắc mắc khác, hãy gửi email tới hello@gdgcloudhanoi.dev.",
  ],
];

const details = [
  ["Ngày", date],
  ["Thời gian", "13:00 - 17:30"],
  [
    "Địa điểm",
    "Khách sạn Mövenpick Living West Hanoi - 21 Duy Tân, Cầu Giấy, Hà Nội",
  ],
];

export default function Page() {
  return (
    <div className="bg-canvas pb-20 text-base text-ink">
      <div className="mx-auto w-full max-w-frame border-hairline lg:border lg:border-t-0">
        <Header />
        <Link
          href="/photos"
          className="group flex items-center justify-center gap-2 border-b border-hairline bg-surface-soft px-6 py-2.5 text-center text-sm text-body transition-colors hover:bg-surface-card lg:px-20"
        >
          <span>
            Xem lại khoảnh khắc của bạn
            tại DevFest Cloud Hanoi 2026
          </span>
          <ArrowRight className="size-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
        </Link>
        <main>
          <Section className="relative isolate grid items-center gap-8 overflow-hidden py-16 md:grid-cols-[1fr_auto] lg:py-24">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-caption text-mute">
                <span className="rounded-lg bg-surface-dark px-2 leading-6 text-on-dark">
                  Mới
                </span>
                Đăng ký tham dự miễn phí đã mở
              </p>
              <h1 className="mt-4 text-[28px] leading-normal font-bold md:text-display">
                Google DevFest Cloud Hanoi 2026
              </h1>
              <p className="mt-2 max-w-xl text-body">
                Build, Secure, Scale: Developers and Builders in the Agentic
                Era.
              </p>
              <ul className="mt-6 flex flex-wrap gap-x-6 text-body">
                {[date, "13:00 - 17:30", "Mövenpick Living West Hanoi"].map((fact) => (
                  <li key={fact} className="flex gap-2 py-1">
                    {checkMark}
                    {fact}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {/* ?ticket= is only known in the browser; the static HTML shows the register link. */}
                <Suspense fallback={registerLink}>
                  <TicketButton
                    publicKey={getTicketPublicKey()}
                    details={details}
                    className={ctaClass}
                  >
                    {registerLink}
                  </TicketButton>
                </Suspense>
              </div>
            </div>
            <div className="hidden p-8 md:block lg:p-12">
              <Image
                src="/hero-df26.png"
                alt=""
                width={683}
                height={745}
                sizes="(min-width: 1024px) 288px, 224px"
                className="w-56 lg:w-72"
              />
            </div>
          </Section>

          <Section id="agenda" className="scroll-mt-20">
            <SectionLabel>Agenda</SectionLabel>
            {/* Below md the table collapses into stacked rows. */}
            <table className="w-full text-left text-body max-md:block">
              <thead className="max-md:hidden">
                <tr className="border-b border-hairline-strong">
                  <th className="w-36 py-2 pr-6 font-bold text-ink">Thời gian</th>
                  <th className="py-2 pr-6 font-bold text-ink">Phiên</th>
                  <th className="w-[34%] py-2 font-bold text-ink">Diễn giả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline max-md:block">
                {agenda.map(([time, kind, title, speaker, role]) => (
                  <tr key={time} className="align-top max-md:block max-md:py-4 max-md:first:pt-0">
                    <td className="py-4 pr-6 font-medium text-ink tabular-nums max-md:block max-md:p-0 max-md:text-caption">
                      {time}
                    </td>
                    <td
                      colSpan={speaker ? 1 : 2}
                      className="py-4 pr-6 max-md:block max-md:p-0"
                    >
                      {kind && (
                        <span className="block text-caption text-mute">{kind}</span>
                      )}
                      <span className={kind ? "font-medium text-ink" : "text-mute"}>
                        {title}
                      </span>
                    </td>
                    {speaker && (
                      <td className="py-4 max-md:block max-md:p-0 max-md:pt-2">
                        <span className="block text-ink">{speaker}</span>
                        {role && (
                          <span className="block text-caption text-mute">{role}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <dl className="grid grid-cols-1 divide-y divide-hairline border-t border-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
            {stats.map(([value, label]) => (
              <div
                key={label}
                className="flex flex-col-reverse gap-1 p-5 md:p-8"
              >
                <dt className="text-body">{label}</dt>
                <dd className="text-[28px] leading-normal font-bold text-ink md:text-display">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <Carousel
            opts={{ loop: true }}
            className="border-t border-hairline bg-surface-dark"
          >
            <CarouselContent className="ml-0">
              {gallery.map((src, i) => (
                <CarouselItem key={i} className="pl-0">
                  <div className="relative aspect-2048/1365">
                    <Image
                      src={src}
                      alt={`Ảnh ${i + 1}`}
                      fill
                      sizes="100vw"
                      className="object-cover"
                      priority={i === 0}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-4" />
            <CarouselNext className="right-4" />
          </Carousel>

          <Section>
            <SectionLabel>DevFest Cloud là gì?</SectionLabel>
            <p className="mb-4 max-w-2xl text-body">
              DevFest là chuỗi hội nghị công nghệ do cộng đồng tổ chức lớn nhất
              thế giới, diễn ra hằng năm tại hàng trăm thành phố và do các nhóm
              Google Developer Groups (GDG) địa phương tự tổ chức. DevFest Cloud
              Hanoi là phiên bản tập trung vào Google Cloud và AI tại Hà Nội, do
              GDG Cloud Hanoi – cộng đồng phi lợi nhuận của những người làm
              Cloud – tổ chức. Năm nay, sự kiện xoay quanh cách xây dựng, bảo
              mật và mở rộng ứng dụng trong kỷ nguyên AI agent.
            </p>
            <ul>
              {features.map(([label, description]) => (
                <li key={label} className="flex gap-2 py-2 text-body">
                  {checkMark}
                  <div className="flex flex-col md:flex-row md:gap-2">
                    <span className="font-medium text-ink md:shrink-0">
                      {label}
                    </span>
                    <span>{description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section>
            <SectionLabel>Câu hỏi thường gặp</SectionLabel>
            <Accordion>
              {faqs.map(([question, answer]) => (
                <AccordionItem key={question} value={question}>
                  <AccordionTrigger>{question}</AccordionTrigger>
                  <AccordionContent>{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>

          <Section
            id="register"
            className="grid scroll-mt-20 gap-12 lg:grid-cols-[1fr_480px]"
          >
            <div>
              <SectionLabel>Đăng ký</SectionLabel>
              <p className="max-w-md text-body">
                Giữ chỗ chỉ trong vài phút. Bạn sẽ nhận được xác nhận ngay khi
                đăng ký thành công.
              </p>

              <SectionLabel className="mt-12">Thông tin</SectionLabel>
              <ul>
                {details.map(([label, value]) => (
                  <li key={label} className="flex gap-2 py-2 text-body">
                    {checkMark}
                    <div className="flex flex-col md:flex-row md:gap-2">
                      <span className="font-medium text-ink md:shrink-0">
                        {label}
                      </span>
                      <span>{value}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <RegistrationForm />
          </Section>
        </main>
        <Footer />
      </div>
      <Legal />
    </div>
  );
}
