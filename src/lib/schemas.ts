
import { z } from 'zod';

export const lineItemSchema = z.object({
  description: z.string().min(1, { message: 'Description is required.' }),
  quantity: z.coerce.number().optional(),
  unit: z.string().optional().default(''),
  rate: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.coerce.number().min(0).optional()
  ),
  amount: z.preprocess( // For manual entry
    (val) => (val === "" || val === null ? undefined : val),
    z.coerce.number().min(0).optional()
  ),
  showQuantity: z.boolean().default(true),
  showUnit: z.boolean().default(true),
  showRate: z.boolean().default(true),
}).superRefine((data, ctx) => {
    const isManualMode = !data.showQuantity && !data.showUnit && !data.showRate;
    
    if (data.showQuantity && (data.quantity === undefined || data.quantity <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Must be > 0.',
            path: ['quantity'],
        });
    }
     if (data.showRate && data.rate === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Rate is required.',
            path: ['rate'],
        });
    }
    if (isManualMode && data.amount === undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Amount is required.',
            path: ['amount'],
        });
    }
});


export const quotationSchema = z.object({
  userId: z.string().optional(), // Add userId to the schema
  companyName: z.string().min(1, { message: 'Your company name is required.' }),
  companyAddress: z.string().min(1, { message: 'Your company address is required.' }),
  companyEmail: z.string().email({ message: 'Invalid email address.' }).optional().or(z.literal('')),
  companyPhone: z.string().optional(),
  headerImage: z.string().optional(),
  
  customerName: z.string().min(1, { message: 'Customer name is required.' }),
  customerAddress: z.string().min(1, { message: 'Customer address is required.' }),
  kindAttention: z.string().optional(),

  quoteName: z.string().min(1, { message: 'Quotation name is required.' }),
  quoteDate: z.date({ required_error: 'A quotation date is required.' }),
  subject: z.string().min(1, { message: 'Subject is required.' }),

  lineItems: z.array(lineItemSchema).min(1, { message: 'At least one line item is required.' }),
  
  terms: z.string().min(1, { message: 'Terms and conditions are required.' }),

  authorisedSignatory: z.string().min(1, { message: 'Signatory name is required.' }),
});
