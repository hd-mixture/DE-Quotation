
"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Quotation } from "@/types";
import { format } from "date-fns";
import { defaultSignatureImage } from "@/lib/default-signature-image";

export const generatePdf = (data: Quotation, headerImage: string | null, options: { download: boolean } = { download: true }) => {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let lastY = 10;

  const addTextHeader = () => {
    doc.setFontSize(18).setFont("helvetica", "bold");
    doc.text(data.companyName, pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text("All Kinds of Industrial & Decorative Painting, Sand & Shot Blasting & All Types of Labour Job Works.", pageWidth / 2, 22, { align: "center" });
    lastY = 35;
  };

  const addHeader = () => {
    if (headerImage) {
      try {
        const isBase64 = headerImage.startsWith('data:image');
        if (isBase64) {
            const imageWidth = 190;
            const imageHeight = imageWidth * (70 / 800); 
            doc.addImage(headerImage, "PNG", 10, 5, imageWidth, imageHeight);
            lastY = 5 + imageHeight + 10;
        } else {
             // It's a local path. For jsPDF, we can't directly use a local path
             // from the client side like this unless it's an object URL.
             // The image needs to be loaded first. The current implementation
             // of passing the URL string will not work for local files.
             // We will just show the text header as a fallback.
             console.warn("Local image path detected for header. Displaying text header instead. For PDF generation, images must be handled as base64 or object URLs.");
             addTextHeader();
        }
      } catch (error) {
        console.error("Error adding header image:", error);
        addTextHeader();
      }
    } else {
      addTextHeader();
    }
  };
  
  const addFooter = () => {
      doc.setFontSize(9).setFont("helvetica", "normal");
      const addressLines = doc.splitTextToSize(`Add: ${data.companyAddress}`, pageWidth - 25);
      const contactLine = `Email- ${data.companyEmail || ''} (M) ${data.companyPhone || ''}`;
      
      const textHeight = (addressLines.length * 4) + 4;
      const rectHeight = textHeight + 6;
      const rectY = pageHeight - rectHeight - 5;

      doc.setDrawColor(0);
      doc.rect(10, rectY, pageWidth - 20, rectHeight, 'S');
      
      let textY = rectY + 5;

      doc.text(addressLines, pageWidth / 2, textY, { align: 'center' });
      textY += (addressLines.length * 4);
      
      doc.text(contactLine, pageWidth / 2, textY, { align: 'center' });
  };


  addHeader();

  const rightX = pageWidth - 15;
  doc.setFontSize(11).setFont("helvetica", "normal");
  doc.text(`Date: ${format(new Date(data.quoteDate), "dd-MM-yyyy")}`, rightX, lastY, { align: "right" });

  doc.text("To,", 15, lastY);
  lastY += 6;
  
  doc.setFontSize(12);
  const customerBlockWidth = (pageWidth / 2) - 20;

  doc.setFont("helvetica", "bold");
  const customerNameLines = doc.splitTextToSize(data.customerName, customerBlockWidth);
  doc.text(customerNameLines, 15, lastY);
  lastY += (Math.max(1, customerNameLines.length) * 5);
  
  doc.setFont("helvetica", "normal");
  const customerAddressLines = doc.splitTextToSize(data.customerAddress, customerBlockWidth);
  doc.text(customerAddressLines, 15, lastY);
  lastY += (customerAddressLines.length * 5);
  
  doc.setFontSize(11);

  if (data.kindAttention) {
    lastY += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Kind Attention:-", 15, lastY);
    doc.setFont("helvetica", "normal");
    doc.text(data.kindAttention, 45, lastY);
    lastY += 5;
  }

  lastY += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Sub:-", 15, lastY);
  doc.setFont("helvetica", "normal");
  const subjectLines = doc.splitTextToSize(data.subject, 160);
  doc.text(subjectLines, 27, lastY);
  lastY += (subjectLines.length * 5) + 5;
  
  doc.text("Dear Sir,", 15, lastY);
  lastY += 7;

  // Determine if we need the full set of columns
  const showFullColumns = data.lineItems.some(
    item => item.showQuantity || item.showUnit || item.showRate
  );

  let head: any[];
  let body: any[];
  let columnStyles: any = {};

  if (showFullColumns) {
    head = [["Sr. No.", "Description", "Qty", "Unit", "Rate", "Amount"]];
    body = data.lineItems.map((item, index) => {
      const isManualMode = !item.showQuantity && !item.showUnit && !item.showRate;
      const itemAmount = isManualMode ? item.amount : (item.quantity || 0) * (item.rate || 0);

      if (isManualMode) {
        return [
          index + 1,
          { content: item.description, colSpan: 4, styles: { halign: 'left' } },
          (itemAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        ];
      } else {
        return [
          index + 1,
          item.description,
          item.showQuantity ? (item.quantity?.toLocaleString('en-IN') ?? '') : '',
          item.showUnit ? item.unit || '' : '',
          item.showRate ? (item.rate?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) ?? '') : '',
          (itemAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        ];
      }
    });
    columnStyles = {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' },
        5: { cellWidth: 30, halign: 'center' },
    };
  } else {
    // All items are in manual mode
    head = [["Sr. No.", "Description", "Amount"]];
    body = data.lineItems.map((item, index) => {
      const itemAmount = item.amount || 0;
      return [
        index + 1,
        item.description,
        itemAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      ];
    });
    columnStyles = {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 35, halign: 'center' },
    };
  }

  const total = data.lineItems.reduce((acc, item) => {
    const isManualMode = !item.showQuantity && !item.showUnit && !item.showRate;
    const itemAmount = isManualMode ? item.amount : (item.quantity || 0) * (item.rate || 0);
    return acc + (Number(itemAmount) || 0);
  }, 0);
  
  if (showFullColumns) {
    body.push([
      { 
        content: 'Total', 
        colSpan: 5, 
        styles: { halign: 'right', fontStyle: 'bold' } 
      },
      { 
        content: total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
        styles: { fontStyle: 'bold', halign: 'center' } 
      }
    ]);
  } else {
     body.push([
      { 
        content: 'Total', 
        colSpan: 2, 
        styles: { halign: 'right', fontStyle: 'bold' } 
      },
      { 
        content: total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
        styles: { fontStyle: 'bold', halign: 'center' } 
      }
    ]);
  }

  autoTable(doc, {
      startY: lastY,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: {
          fillColor: [255, 255, 255],
          textColor: 0,
          fontStyle: 'bold',
          lineColor: 0,
          lineWidth: 0.1,
          font: 'helvetica',
          halign: 'center',
      },
      styles: {
          lineColor: 0,
          lineWidth: 0.1,
          textColor: 0,
          fontSize: 10,
          font: 'helvetica',
          valign: 'middle'
      },
      columnStyles: columnStyles,
  });

  let finalY = (doc as any).lastAutoTable.finalY;
  
  const checkPageOverflow = (y: number) => {
      if (y > pageHeight - 40) { // 40mm margin from bottom
          doc.addPage();
          addHeader();
          return 20; // Start Y on new page
      }
      return y;
  }

  finalY = checkPageOverflow(finalY);
  finalY += 10;
  
  doc.setFontSize(10).setFont("helvetica", "bold");
  doc.text("Term's & Condition :-", 15, finalY);
  finalY += 5;
  
  doc.setFontSize(9).setFont("helvetica", "normal");
  const termsLines = doc.splitTextToSize(data.terms, 180);

  if (finalY + (termsLines.length * 4) > pageHeight - 40) {
      doc.addPage();
      addHeader();
      finalY = lastY;
  }
  
  doc.text(termsLines, 15, finalY);
  finalY += (termsLines.length * 4) + 10;
  finalY = checkPageOverflow(finalY);
  
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text(`For, ${data.companyName}`, 15, finalY);

  try {
      const imageWidth = 45; 
      const imageHeight = imageWidth * (68 / 289);
      finalY += 2;
      doc.addImage(defaultSignatureImage, "PNG", 15, finalY, imageWidth, imageHeight);
      finalY += imageHeight;
  } catch (e) {
      console.error("Error adding signature image", e);
      finalY += 15;
  }
  
  finalY = checkPageOverflow(finalY);
  doc.text(data.authorisedSignatory, 15, finalY);

  addFooter();
  if (options.download) {
    doc.save(`${data.quoteName}.pdf`);
    return null;
  } else {
    return doc.output('blob');
  }
};
