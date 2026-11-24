"use client";

import { useEffect, useRef } from "react";
import {
  createFormHook,
  createFormHookContexts,
  revalidateLogic,
} from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { SectionLabel } from "@/components/section";
import { track } from "@/lib/firebase/analytics";
import { cn } from "@/lib/utils";
import { register } from "../actions";
import {
  genders,
  levels,
  registrationSchema,
  roles,
  topics,
  type RegistrationInput,
} from "../registration";
import { TicketFace } from "./ticket-button";
// import { BirthDatePicker } from "./date-picker";

const defaultValues: RegistrationInput = {
  name: "",
  email: "",
  phone: "",
  birthYear: "",
  company: "",
  title: "",
  linkedin: "",
  gender: "",
  role: "",
  level: "",
  topics: [],
  laptop: false,
  question: "",
  terms: false,
  updates: false,
};

const inputClass =
  "h-10 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-base text-ink outline-none placeholder:text-ash focus:border-brand focus:bg-canvas aria-invalid:border-danger aria-invalid:focus:border-danger";

const optionClass =
  "flex cursor-pointer gap-2 py-2 text-body has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand";

function Marker({ on, off }: { on: string; off: string }) {
  const className = "shrink-0 font-mono text-code whitespace-pre text-ink";
  return (
    <>
      <span
        className={cn(className, "peer-checked:hidden peer-aria-invalid:text-danger")}
      >
        {off}
      </span>
      <span className={cn(className, "hidden peer-checked:inline")}>{on}</span>
    </>
  );
}

function ErrorText({
  children,
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      {...props}
      className={cn("flex gap-2 text-caption leading-snug text-danger", className)}
    >
      <span aria-hidden className="shrink-0 font-mono text-code">
        [!]
      </span>
      <span>{children}</span>
    </p>
  );
}

function FieldError({ name, error }: { name: string; error?: string }) {
  if (!error) return null;
  return <ErrorText id={`${name}-error`}>{error}</ErrorText>;
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium text-ink">
        {label}
      </label>
      {children}
      <FieldError name={htmlFor} error={error} />
    </div>
  );
}

const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

function TextField({
  label,
  ...props
}: { label: string } & React.ComponentProps<"input">) {
  const field = useFieldContext<string>();
  const error: string | undefined = field.state.meta.errors[0]?.message;
  return (
    <Field label={label} htmlFor={field.name} error={error}>
      <input
        {...props}
        id={field.name}
        name={field.name}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${field.name}-error` : undefined}
        className={inputClass}
      />
    </Field>
  );
}

function TextareaField({
  label,
  ...props
}: { label: string } & React.ComponentProps<"textarea">) {
  const field = useFieldContext<string>();
  const error: string | undefined = field.state.meta.errors[0]?.message;
  return (
    <Field label={label} htmlFor={field.name} error={error}>
      <textarea
        {...props}
        id={field.name}
        name={field.name}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${field.name}-error` : undefined}
        className={cn(inputClass, "h-auto resize-y p-3")}
      />
    </Field>
  );
}

function CheckboxField({
  required,
  children,
}: {
  required?: boolean;
  children: React.ReactNode;
}) {
  const field = useFieldContext<boolean>();
  const error: string | undefined = field.state.meta.errors[0]?.message;
  return (
    <>
      <label className={optionClass}>
        <input
          type="checkbox"
          id={field.name}
          name={field.name}
          required={required}
          checked={field.state.value}
          onChange={(event) => field.handleChange(event.target.checked)}
          onBlur={field.handleBlur}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.name}-error` : undefined}
          className="peer sr-only"
        />
        <Marker on="[x]" off="[ ]" />
        <span>{children}</span>
      </label>
      <FieldError name={field.name} error={error} />
    </>
  );
}

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, CheckboxField },
  formComponents: {},
});

// Perforation notches cut into the ticket: circles in the page colour.
const notchClass =
  "absolute top-0 size-6 -translate-y-1/2 rounded-full bg-canvas";

function Registered({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // This replaces a much taller form, which would leave the viewport below it.
  useEffect(() => {
    headingRef.current?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div>
      <SectionLabel
        ref={headingRef}
        tabIndex={-1}
        className="scroll-mt-24 outline-none"
      >
        Đăng ký thành công
      </SectionLabel>
      <p className="text-body">Vé tham dự đã được gửi tới email của bạn.</p>

      <div className="mt-6 overflow-hidden rounded-2xl bg-surface-card text-ink">
        <TicketFace badge="Đã đăng ký">
          <dt className="text-mute">Người tham dự</dt>
          <dd className="font-medium">{name}</dd>
          <dt className="text-mute">Vai trò</dt>
          <dd className="font-medium">
            {roles.find((option) => option.value === role)?.label}
          </dd>
          <dt className="text-mute">Email</dt>
          <dd className="font-mono text-code break-all">{email}</dd>
        </TicketFace>
        <div className="relative border-t-2 border-dashed border-hairline p-5 md:p-6">
          <span aria-hidden className={`${notchClass} left-0 -translate-x-1/2`} />
          <span aria-hidden className={`${notchClass} right-0 translate-x-1/2`} />
          <ol>
            {[
              "Mở email xác nhận từ GDG Cloud Hanoi.",
              <>
                Bấm <span className="font-medium text-ink">Xem vé của bạn</span>{" "}
                để hiện mã QR.
              </>,
              "Xuất trình mã QR khi check-in tại sự kiện.",
            ].map((step, index) => (
              <li key={index} className="flex gap-2 py-1 text-body">
                <span className="text-ink">[{index + 1}]</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="mt-4 text-caption text-mute">
        Không thấy email? Hãy kiểm tra mục Thư rác hoặc Quảng cáo, hoặc liên
        hệ{" "}
        <a href="mailto:hello@gdgcloudhanoi.dev" className="text-ink underline">
          hello@gdgcloudhanoi.dev
        </a>
        .
      </p>
    </div>
  );
}

export function RegisterLink({ className }: { className: string }) {
  // Registration is closed: a static, muted label instead of the link.
  return (
    <span
      aria-disabled
      className={cn(
        className,
        "cursor-default bg-surface-card text-mute hover:bg-surface-card active:bg-surface-card",
      )}
    >
      Đã đóng đăng ký
    </span>
  );
  // return (
  //   <a href="#register" className={className} onClick={() => track("register_click")}>
  //     Đăng ký ngay
  //   </a>
  // );
}

export function RegistrationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (data) =>
      data.status === "registered"
        ? track("sign_up", { method: "devfest-cloud-2026" })
        : track("register_duplicate"),
    onError: () => track("register_failed"),
  });
  const form = useAppForm({
    defaultValues,
    // Validate on submit first, then re-validate on every change.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: registrationSchema },
    onSubmit: ({ value }) => mutation.mutate(value),
    onSubmitInvalid: () => {
      track("register_invalid");
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>("[aria-invalid='true']")
          ?.focus(),
      );
    },
  });

  if (mutation.data?.status === "registered") {
    return <Registered {...mutation.data} />;
  }

  // Registration is closed: the form stays visible but `inert` blocks all
  // interaction, and submitting is disabled.
  return (
    <form
      ref={formRef}
      noValidate
      inert
      onSubmit={(event) => {
        event.preventDefault();
        // void form.handleSubmit();
      }}
      // Dim the fields but not the button, which carries the closed message.
      className="flex flex-col gap-6 [&>:not(button)]:opacity-50"
      // className="flex flex-col gap-6"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <form.AppField name="name">
          {(field) => (
            <field.TextField label="Họ và tên" required autoComplete="name" />
          )}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="Email"
              type="email"
              required
              autoComplete="email"
            />
          )}
        </form.AppField>
        <form.AppField name="phone">
          {(field) => (
            <field.TextField label="Số điện thoại" type="tel" autoComplete="tel" />
          )}
        </form.AppField>
        {/* <div role="group" aria-labelledby="dob-label" className="flex flex-col gap-1">
          <span id="dob-label" className="font-medium text-ink">
            Ngày sinh <span className="font-normal text-mute">(bắt buộc năm sinh)</span>
          </span>
          <BirthDatePicker name="dob" />
        </div> */}
        <form.AppField name="birthYear">
          {(field) => (
            <field.TextField
              label="Năm sinh"
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="yyyy"
              autoComplete="bday-year"
            />
          )}
        </form.AppField>
        <form.AppField name="company">
          {(field) => (
            <field.TextField
              label="Công ty / Trường học"
              autoComplete="organization"
            />
          )}
        </form.AppField>
        <form.AppField name="title">
          {(field) => (
            <field.TextField
              label="Chức danh / Chuyên ngành"
              autoComplete="organization-title"
            />
          )}
        </form.AppField>
        <div className="sm:col-span-2">
          <form.AppField name="linkedin">
            {(field) => (
              <field.TextField
                label="LinkedIn"
                type="url"
                placeholder="https://www.linkedin.com/in/…"
              />
            )}
          </form.AppField>
        </div>
      </div>

      <fieldset className="border-t border-hairline pt-4">
        <legend className="sr-only">Giới tính</legend>
        <p aria-hidden className="mb-2 font-bold text-ink">Giới tính</p>
        <form.Field name="gender">
          {(field) => {
            const error: string | undefined =
              field.state.meta.errors[0]?.message;
            return (
              <>
                <div className="flex flex-wrap gap-x-6">
                  {genders.map(({ value, label }) => (
                    <label key={value} className={optionClass}>
                      <input
                        type="radio"
                        name={field.name}
                        value={value}
                        required
                        checked={field.state.value === value}
                        onChange={() => field.handleChange(value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!!error}
                        aria-describedby={error ? `${field.name}-error` : undefined}
                        className="peer sr-only"
                      />
                      <Marker on="(*)" off="( )" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <FieldError name={field.name} error={error} />
              </>
            );
          }}
        </form.Field>
      </fieldset>

      <fieldset className="border-t border-hairline pt-4">
        <legend className="sr-only">Vai trò của bạn</legend>
        <p aria-hidden className="mb-2 font-bold text-ink">Vai trò của bạn</p>
        <form.Field name="role">
          {(field) => {
            const error: string | undefined =
              field.state.meta.errors[0]?.message;
            return (
              <>
                {roles.map(({ value, label }) => (
                  <label key={value} className={optionClass}>
                    <input
                      type="radio"
                      name={field.name}
                      value={value}
                      required
                      checked={field.state.value === value}
                      onChange={() => field.handleChange(value)}
                      onBlur={field.handleBlur}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${field.name}-error` : undefined}
                      className="peer sr-only"
                    />
                    <Marker on="(*)" off="( )" />
                    <span className="font-medium text-ink">{label}</span>
                  </label>
                ))}
                <FieldError name={field.name} error={error} />
              </>
            );
          }}
        </form.Field>
      </fieldset>

      <fieldset className="border-t border-hairline pt-4">
        <legend className="sr-only">Kinh nghiệm với Google Cloud</legend>
        <p aria-hidden className="mb-2 font-bold text-ink">Kinh nghiệm với Google Cloud</p>
        <form.Field name="level">
          {(field) => {
            const error: string | undefined =
              field.state.meta.errors[0]?.message;
            return (
              <>
                {levels.map(({ value, label, hint }) => (
                  <label key={value} className={optionClass}>
                    <input
                      type="radio"
                      name={field.name}
                      value={value}
                      required
                      checked={field.state.value === value}
                      onChange={() => field.handleChange(value)}
                      onBlur={field.handleBlur}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${field.name}-error` : undefined}
                      className="peer sr-only"
                    />
                    <Marker on="(*)" off="( )" />
                    <span className="font-medium text-ink">{label}</span>
                    <span className="ml-auto text-mute">{hint}</span>
                  </label>
                ))}
                <FieldError name={field.name} error={error} />
              </>
            );
          }}
        </form.Field>
      </fieldset>

      <fieldset className="border-t border-hairline pt-4">
        <legend className="sr-only">Chủ đề bạn quan tâm</legend>
        <p aria-hidden className="mb-2 font-bold text-ink">Chủ đề bạn quan tâm</p>
        <form.Field name="topics">
          {(field) =>
            topics.map(({ value, label }) => (
              <label key={value} className={optionClass}>
                <input
                  type="checkbox"
                  name={field.name}
                  value={value}
                  checked={field.state.value.includes(value)}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.checked
                        ? [...field.state.value, value]
                        : field.state.value.filter((topic) => topic !== value),
                    )
                  }
                  onBlur={field.handleBlur}
                  className="peer sr-only"
                />
                <Marker on="[x]" off="[ ]" />
                <span>{label}</span>
              </label>
            ))
          }
        </form.Field>
        <form.AppField name="laptop">
          {(field) => (
            <field.CheckboxField>
              Tôi sẽ mang laptop và tài khoản Google để tham gia các codelab thực hành.
            </field.CheckboxField>
          )}
        </form.AppField>
      </fieldset>

      <div className="border-t border-hairline pt-4">
        <form.AppField name="question">
          {(field) => (
            <field.TextareaField
              label="Câu hỏi cho diễn giả hoặc ban tổ chức"
              rows={4}
              placeholder="Chủ đề bạn muốn nghe, câu hỏi, nhu cầu hỗ trợ tiếp cận…"
            />
          )}
        </form.AppField>
      </div>

      <div className="border-t border-hairline pt-4">
        <form.AppField name="terms">
          {(field) => (
            <field.CheckboxField required>
              Tôi đồng ý với{" "}
              <a
                href="https://gdg.community.dev/participation-terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline"
              >
                Điều khoản tham gia GDG
              </a>
              .
            </field.CheckboxField>
          )}
        </form.AppField>
        <form.AppField name="updates">
          {(field) => (
            <field.CheckboxField>
              Gửi cho tôi thông tin cập nhật về các sự kiện của GDG Cloud Hanoi.
            </field.CheckboxField>
          )}
        </form.AppField>
      </div>

      <button
        type="submit"
        disabled
        // disabled={mutation.isPending}
        className="h-9 self-start rounded-lg bg-surface-card px-5 py-1 text-base leading-8 font-medium text-mute"
        // className="h-9 self-start rounded-lg bg-brand px-5 py-1 text-base leading-8 font-medium text-canvas outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:bg-brand-active disabled:bg-surface-card disabled:text-ash"
      >
        Đã đóng đăng ký
        {/* {mutation.isPending ? "Đang đăng ký…" : "Đăng ký"} */}
      </button>
      {(mutation.isError || mutation.data?.status === "duplicate") && (
        <ErrorText
          role="alert"
          className="rounded-lg border border-danger/40 px-3 py-2"
        >
          {mutation.isError
            ? "Không thể gửi đăng ký. Vui lòng thử lại."
            : "Email này đã được dùng để đăng ký."}
        </ErrorText>
      )}
    </form>
  );
}
