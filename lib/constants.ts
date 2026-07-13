import { FieldFormat } from "./types";

export type FieldOption = {
  id: FieldFormat;
  label: string;
  shortLabel: string;
  description: string;
  price: number;
};

export const FIELD_OPTIONS: FieldOption[] = [
  {
    id: "quarter",
    label: "Четверть поля",
    shortLabel: "1/4 поля",
    description: "Для тренировки или игры 5 × 5",
    price: 10000,
  },
  {
    id: "half",
    label: "Половина поля",
    shortLabel: "1/2 поля",
    description: "Для командной тренировки 7 × 7",
    price: 18000,
  },
  {
    id: "full",
    label: "Полное поле",
    shortLabel: "Всё поле",
    description: "Большой матч до 11 × 11",
    price: 30000,
  },
];

export const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export const DURATION_OPTIONS = Array.from({ length: 23 }, (_, index) => 60 + index * 30);

export const SECTORS: Record<FieldFormat, Array<{ id: string; label: string }>> = {
  quarter: [
    { id: "A", label: "Сектор A" },
    { id: "B", label: "Сектор B" },
    { id: "C", label: "Сектор C" },
    { id: "D", label: "Сектор D" },
  ],
  half: [
    { id: "A+B", label: "Половина A + B" },
    { id: "C+D", label: "Половина C + D" },
    { id: "A+C", label: "Половина A + C" },
    { id: "B+D", label: "Половина B + D" },
  ],
  full: [{ id: "A+B+C+D", label: "Полное поле" }],
};

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value) + " ₸";
