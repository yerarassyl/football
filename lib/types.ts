export type FieldFormat = "quarter" | "half" | "full";
export type PaymentStatus = "unpaid" | "deposit" | "paid";
export type RequestStatus = "new" | "in_progress" | "confirmed" | "cancelled" | "deleted";

export type PaymentRecord = {
  id: string;
  amount: number;
  date: string;
  method: string;
  recipient: string;
  createdAt: string;
};

export type BookingRequest = {
  id: string;
  createdAt: string;
  date: string;
  time: string;
  duration: number;
  format: FieldFormat;
  sector: string;
  price: number;
  listPrice: number;
  salePrice: number;
  name: string;
  phone: string;
  team: string;
  source: string;
  sourceDetail: string;
  status: RequestStatus;
  paymentStatus: PaymentStatus;
  prepayment: number;
  balance: number;
  payments: PaymentRecord[];
  comment: string;
  deletedAt: string;
};

export type BookingInput = Omit<
  BookingRequest,
  "id" | "createdAt" | "status" | "paymentStatus" | "prepayment" | "balance" | "payments" | "comment" | "deletedAt"
>;
