import { describe, it, expect } from 'vitest'
import { extractDocumentText, UnsupportedDocumentTypeError } from '@/lib/ai/extract-document-text'

describe('extractDocumentText', () => {
  it('decodes text/plain directly', async () => {
    const text = await extractDocumentText(Buffer.from('Hello, this is a plain text document.'), 'text/plain')
    expect(text).toBe('Hello, this is a plain text document.')
  })

  it('decodes text/csv directly', async () => {
    const text = await extractDocumentText(Buffer.from('name,amount\nAcme,100'), 'text/csv')
    expect(text).toBe('name,amount\nAcme,100')
  })

  it('throws UnsupportedDocumentTypeError for spreadsheets, slides, images, and legacy .doc', async () => {
    const unsupported = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'application/msword',
    ]
    for (const mimeType of unsupported) {
      await expect(extractDocumentText(Buffer.from('x'), mimeType)).rejects.toBeInstanceOf(UnsupportedDocumentTypeError)
    }
  })
})
