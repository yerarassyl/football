export type FieldFormat = "quarter" | "half" | "full";
export type PaymentStatus = "unpaid" | "deposit" | "paid";
export type RequestStatus = "new" | "in_progress" | "confirmed" | "cancelled" | "deleted";

export type PaymentRecord = {
  id: string;
  amount: number;
  date: string;
  method: string;
  recipient: string;
};

export type BookingRequest = {
  id: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
  cancelledAt: string;
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
  paymentMethod: string;
  paymentRecipient: string;
  paidAt: string;
  comment: string;
  deletedAt: string;
  payments: PaymentRecord[];
};

export type BookingInput = Omit<
  BookingRequest,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "confirmedAt"
  | "cancelledAt"
  | "status"
  | "paymentStatus"
  | "prepayment"
  | "balance"
  | "paymentMethod"
  | "paymentRecipient"
  | "paidAt"
  | "comment"
  | "deletedAt"
  | "payments"
>;
