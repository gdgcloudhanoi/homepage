import { z } from "zod";

export const roles = [
  { value: "developer", label: "Lập trình viên / Kỹ sư phần mềm" },
  { value: "cloud", label: "Kỹ sư Cloud / DevOps / SRE" },
  { value: "data-ai", label: "Kỹ sư Data / AI / ML" },
  { value: "security", label: "Kỹ sư bảo mật" },
  { value: "non-tech", label: "Product, thiết kế, kinh doanh" },
  { value: "student", label: "Sinh viên" },
  { value: "other", label: "Khác" },
] as const;

export const genders = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
  { value: "unspecified", label: "Không muốn tiết lộ" },
] as const;

export const levels = [
  { value: "new", label: "Mới bắt đầu", hint: "Chưa từng sử dụng" },
  { value: "some", label: "Đã thử", hint: "Đã dùng thử một vài dịch vụ" },
  { value: "daily", label: "Thường xuyên", hint: "Sử dụng trong công việc" },
  { value: "certified", label: "Chuyên sâu", hint: "Đã có chứng chỉ Google Cloud" },
] as const;

// Mirrors the 2026 theme: Build (AI/agents), Secure, Scale, plus past codelab topics.
export const topics = [
  { value: "agents", label: "AI agent & Agent Development Kit (ADK)" },
  { value: "gemini", label: "Gemini API & AI tạo sinh" },
  { value: "ai-coding", label: "Lập trình cùng AI với Gemini CLI" },
  { value: "rag", label: "RAG & Vertex AI" },
  { value: "security", label: "Bảo mật ứng dụng AI & Cloud" },
  { value: "scale", label: "Mở rộng hệ thống với Cloud Run & GKE" },
  { value: "data", label: "Dữ liệu & BigQuery" },
  { value: "firebase", label: "Firebase & Flutter" },
] as const;

const linkedinError =
  "Nhập đường dẫn hồ sơ LinkedIn, ví dụ https://www.linkedin.com/in/…";

// Shared by the form (client) and the register action (server).
export const registrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập họ và tên")
    .max(100, "Tối đa 100 ký tự"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Vui lòng nhập email")
    .pipe(z.email("Email không hợp lệ").max(254, "Email quá dài")),
  // 8–15 digits, optionally separated by single spaces, dots or dashes.
  phone: z
    .string()
    .trim()
    .regex(/^(\+?(\d[ .-]?){7,14}\d)?$/, "Số điện thoại không hợp lệ"),
  birthYear: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Nhập năm sinh gồm 4 chữ số")
    .transform(Number)
    .refine(
      (year) => year >= 1900 && year <= new Date().getFullYear(),
      "Năm sinh không hợp lệ",
    ),
  company: z.string().trim().max(100, "Tối đa 100 ký tự"),
  title: z.string().trim().max(100, "Tối đa 100 ký tự"),
  linkedin: z
    .string()
    .trim()
    .transform((value) =>
      value && !/^https?:\/\//i.test(value) ? `https://${value}` : value,
    )
    .pipe(
      z.union([
        z.literal(""),
        z
          .url({
            protocol: /^https?$/,
            hostname: /^([a-z0-9-]+\.)*linkedin\.com$/i,
            normalize: true,
            error: linkedinError,
          })
          .max(200, linkedinError),
      ]),
    ),
  gender: z
    .string()
    .pipe(
      z.enum(
        genders.map((gender) => gender.value),
        "Vui lòng chọn giới tính",
      ),
    ),
  role: z
    .string()
    .pipe(
      z.enum(
        roles.map((role) => role.value),
        "Vui lòng chọn vai trò của bạn",
      ),
    ),
  level: z
    .string()
    .pipe(
      z.enum(
        levels.map((level) => level.value),
        "Vui lòng chọn mức độ kinh nghiệm",
      ),
    ),
  topics: z
    .array(z.enum(topics.map((topic) => topic.value)))
    .refine((values) => new Set(values).size === values.length),
  laptop: z.boolean(),
  question: z.string().trim().max(1000, "Tối đa 1000 ký tự"),
  terms: z
    .boolean()
    .refine((checked) => checked, "Bạn cần đồng ý với Điều khoản tham gia GDG"),
  updates: z.boolean(),
});

export type RegistrationInput = z.input<typeof registrationSchema>;
