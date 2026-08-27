import type { jsPDF } from 'jspdf'

let officialLogoPromise: Promise<string | null> | null = null

export const loadKronosLogoDataUrl = () => {
  if (typeof window === 'undefined')
    return Promise.resolve(null)

  officialLogoPromise ??= fetch('/images/Kronos/V-16.png')
    .then(response => {
      if (!response.ok)
        throw new Error('No fue posible cargar el logo oficial.')

      return response.blob()
    })
    .then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    }))
    .catch(() => null)

  return officialLogoPromise
}

export function drawKronosPdfHeader(pdf: jsPDF, title: string, folio: string, logoDataUrl?: string | null) {
  const width = pdf.internal.pageSize.getWidth()
  const margin = 14

  pdf.setFillColor(27, 29, 26)
  pdf.rect(0, 0, width, 42, 'F')
  if (logoDataUrl)
    pdf.addImage(logoDataUrl, 'PNG', margin, 9, 54, 14.4)
  else {
    pdf.setTextColor(151, 213, 222)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.text('KRONOS', margin, 17)
    pdf.setTextColor(235, 235, 235)
    pdf.setFontSize(8)
    pdf.text('TRAINING CENTER', margin, 23)
  }
  pdf.setTextColor(255, 64, 27)
  pdf.setFontSize(10)
  pdf.text(title, width - margin, 17, { align: 'right' })
  pdf.setTextColor(235, 235, 235)
  pdf.setFontSize(8)
  pdf.text(folio, width - margin, 24, { align: 'right' })

  return 52
}
