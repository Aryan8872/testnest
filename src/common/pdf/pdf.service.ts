import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PdfService {
  async generateInvoicePdf(invoiceData: any) {
    // Resolve template path correctly in both local dev (src/) and production container
    const templatePath = fs.existsSync(path.join(process.cwd(), 'src/templates/invoice.hbs'))
      ? path.join(process.cwd(), 'src/templates/invoice.hbs')
      : path.join(process.cwd(), 'dist/src/templates/invoice.hbs');

    const templateHtml = fs.readFileSync(templatePath, 'utf-8');
    // 2. Compile HTML with data (support ESM/CJS interop)
    const compile = Handlebars.compile ?? (Handlebars as any).default?.compile;
    const template = compile(templateHtml);
    const finalHtml = template(invoiceData);

    // Launch with container-friendly flags
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
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
