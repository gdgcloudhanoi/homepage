"use client";

import { useState } from "react";
import { getDaysInMonth } from "date-fns";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { value: string | null; label: string };

const pad = (n: number) => String(n).padStart(2, "0");

const range = (from: number, to: number) =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => (from < to ? from + i : from - i));

const months: Option[] = [
  { value: null, label: "mm" },
  ...range(1, 12).map((m) => ({ value: pad(m), label: pad(m) })),
];

const currentYear = new Date().getFullYear();
const years: Option[] = range(currentYear, 1940).map((y) => ({
  value: String(y),
  label: String(y),
}));

function Part({
  label,
  name,
  placeholder,
  items,
  value,
  onValueChange,
  required,
  className,
}: {
  label: string;
  name: string;
  placeholder: string;
  items: Option[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <Select
      name={name}
      items={items}
      value={value}
      onValueChange={onValueChange}
      required={required}
    >
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.label} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function BirthDatePicker({ name }: { name: string }) {
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);

  // Leap year fallback so 29 Feb stays selectable before a year is picked.
  const dayCount = month ? getDaysInMonth(new Date(Number(year ?? 2000), Number(month) - 1)) : 31;
  const days: Option[] = [
    { value: null, label: "dd" },
    ...range(1, dayCount).map((d) => ({ value: pad(d), label: pad(d) })),
  ];
  const clampDay = (count: number) => setDay((d) => (d && Number(d) > count ? null : d));

  const trigger = "w-full data-[size=default]:h-10";

  return (
    <div className="flex items-center gap-2">
      <Part
        label="Ngày"
        name={`${name}-day`}
        placeholder="dd"
        items={days}
        value={day}
        onValueChange={setDay}
        className={trigger}
      />
      <span aria-hidden className="text-mute">/</span>
      <Part
        label="Tháng"
        name={`${name}-month`}
        placeholder="mm"
        items={months}
        value={month}
        onValueChange={(m) => {
          setMonth(m);
          if (m) clampDay(getDaysInMonth(new Date(Number(year ?? 2000), Number(m) - 1)));
        }}
        required={day !== null}
        className={trigger}
      />
      <span aria-hidden className="text-mute">/</span>
      <Part
        label="Năm"
        name={`${name}-year`}
        placeholder="yyyy"
        items={years}
        value={year}
        onValueChange={(y) => {
          setYear(y);
          if (month && y) clampDay(getDaysInMonth(new Date(Number(y), Number(month) - 1)));
        }}
        required
        className={trigger}
      />
    </div>
  );
}
