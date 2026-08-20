import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service.js';

@Module({
  providers: [PdfService],
})
export class PdfModule {}
