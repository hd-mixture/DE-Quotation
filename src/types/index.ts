import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';
import { quotationSchema, lineItemSchema } from '@/lib/schemas';

export type LineItem = z.infer<typeof lineItemSchema>;
export type Quotation = z.infer<typeof quotationSchema>;

export type QuotationWithId = Quotation & {
  id: string;
  userId: string;
  createdAt?: Timestamp;
};
