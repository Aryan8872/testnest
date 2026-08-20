import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';

@Injectable()
export class PdfService {
  async generateInvoicePdf(invoiceData: any) {
    const templateHtml = fs.readFileSync('src/templates/invoice.hbs', 'utf-8');
    // 2. Compile HTML with data
    const template = handlebars.compile(templateHtml);
    const finalHtml = template(invoiceData);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'domcontentloaded' });

    //generate pdf buffer (Uint8Array converted to Buffer)

    const pdfUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
    });
    await browser.close();
    return Buffer.from(pdfUint8Array);
  }
}
