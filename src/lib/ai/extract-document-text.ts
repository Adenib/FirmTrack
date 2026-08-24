import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

// No text-extraction capability existed anywhere in this codebase before
// AITrack -- invoice-pdf.ts/payslip-pdf.ts are generation-only. Scoped
// narrowly to the mime types AI Document Review actually supports in v1;
// everything else (spreadsheets, slides, images) throws rather than
// silently degrading. Images would need OCR or Claude's vision input
// instead of text extraction -- real follow-up work, not this pass.
export class UnsupportedDocumentTypeError extends Error {}

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv'])

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (TEXT_MIME_TYPES.has(mimeType)) {
    return buffer.toString('utf-8')
  }

  throw new UnsupportedDocumentTypeError(
    `AI Document Review doesn't support "${mimeType}" yet -- PDF, DOCX, TXT, and CSV only.`
  )
}
