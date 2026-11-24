"use server";

import { FieldValue, GrpcStatus } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendMail } from "@/lib/mail";
import {
  genders,
  levels,
  registrationSchema,
  roles,
  topics,
  type RegistrationInput,
} from "./registration";
import { createTicket } from "./ticket";

// Fixed origin: never build email links from request headers (Host header injection).
const siteUrl = "https://gdgcloudhanoi.dev";
const eventUrl = `${siteUrl}/events/devfest-cloud-2026`;
const contactEmail = "hello@gdgcloudhanoi.dev";
const headerUrl =
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/email-header-df26.png?alt=media&token=63c581eb-c219-4be9-9e66-740b43710224";
const logoUrl =
  "https://firebasestorage.googleapis.com/v0/b/gdg-cloud-hanoi.firebasestorage.app/o/email-footer-df26.png?alt=media&token=8bb4066e-902b-469c-8a75-11ffc0e589d7";
const font = "'Google Sans',Roboto,Arial,Helvetica,sans-serif";
// The PNGs are transparent; forced dark modes recolor background-color but not background-image.
const imageBacking =
  "background-color:#f8f9fa;background-image:linear-gradient(#f8f9fa,#f8f9fa);";

const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string,
) => options.find((option) => option.value === value)?.label ?? value;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export async function register(input: RegistrationInput) {
  const data = registrationSchema.parse(input);
  const { signature, ticket } = createTicket(data.email);
  const ref = getAdminDb()
    .collection("events/devfest-cloud-2026/registrations")
    .doc(data.email);

  try {
    // create() fails when the doc exists, so each email registers once.
    await ref.create({
      ...data,
      signature,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === GrpcStatus.ALREADY_EXISTS) {
      return { status: "duplicate" } as const;
    }
    throw error;
  }

  const url = `${eventUrl}?ticket=${ticket}`;
  const rows = [
    ["Họ và tên", data.name],
    ["Email", data.email],
    ["Số điện thoại", data.phone],
    ["Năm sinh", String(data.birthYear)],
    ["Công ty / Trường học", data.company],
    ["Chức danh / Chuyên ngành", data.title],
    ["LinkedIn", data.linkedin],
    ["Giới tính", labelOf(genders, data.gender)],
    ["Vai trò", labelOf(roles, data.role)],
    ["Kinh nghiệm với Google Cloud", labelOf(levels, data.level)],
    [
      "Chủ đề quan tâm",
      data.topics.map((topic) => labelOf(topics, topic)).join(", "),
    ],
    ["Mang laptop", data.laptop ? "Có" : "Không"],
    ["Câu hỏi", data.question],
    ["Nhận thông tin cập nhật", data.updates ? "Có" : "Không"],
  ].filter(([, value]) => value);

  try {
    await sendMail({
      to: data.email,
      subject: "Xác nhận đăng ký DevFest Cloud Hanoi 2026",
      text: [
        `Chào ${data.name},`,
        "",
        "Bạn đã đăng ký thành công DevFest Cloud Hanoi 2026. Hẹn gặp bạn lúc 13:00 - 17:30, thứ Bảy, 31/10/2026 tại Khách sạn Mövenpick Living West Hanoi, 21 Duy Tân, Cầu Giấy, Hà Nội!",
        "",
        `Vé của bạn: ${url}`,
        "Mở vé và xuất trình mã QR khi check-in tại sự kiện.",
        "",
        "Thông tin đăng ký:",
        ...rows.map(([label, value]) => `- ${label}: ${value}`),
        "",
        `GDG Cloud Hanoi · ${siteUrl}`,
        "Bạn nhận được email này vì đã đăng ký tham dự DevFest Cloud Hanoi 2026.",
        `Cần hỗ trợ? Liên hệ ${contactEmail}`,
      ].join("\n"),
      // Table layout + inline styles; the <style> tags only carry hints that are safe to strip.
      html: `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Xác nhận đăng ký DevFest Cloud Hanoi 2026</title>
<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>
<!--[if mso]><style>*{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f3f4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Vé DevFest Cloud Hanoi 2026 của bạn đã sẵn sàng.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f3f4" style="background-color:#f1f3f4;">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f9fa" style="width:100%;max-width:600px;background-color:#f8f9fa;border:1px solid #dadce0;border-radius:8px;border-collapse:separate;overflow:hidden;font-family:${font};color:#3c4043;">
<tr><td style="${imageBacking}border-radius:7px 7px 0 0;">
<a href="${escapeHtml(url)}"><img src="${escapeHtml(headerUrl)}" width="600" height="228" alt="DevFest Cloud Hanoi · October 31st, 2026" style="display:block;width:100%;height:auto;border:0;border-radius:7px 7px 0 0;"></a>
</td></tr>
<tr><td style="padding:32px 32px 0;">
<p style="margin:0 0 16px;font-size:14px;line-height:24px;"><span style="display:inline-block;padding:2px 10px;border-radius:4px;background-color:#e6f4ea;font-weight:500;line-height:20px;color:#137333;">Đăng ký thành công</span></p>
<h1 style="margin:0 0 8px;font-family:${font};font-size:24px;line-height:32px;font-weight:700;color:#202124;">Chào ${escapeHtml(data.name)},</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#3c4043;">Cảm ơn bạn đã đăng ký tham dự <strong style="color:#202124;">DevFest Cloud Hanoi 2026</strong>. Hẹn gặp bạn lúc <strong style="color:#202124;">13:00 - 17:30, thứ Bảy, 31/10/2026</strong> tại <strong style="color:#202124;">Khách sạn Mövenpick Living West Hanoi</strong>, 21 Duy Tân, Cầu Giấy, Hà Nội!</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#1a73e8" style="border-radius:4px;background-color:#1a73e8;mso-padding-alt:12px 24px;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-family:${font};font-size:16px;line-height:20px;font-weight:500;color:#ffffff;text-decoration:none;border-radius:4px;">Xem vé của bạn</a>
</td>
</tr></table>
<p style="margin:12px 0 0;font-size:14px;line-height:20px;color:#5f6368;">Mở vé và xuất trình mã QR khi check-in tại sự kiện.</p>
</td></tr>
<tr><td style="padding:32px 32px 0;">
<h2 style="margin:0 0 12px;font-family:${font};font-size:16px;line-height:24px;font-weight:700;color:#202124;">Thông tin đăng ký</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f3f4" style="background-color:#f1f3f4;border-radius:4px;">
<tr><td style="padding:4px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows
  .map(([label, value], index) => {
    const cell = `padding:10px 0;${index ? "border-top:1px solid #dadce0;" : ""}font-size:14px;line-height:20px;`;
    return `<tr><td valign="top" style="${cell}width:40%;padding-right:16px;color:#5f6368;">${label}</td><td valign="top" style="${cell}color:#202124;word-break:break-word;">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`;
  })
  .join("\n")}
</table>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="padding-top:24px;border-top:1px solid #dadce0;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="${imageBacking}padding:8px 12px;border-radius:4px;">
<a href="${siteUrl}"><img src="${escapeHtml(logoUrl)}" width="192" height="40" alt="GDG Cloud Hanoi" style="display:block;width:192px;height:auto;border:0;"></a>
</td>
</tr></table>
<p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#5f6368;text-align:center;">Bạn nhận được email này vì đã đăng ký tham dự DevFest Cloud Hanoi 2026.<br>Cần hỗ trợ? Liên hệ <a href="mailto:${contactEmail}" style="color:#1a73e8;text-decoration:none;">${contactEmail}</a></p>
</td>
</tr></table>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`,
    });
  } catch (error) {
    // Roll back so the attendee can retry instead of being stuck without a ticket.
    await ref.delete();
    throw error;
  }

  return {
    status: "registered",
    name: data.name,
    email: data.email,
    role: data.role,
  } as const;
}
