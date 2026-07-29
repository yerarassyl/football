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
    label: "5×5",
    shortLabel: "1/4 поля",
    description: "1/4 поля (50 × 32,5 м)",
    price: 10000,
  },
  {
    id: "half",
    label: "8×8",
    shortLabel: "1/2 поля",
    description: "1/2 поля (50 × 65 м)",
    price: 18000,
  },
  {
    id: "full",
    label: "11×11",
    shortLabel: "Всё поле",
    description: "Полное поле (100 × 65 м)",
    price: 30000,
  },
];

export const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export const DURATION_OPTIONS = Array.from({ length: 47 }, (_, index) => 60 + index * 30);
// Up to 24 hours (1440 minutes) in 30-minute increments

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
