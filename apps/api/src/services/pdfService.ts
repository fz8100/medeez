import puppeteer, { Browser, Page, PDFOptions } from 'puppeteer-core';
import handlebars from 'handlebars';
import { format } from 'date-fns';
import { logger } from '@/utils/logger';
import { AppError } from '@/types';
import { s3Service } from './s3Service';

export interface PDFGenerationOptions {
  format?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  headerTemplate?: string;
  footerTemplate?: string;
  displayHeaderFooter?: boolean;
  printBackground?: boolean;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  clinic: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxId?: string;
    npi?: string;
  };
  patient: {
    name: string;
    address: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string;
    insurance?: {
      provider: string;
      policyNumber: string;
      groupNumber?: string;
    };
  };
  services: Array<{
    date: string;
    description: string;
    code?: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax?: number;
  taxRate?: number;
  discount?: number;
  total: number;
  paymentInstructions?: string;
  notes?: string;
}

export interface PrescriptionData {
  prescriptionId: string;
  date: string;
  clinic: {
    name: string;
    address: string;
    phone: string;
    npi?: string;
    dea?: string;
  };
  provider: {
    name: string;
    title: string;
    npi?: string;
    dea?: string;
    signature?: string;
  };
  patient: {
    name: string;
    address: string;
    dateOfBirth: string;
    phone?: string;
  };
  medications: Array<{
    name: string;
    strength: string;
    dosage: string;
    quantity: string;
    refills: number;
    generic: boolean;
    instructions: string;
  }>;
  diagnosis?: string;
  notes?: string;
}

export interface ReportData {
  title: string;
  dateRange: {
    from: string;
    to: string;
  };
  clinic: {
    name: string;
    address: string;
  };
  generatedBy: string;
  generatedAt: string;
  data: any[];
  summary?: Record<string, any>;
  charts?: Array<{
    title: string;
    type: 'bar' | 'line' | 'pie';
    data: any[];
  }>;
}

export class PDFService {
  private browser: Browser | null = null;
  private isInitialized = false;

  constructor() {
    // Register Handlebars helpers
    this.registerHandlebarsHelpers();
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    });

    handlebars.registerHelper('formatDate', (date: string, formatStr = 'MMM dd, yyyy') => {
      return format(new Date(date), formatStr);
    });

    handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    handlebars.registerHelper('add', (a: number, b: number) => a + b);
    handlebars.registerHelper('multiply', (a: number, b: number) => a * b);
  }

  /**
   * Initialize Puppeteer browser
   */
  private async initializeBrowser(): Promise<void> {
    if (this.isInitialized && this.browser) {
      return;
    }

    try {
      // Use Chrome in Lambda or locally installed Chrome
      const executablePath = process.env.CHROME_EXECUTABLE_PATH || 
        process.env.NODE_ENV === 'production' 
          ? '/opt/chrome/chrome' // Lambda layer path
          : undefined; // Use local Chrome

      this.browser = await puppeteer.launch({
        executablePath,
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-extensions'
        ],
        defaultViewport: {
          width: 1024,
          height: 768
        }
      });

      this.isInitialized = true;
      logger.info('PDF service initialized with Puppeteer');

    } catch (error) {
      logger.error('Failed to initialize Puppeteer browser', error);
      throw new AppError('Failed to initialize PDF service');
    }
  }

  /**
   * Generate PDF from HTML template
   */
  async generatePDF(
    htmlContent: string,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    await this.initializeBrowser();

    if (!this.browser) {
      throw new AppError('PDF service not initialized');
    }

    const page: Page = await this.browser.newPage();

    try {
      // Set content and wait for it to load
      await page.setContent(htmlContent, {
        waitUntil: ['domcontentloaded', 'networkidle0']
      });

      // Generate PDF
      const pdfOptions: PDFOptions = {
        format: options.format || 'A4',
        landscape: options.orientation === 'landscape',
        margin: {
          top: options.margin?.top || '0.5in',
          right: options.margin?.right || '0.5in',
          bottom: options.margin?.bottom || '0.5in',
          left: options.margin?.left || '0.5in'
        },
        printBackground: options.printBackground ?? true,
        displayHeaderFooter: options.displayHeaderFooter ?? false,
        headerTemplate: options.headerTemplate || '<div></div>',
        footerTemplate: options.footerTemplate || '<div></div>'
      };

      const pdfBuffer = await page.pdf(pdfOptions);
      return Buffer.from(pdfBuffer);

    } finally {
      await page.close();
    }
  }

  /**
   * Generate invoice PDF
   */
  async generateInvoicePDF(
    invoiceData: InvoiceData,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    const template = handlebars.compile(this.getInvoiceTemplate());
    const htmlContent = template(invoiceData);

    return await this.generatePDF(htmlContent, {
      ...options,
      displayHeaderFooter: true,
      footerTemplate: this.getInvoiceFooterTemplate()
    });
  }

  /**
   * Generate prescription PDF
   */
  async generatePrescriptionPDF(
    prescriptionData: PrescriptionData,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    const template = handlebars.compile(this.getPrescriptionTemplate());
    const htmlContent = template(prescriptionData);

    return await this.generatePDF(htmlContent, {
      ...options,
      format: 'Letter',
      margin: {
        top: '1in',
        right: '0.75in',
        bottom: '1in',
        left: '0.75in'
      }
    });
  }

  /**
   * Generate report PDF
   */
  async generateReportPDF(
    reportData: ReportData,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    const template = handlebars.compile(this.getReportTemplate());
    const htmlContent = template(reportData);

    return await this.generatePDF(htmlContent, {
      ...options,
      orientation: options.orientation || 'landscape',
      displayHeaderFooter: true,
      headerTemplate: this.getReportHeaderTemplate(),
      footerTemplate: this.getReportFooterTemplate()
    });
  }

  /**
   * Generate PDF and save to S3
   */
  async generateAndSavePDF(
    clinicId: string,
    category: 'invoices' | 'prescriptions' | 'reports',
    fileName: string,
    pdfBuffer: Buffer,
    userId: string,
    patientId?: string
  ): Promise<{ key: string; uploadId: string }> {
    try {
      const result = await s3Service.uploadFile({
        clinicId,
        patientId,
        category,
        contentType: 'application/pdf',
        fileName,
        fileSize: pdfBuffer.length,
        userId
      }, pdfBuffer);

      logger.info('PDF generated and saved to S3', {
        key: result.key,
        uploadId: result.uploadId,
        clinicId,
        category,
        fileName,
        fileSize: pdfBuffer.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to save PDF to S3', error);
      throw new AppError('Failed to save PDF document');
    }
  }

  /**
   * Invoice HTML template
   */
  private getInvoiceTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; margin: 0; padding: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
        .clinic-info { flex: 1; }
        .invoice-info { flex: 1; text-align: right; }
        .title { font-size: 24px; font-weight: bold; color: #2c5aa0; margin-bottom: 10px; }
        .subtitle { font-size: 14px; color: #666; }
        .section { margin-bottom: 20px; }
        .patient-billing { display: flex; gap: 40px; margin-bottom: 30px; }
        .patient-info, .billing-info { flex: 1; }
        .section-title { font-weight: bold; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #2c5aa0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .amount { text-align: right; font-weight: bold; }
        .total-section { margin-top: 30px; float: right; width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .total-final { font-size: 16px; font-weight: bold; border-top: 2px solid #2c5aa0; padding-top: 10px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 10px; color: #666; }
        .payment-instructions { background-color: #f8f9fa; padding: 15px; border-left: 4px solid #2c5aa0; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <div class="clinic-info">
            <div class="title">{{clinic.name}}</div>
            <div>{{clinic.address}}</div>
            <div>Phone: {{clinic.phone}}</div>
            <div>Email: {{clinic.email}}</div>
            {{#if clinic.npi}}<div>NPI: {{clinic.npi}}</div>{{/if}}
            {{#if clinic.taxId}}<div>Tax ID: {{clinic.taxId}}</div>{{/if}}
        </div>
        <div class="invoice-info">
            <div class="title">INVOICE</div>
            <div><strong>Invoice #:</strong> {{invoiceNumber}}</div>
            <div><strong>Date:</strong> {{formatDate invoiceDate}}</div>
            <div><strong>Due Date:</strong> {{formatDate dueDate}}</div>
        </div>
    </div>

    <div class="patient-billing">
        <div class="patient-info">
            <div class="section-title">Patient Information</div>
            <div><strong>{{patient.name}}</strong></div>
            <div>{{patient.address}}</div>
            {{#if patient.phone}}<div>Phone: {{patient.phone}}</div>{{/if}}
            {{#if patient.email}}<div>Email: {{patient.email}}</div>{{/if}}
            {{#if patient.dateOfBirth}}<div>DOB: {{formatDate patient.dateOfBirth}}</div>{{/if}}
            {{#if patient.insurance}}
                <div style="margin-top: 10px;">
                    <strong>Insurance:</strong> {{patient.insurance.provider}}<br>
                    Policy: {{patient.insurance.policyNumber}}
                    {{#if patient.insurance.groupNumber}}<br>Group: {{patient.insurance.groupNumber}}{{/if}}
                </div>
            {{/if}}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Code</th>
                <th>Qty</th>
                <th>Rate</th>
                <th class="amount">Amount</th>
            </tr>
        </thead>
        <tbody>
            {{#each services}}
            <tr>
                <td>{{formatDate date}}</td>
                <td>{{description}}</td>
                <td>{{code}}</td>
                <td>{{quantity}}</td>
                <td>{{formatCurrency unitPrice}}</td>
                <td class="amount">{{formatCurrency total}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>

    <div class="total-section">
        <div class="total-row">
            <span>Subtotal:</span>
            <span>{{formatCurrency subtotal}}</span>
        </div>
        {{#if discount}}
        <div class="total-row">
            <span>Discount:</span>
            <span>-{{formatCurrency discount}}</span>
        </div>
        {{/if}}
        {{#if tax}}
        <div class="total-row">
            <span>Tax {{#if taxRate}}({{taxRate}}%){{/if}}:</span>
            <span>{{formatCurrency tax}}</span>
        </div>
        {{/if}}
        <div class="total-row total-final">
            <span>Total Due:</span>
            <span>{{formatCurrency total}}</span>
        </div>
    </div>

    <div style="clear: both;"></div>

    {{#if paymentInstructions}}
    <div class="payment-instructions">
        <strong>Payment Instructions:</strong><br>
        {{paymentInstructions}}
    </div>
    {{/if}}

    {{#if notes}}
    <div class="section">
        <div class="section-title">Notes</div>
        <div>{{notes}}</div>
    </div>
    {{/if}}

    <div class="footer">
        <p>Thank you for your business! Please remit payment by the due date to avoid late fees.</p>
        <p>Questions? Contact us at {{clinic.phone}} or {{clinic.email}}</p>
    </div>
</body>
</html>
    `;
  }

  /**
   * Prescription HTML template
   */
  private getPrescriptionTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; margin: 0; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
        .clinic-name { font-size: 18px; font-weight: bold; }
        .provider-info { margin: 20px 0; }
        .rx-number { float: right; font-weight: bold; }
        .patient-info { background-color: #f8f9fa; padding: 10px; margin-bottom: 20px; }
        .medication { border: 1px solid #ccc; margin-bottom: 15px; padding: 15px; }
        .medication-name { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
        .sig { margin: 10px 0; font-style: italic; }
        .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; }
        .signature-line { margin-top: 30px; border-bottom: 1px solid #000; width: 300px; }
        .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 10px 0; }
        table { width: 100%; }
        td { padding: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="clinic-name">{{clinic.name}}</div>
        <div>{{clinic.address}}</div>
        <div>Phone: {{clinic.phone}}</div>
        {{#if clinic.npi}}<div>NPI: {{clinic.npi}}</div>{{/if}}
        {{#if clinic.dea}}<div>DEA: {{clinic.dea}}</div>{{/if}}
    </div>

    <div class="rx-number">Rx #: {{prescriptionId}}</div>
    <div style="clear: both;"></div>

    <div class="provider-info">
        <strong>Prescribing Provider:</strong> {{provider.name}}, {{provider.title}}<br>
        {{#if provider.npi}}NPI: {{provider.npi}}<br>{{/if}}
        {{#if provider.dea}}DEA: {{provider.dea}}<br>{{/if}}
    </div>

    <div class="patient-info">
        <table>
            <tr>
                <td><strong>Patient:</strong> {{patient.name}}</td>
                <td><strong>DOB:</strong> {{formatDate patient.dateOfBirth}}</td>
            </tr>
            <tr>
                <td><strong>Address:</strong> {{patient.address}}</td>
                <td><strong>Phone:</strong> {{patient.phone}}</td>
            </tr>
        </table>
    </div>

    <div><strong>Date:</strong> {{formatDate date}}</div>
    {{#if diagnosis}}<div><strong>Diagnosis:</strong> {{diagnosis}}</div>{{/if}}

    {{#each medications}}
    <div class="medication">
        <div class="medication-name">{{name}} {{strength}}</div>
        <div><strong>Quantity:</strong> {{quantity}}</div>
        <div><strong>Refills:</strong> {{refills}}</div>
        <div class="sig"><strong>Sig:</strong> {{instructions}}</div>
        {{#unless generic}}
        <div class="warning">⚠️ Brand name requested - Do not substitute</div>
        {{/unless}}
    </div>
    {{/each}}

    {{#if notes}}
    <div style="margin: 20px 0; background-color: #f8f9fa; padding: 15px;">
        <strong>Notes:</strong> {{notes}}
    </div>
    {{/if}}

    <div class="footer">
        <div class="signature-line"></div>
        <div style="margin-top: 5px;">
            {{provider.name}}, {{provider.title}}<br>
            Date: ________________
        </div>
    </div>

    <div style="margin-top: 30px; font-size: 10px; color: #666;">
        <p><strong>Important:</strong> This prescription is valid for one year from the date of issue unless otherwise specified. Contact the clinic for any questions or concerns.</p>
    </div>
</body>
</html>
    `;
  }

  /**
   * Report HTML template
   */
  private getReportTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; margin: 0; padding: 0; }
        .header { margin-bottom: 20px; }
        .title { font-size: 18px; font-weight: bold; color: #2c5aa0; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 5px; }
        .summary { background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid #2c5aa0; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .summary-item { text-align: center; }
        .summary-value { font-size: 24px; font-weight: bold; color: #2c5aa0; }
        .summary-label { color: #666; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; font-size: 9px; text-transform: uppercase; }
        .number { text-align: right; }
        .chart-placeholder { background-color: #f0f0f0; height: 200px; margin: 20px 0; display: flex; align-items: center; justify-content: center; color: #666; }
        .page-break { page-break-before: always; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">{{title}}</div>
        <div class="subtitle">{{clinic.name}}</div>
        <div class="subtitle">{{formatDate dateRange.from}} - {{formatDate dateRange.to}}</div>
        <div class="subtitle">Generated by {{generatedBy}} on {{formatDate generatedAt}}</div>
    </div>

    {{#if summary}}
    <div class="summary">
        <h3>Summary</h3>
        <div class="summary-grid">
            {{#each summary}}
            <div class="summary-item">
                <div class="summary-value">{{this.value}}</div>
                <div class="summary-label">{{this.label}}</div>
            </div>
            {{/each}}
        </div>
    </div>
    {{/if}}

    {{#if charts}}
    {{#each charts}}
    <div class="chart-placeholder">
        Chart: {{title}} ({{type}})
    </div>
    {{/each}}
    {{/if}}

    {{#if data}}
    <table>
        <thead>
            <tr>
                {{#each (lookup ../data 0)}}
                <th>{{@key}}</th>
                {{/each}}
            </tr>
        </thead>
        <tbody>
            {{#each data}}
            <tr>
                {{#each this}}
                <td class="{{#if (gt this 0)}}number{{/if}}">{{this}}</td>
                {{/each}}
            </tr>
            {{/each}}
        </tbody>
    </table>
    {{/if}}
</body>
</html>
    `;
  }

  /**
   * Invoice footer template
   */
  private getInvoiceFooterTemplate(): string {
    return `
      <div style="font-size: 8px; color: #666; text-align: center; margin: 0 40px;">
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `;
  }

  /**
   * Report header template
   */
  private getReportHeaderTemplate(): string {
    return `
      <div style="font-size: 10px; color: #666; text-align: left; margin: 0 40px;">
        <span class="title"></span>
      </div>
    `;
  }

  /**
   * Report footer template
   */
  private getReportFooterTemplate(): string {
    return `
      <div style="font-size: 8px; color: #666; margin: 0 40px; display: flex; justify-content: space-between;">
        <span class="date"></span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      logger.info('PDF service cleaned up');
    }
  }
}

// Singleton instance
export const pdfService = new PDFService();

// Cleanup on process exit
process.on('exit', () => {
  pdfService.cleanup().catch(console.error);
});

process.on('SIGINT', () => {
  pdfService.cleanup().then(() => process.exit(0)).catch(console.error);
});

process.on('SIGTERM', () => {
  pdfService.cleanup().then(() => process.exit(0)).catch(console.error);
});