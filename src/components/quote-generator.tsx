
"use client";

import { useEffect, useState, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Download, PlusCircle, Trash2, Upload, XCircle, Save } from "lucide-react";
import type { Quotation, QuotationWithId } from "@/types";
import { quotationSchema } from "@/lib/schemas";
import { generatePdf } from "@/lib/pdf-generator";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { Checkbox } from "./ui/checkbox";

interface QuoteGeneratorProps {
  initialData: Quotation | QuotationWithId;
  onSave: (data: Quotation) => Promise<string | undefined>;
  isSaving: boolean;
  accessToken: string | null;
}

// Helper to convert file paths to base64
const toBase64 = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.crossOrigin = 'Anonymous';
    img.src = src;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.height = img.naturalHeight;
      canvas.width = img.naturalWidth;
      ctx?.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL();
      resolve(dataURL);
    };
    img.onerror = (error) => reject(error);
});


export default function QuoteGenerator({ initialData, onSave, isSaving, accessToken }: QuoteGeneratorProps) {
  const { toast } = useToast();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const headerImageRef = useRef<HTMLImageElement>(null);


  const form = useForm<Quotation>({
    resolver: zodResolver(quotationSchema),
    defaultValues: initialData,
  });
  
  useEffect(() => {
    form.reset(initialData);
    if (!('id' in initialData)) {
      form.setValue('quoteDate', new Date());
    }
  }, [initialData, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  
  const watchedItems = form.watch("lineItems");
  const watchedHeaderImage = form.watch("headerImage");

  const totalAmount = watchedItems.reduce((acc, item) => {
    if (!item) {
        return acc;
    }
    const isManualMode = !item.showQuantity && !item.showUnit && !item.showRate;
    
    let itemAmount = 0;
    if (isManualMode) {
        itemAmount = Number(item.amount || 0);
    } else {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        itemAmount = quantity * rate;
    }
    
    return acc + (isNaN(itemAmount) ? 0 : itemAmount);
  }, 0);


  const handleHeaderImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({
          variant: "destructive",
          title: "Image too large",
          description: "Please upload an image smaller than 2MB.",
        });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        form.setValue("headerImage", reader.result as string, { shouldDirty: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadAndDriveSave = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fill all required fields.",
      });
      return;
    }
    
    setIsProcessingPdf(true);
    
    const data = form.getValues();
    await onSave(data);

    try {
      // For PDF generation, we need the image as base64
      let headerImageForPdf: string | null = null;
      if (data.headerImage) {
        try {
          headerImageForPdf = await toBase64(data.headerImage);
        } catch (error) {
          console.error("Could not convert header image to base64 for PDF", error);
          toast({ variant: 'destructive', title: 'Image Error', description: 'Could not load the header image for the PDF.'})
        }
      }

      // Generate PDF for download
      generatePdf(data, headerImageForPdf, { download: true });
      toast({
        title: "PDF Downloading!",
        description: `${data.quoteName}.pdf has been started.`,
        className: "bg-accent text-accent-foreground",
      });

      // Upload to Google Drive if authenticated
      if (accessToken) {
        const uploadToDrive = async () => {
            try {
              // 1. Find or create the "Quotation" folder
              let folderId: string | null = null;
              const folderName = "Quotation";
              
              const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`, {
                  headers: { Authorization: `Bearer ${accessToken}` }
              });

              if (!searchResponse.ok) throw new Error(`Failed to search for folder. Status: ${searchResponse.status}`);
              
              const searchData = await searchResponse.json();

              if (searchData.files.length > 0) {
                  folderId = searchData.files[0].id;
              } else {
                  const createFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                      method: 'POST',
                      headers: {
                          Authorization: `Bearer ${accessToken}`,
                          'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                          name: folderName,
                          mimeType: 'application/vnd.google-apps.folder',
                      }),
                  });
                  if (!createFolderResponse.ok) throw new Error('Failed to create folder.');
                  const newFolderData = await createFolderResponse.json();
                  folderId = newFolderData.id;
              }

              if (!folderId) {
                throw new Error("Could not find or create the Quotation folder in Google Drive.");
              }

              // 2. Upload the file to that folder
              const pdfBlob = generatePdf(data, headerImageForPdf, { download: false }) as Blob;
              
              const metadata = {
                name: `${data.quoteName}.pdf`,
                mimeType: 'application/pdf',
                parents: [folderId],
              };
              
              const driveForm = new FormData();
              driveForm.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
              driveForm.append('file', pdfBlob);

              const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
                body: driveForm,
              });

              if (!response.ok) {
                const errorData = await response.json();
                console.error("Google Drive API Error:", errorData);
                throw new Error(errorData.error.message || 'Failed to upload file.');
              }

              const fileData = await response.json();
              toast({
                title: "Upload Successful!",
                description: (
                  <span>
                    {`${data.quoteName}.pdf has been saved to your 'Quotation' folder in Google Drive.`}
                    <a href={`https://docs.google.com/open?id=${fileData.id}`} target="_blank" rel="noopener noreferrer" className="underline ml-2">
                      View File
                    </a>
                  </span>
                ),
                className: "bg-accent text-accent-foreground",
              });

            } catch (error) {
              console.error("Error uploading to Google Drive:", error);
              toast({ variant: "destructive", title: "Drive Upload Failed", description: `${error}` });
            }
        }
        uploadToDrive();
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ variant: "destructive", title: "PDF Error", description: "Could not generate the PDF." });
    } finally {
      setIsProcessingPdf(false);
    }
  };
  
  const handleSubmit = async (data: Quotation) => {
      await onSave(data);
      toast({ title: "Success", description: "Quotation saved successfully." });
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          <div className="flex justify-end gap-4 flex-wrap">
              <Button type="button" size="lg" variant="outline" onClick={handleDownloadAndDriveSave} disabled={isSaving || isProcessingPdf}>
                  <Download className="mr-2 h-5 w-5" />
                  {isProcessingPdf ? 'Processing...' : 'Download PDF'}
              </Button>
              <Button type="submit" size="lg" disabled={isSaving || isProcessingPdf || !form.formState.isDirty}>
                  <Save className="mr-2 h-5 w-5" />
                  {isSaving ? "Saving..." : "Save Quotation"}
              </Button>
          </div>
          
          <Card>
              <CardHeader>
                  <CardTitle>Company Details & Header</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6 items-start">
                    <FormField
                        control={form.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your Company Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Your Company LLC" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    <div className="space-y-2">
                        <Label>Header Image (Optional Letterhead)</Label>
                        <div className="flex items-center gap-4">
                            {watchedHeaderImage ? (
                            <div className="relative w-48 h-24 border rounded-md overflow-hidden bg-muted/50">
                              <Image 
                                src={watchedHeaderImage} 
                                alt="Header Preview" 
                                layout="fill" 
                                objectFit="contain" 
                                data-ai-hint="company logo"
                                crossOrigin="anonymous"
                                ref={headerImageRef}
                              />
                              <Button variant="ghost" size="icon" className="absolute top-0 right-0 h-6 w-6 bg-background/50" onClick={() => form.setValue('headerImage', undefined, { shouldDirty: true })}><XCircle className="h-4 w-4 text-destructive" /></Button>
                            </div>
                            ) : <div className="w-48 h-24 border rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">No Image</div>}
                            <Button asChild variant="outline">
                                <label htmlFor="header-upload" className="cursor-pointer">
                                    <Upload className="mr-2 h-4 w-4"/> Upload
                                    <input id="header-upload" type="file" className="sr-only" accept="image/png, image/jpeg" onChange={handleHeaderImageUpload}/>
                                 </label>
                            </Button>
                        </div>
                    </div>
                  </div>
                  <FormField
                      control={form.control}
                      name="companyAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Address</FormLabel>
                          <FormControl>
                            <Textarea placeholder="123 Business Rd, Suite 100, Biz Town" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="companyEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Email</FormLabel>
                            <FormControl>
                              <Input placeholder="contact@company.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="companyPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="(123) 456-7890" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                  </div>
              </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-8">
              <Card>
                  <CardHeader><CardTitle>Customer Details</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name="customerName" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Customer Name</FormLabel>
                              <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="customerAddress" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Customer Address</FormLabel>
                              <FormControl><Textarea placeholder="123 Main St, Anytown, USA" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="kindAttention" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Kind Attention (Optional)</FormLabel>
                              <FormControl><Input placeholder="Mr. Smith" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Quotation Details</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name="quoteName" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Quotation Name</FormLabel>
                              <FormControl><Input placeholder="e.g. Project-XYZ-Phase1" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="quoteDate" render={({ field }) => (
                          <FormItem className="flex flex-col">
                              <FormLabel>Quotation Date</FormLabel>
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                  <PopoverTrigger asChild>
                                      <FormControl>
                                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                              {field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}
                                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                          </Button>
                                      </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar 
                                        mode="single" 
                                        selected={field.value ? new Date(field.value) : undefined} 
                                        onSelect={(date) => {
                                          field.onChange(date);
                                          setIsCalendarOpen(false);
                                        }} 
                                        initialFocus 
                                      />
                                  </PopoverContent>
                              </Popover>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="subject" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Subject</FormLabel>
                              <FormControl><Textarea placeholder="Quotation for Web Development Services" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                  </CardContent>
              </Card>
          </div>

          <Card>
              <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
              <CardContent>
                  <div className="space-y-4">
                      {fields.map((field, index) => {
                          const item = watchedItems[index];
                          const isManualMode = item && !item.showQuantity && !item.showUnit && !item.showRate;
                          return (
                            <div key={field.id} className="flex flex-wrap items-start gap-4 p-4 border rounded-lg relative">
                                <div className="font-bold text-lg text-muted-foreground pt-8">{index + 1}</div>
                                <div className="flex-1 space-y-4">
                                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                                    <FormField control={form.control} name={`lineItems.${index}.description`} render={({ field }) => (
                                        <FormItem className="md:col-span-4">
                                            <FormLabel>Description</FormLabel>
                                            <FormControl><Input placeholder="e.g. Providing and Fixing top cover of Tarpaulin shed." {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                  </div>
                                  <div className="flex items-center space-x-4">
                                      <FormField control={form.control} name={`lineItems.${index}.showQuantity`} render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">Quantity</FormLabel></FormItem>)} />
                                      <FormField control={form.control} name={`lineItems.${index}.showUnit`} render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">Unit</FormLabel></FormItem>)} />
                                      <FormField control={form.control} name={`lineItems.${index}.showRate`} render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">Rate</FormLabel></FormItem>)} />
                                  </div>
                                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                                    {item?.showQuantity && <FormField control={form.control} name={`lineItems.${index}.quantity`} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Quantity</FormLabel>
                                            <FormControl><Input type="number" placeholder="1" {...field} value={field.value ?? ''} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />}
                                    {item?.showUnit && <FormField control={form.control} name={`lineItems.${index}.unit`} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Unit</FormLabel>
                                            <FormControl><Input placeholder="pcs" {...field} value={field.value ?? ''}/></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />}
                                    {item?.showRate && <FormField control={form.control} name={`lineItems.${index}.rate`} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Rate</FormLabel>
                                            <FormControl><Input type="number" placeholder="100.00" {...field} value={field.value ?? ''} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />}
                                    
                                    <div className="font-medium">
                                        <Label>Amount</Label>
                                        {isManualMode ? (
                                           <FormField control={form.control} name={`lineItems.${index}.amount`} render={({ field }) => (
                                              <FormItem>
                                                  <FormControl><Input type="number" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                                                  <FormMessage />
                                              </FormItem>
                                          )} />
                                        ) : (
                                          <div className="p-2 h-10 flex items-center">{((item?.quantity || 0) * (item.rate || 0)).toFixed(2)}</div>
                                        )}
                                    </div>
                                  </div>
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                          )
                      })}
                  </div>
                  <Button type="button" variant="outline" onClick={() => append({ description: "", quantity: undefined, unit: "pcs", rate: undefined, showQuantity: true, showUnit: true, showRate: true })} className="mt-4">
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Line Item
                  </Button>
              </CardContent>
              <CardFooter className="flex flex-col items-end space-y-2 bg-muted/50 p-6 rounded-b-lg">
                  <div className="flex justify-between w-64 border-t pt-2 mt-2 border-foreground/20">
                      <span className="font-bold text-lg">Total</span>
                      <span className="font-bold text-lg">{totalAmount.toFixed(2)}</span>
                  </div>
              </CardFooter>
          </Card>
          
          <div className="grid md:grid-cols-2 gap-8">
              <Card>
                  <CardHeader><CardTitle>Authorised Signatory</CardTitle></CardHeader>
                  <CardContent>
                      <FormField control={form.control} name="authorisedSignatory" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Signatory Name</FormLabel>
                              <FormControl><Input placeholder="e.g. Jane Smith" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Terms & Conditions</CardTitle></CardHeader>
                  <CardContent>
                      <FormField control={form.control} name="terms" render={({ field }) => (
                          <FormItem>
                              <FormControl><Textarea className="min-h-[120px]" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                  </CardContent>
              </Card>
          </div>
        </form>
      </Form>
    </>
  );
}
