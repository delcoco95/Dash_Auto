// Génération de PDF côté client (facture & procuration) — aucune donnée n'est envoyée au serveur.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const PAGE_W = 210
const MARGIN = 15
const INK = '#111111'
const MUTED = '#777777'
const ACCENT = '#0d532a'
const LINE = '#eaeaea'

function money(n) {
  return `${(Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

// Formate une date "yyyy-mm-dd" en "jj/mm/aaaa" sans décalage de fuseau horaire.
function fmtFR(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

function newDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'normal')
  return doc
}

function footer(doc, label) {
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const h = doc.internal.pageSize.getHeight()
    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    doc.text(label, MARGIN, h - 10)
    doc.text(`Page ${i}/${pageCount}`, PAGE_W - MARGIN, h - 10, { align: 'right' })
  }
}

export function buildInvoicePDF({ company = {}, invoiceNumber, invoiceDate, dueDate, client = {}, vehicle = null, items = [], taxRate = 20, notes = '' }) {
  const doc = newDoc()
  let y = 18

  // ── En-tête : société (gauche) + titre facture (droite) ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(INK)
  doc.text(company.name || 'Votre garage', MARGIN, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(MUTED)
  let companyY = y + 6
  const companyLines = [
    company.address,
    [company.zip, company.city].filter(Boolean).join(' '),
    company.phone,
    company.email,
    company.siret ? `SIRET : ${company.siret}` : null,
  ].filter(Boolean)
  companyLines.forEach(line => { doc.text(line, MARGIN, companyY); companyY += 4.5 })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(ACCENT)
  doc.text('FACTURE', PAGE_W - MARGIN, y + 3, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK)
  let metaY = y + 11
  doc.text(`N° ${invoiceNumber}`, PAGE_W - MARGIN, metaY, { align: 'right' }); metaY += 5.5
  doc.text(`Date : ${fmtFR(invoiceDate)}`, PAGE_W - MARGIN, metaY, { align: 'right' }); metaY += 5.5
  if (dueDate) { doc.text(`Échéance : ${fmtFR(dueDate)}`, PAGE_W - MARGIN, metaY, { align: 'right' }); metaY += 5.5 }

  y = Math.max(companyY, metaY) + 6
  doc.setDrawColor(LINE)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 8

  // ── Client / Véhicule ──
  const colW = (PAGE_W - 2 * MARGIN - 10) / 2

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(MUTED)
  doc.text('FACTURÉ À', MARGIN, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK)
  let clientY = y + 5.5
  const clientLines = [client.name, client.address, [client.zip, client.city].filter(Boolean).join(' '), client.phone, client.email].filter(Boolean)
  clientLines.forEach(line => { doc.text(doc.splitTextToSize(line, colW), MARGIN, clientY); clientY += 5 })

  let vehicleEndY = y
  if (vehicle && (vehicle.brand || vehicle.registration)) {
    const vx = MARGIN + colW + 10
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(MUTED)
    doc.text('VÉHICULE CONCERNÉ', vx, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK)
    let vY = y + 5.5
    const vLines = [
      [vehicle.brand, vehicle.model].filter(Boolean).join(' '),
      vehicle.registration ? `Immatriculation : ${vehicle.registration}` : null,
      vehicle.vin ? `VIN : ${vehicle.vin}` : null,
    ].filter(Boolean)
    vLines.forEach(line => { doc.text(line, vx, vY); vY += 5 })
    vehicleEndY = vY
  }

  y = Math.max(clientY, vehicleEndY) + 6

  // ── Tableau des lignes ──
  const rows = items.map(it => {
    const qty = Number(it.qty) || 0
    const pu = Number(it.unitPrice) || 0
    return [it.description || '—', it.category || '—', qty.toString(), money(pu), money(qty * pu)]
  })

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Description', 'Catégorie', 'Qté', 'PU HT', 'Total HT']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: 3 },
    headStyles: { fillColor: [13, 83, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 248] },
    columnStyles: {
      2: { halign: 'right', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 32 },
    },
  })

  y = doc.lastAutoTable.finalY + 8

  // ── Totaux ──
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  const taxAmount = subtotal * (Number(taxRate) || 0) / 100
  const total = subtotal + taxAmount

  const totalsX = PAGE_W - MARGIN - 70
  const totalsW = 70
  doc.setFontSize(10)
  const totalLine = (label, value, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(bold ? ACCENT : MUTED)
    doc.text(label, totalsX, y)
    doc.setTextColor(INK)
    doc.text(value, totalsX + totalsW, y, { align: 'right' })
    y += 6.5
  }
  totalLine('Sous-total HT', money(subtotal))
  totalLine(`TVA (${Number(taxRate) || 0}%)`, money(taxAmount))
  doc.setDrawColor(LINE)
  doc.line(totalsX, y - 3, totalsX + totalsW, y - 3)
  totalLine('Total TTC', money(total), true)

  y += 6

  // ── Notes ──
  if (notes && notes.trim()) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(MUTED)
    doc.text('NOTES', MARGIN, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(INK)
    const wrapped = doc.splitTextToSize(notes, PAGE_W - 2 * MARGIN)
    doc.text(wrapped, MARGIN, y)
    y += wrapped.length * 4.5
  }

  if (!Number(taxRate)) {
    y += 4
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(MUTED)
    doc.text('TVA non applicable, article 293 B du Code Général des Impôts.', MARGIN, y)
  }

  footer(doc, company.name ? `${company.name} — Facture ${invoiceNumber}` : `Facture ${invoiceNumber}`)
  return doc
}

export function buildProcurationPDF({ mandant = {}, mandataire = {}, vehicle = null, purpose = '', place = '', date = '' }) {
  const doc = newDoc()
  let y = 24

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(INK)
  doc.text('PROCURATION', PAGE_W / 2, y, { align: 'center' })
  y += 14

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(INK)
  const para = (text, gap = 7) => {
    const wrapped = doc.splitTextToSize(text, PAGE_W - 2 * MARGIN)
    doc.text(wrapped, MARGIN, y)
    y += wrapped.length * 6 + gap
  }

  const mandantAddr = [mandant.address, [mandant.zip, mandant.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const mandataireAddr = [mandataire.address, [mandataire.zip, mandataire.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  para(
    `Je soussigné(e) ${mandant.name || '.......................'}` +
    (mandantAddr ? `, demeurant à ${mandantAddr}` : '') +
    (mandant.idNumber ? `, titulaire de la pièce d'identité n° ${mandant.idNumber}` : '') +
    `,`
  )

  para(
    `donne pouvoir à ${mandataire.name || '.......................'}` +
    (mandataireAddr ? `, demeurant à ${mandataireAddr}` : '') +
    (mandataire.idNumber ? `, titulaire de la pièce d'identité n° ${mandataire.idNumber}` : '') +
    `,`
  )

  para(`pour effectuer en mon nom et pour mon compte les démarches suivantes : ${purpose || '.......................'}.`)

  if (vehicle && (vehicle.brand || vehicle.registration || vehicle.vin)) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(MUTED)
    doc.text('DÉSIGNATION DU VÉHICULE', MARGIN, y); y += 6.5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(INK)
    const vLines = [
      [vehicle.brand, vehicle.model].filter(Boolean).join(' ') ? `Marque / Modèle : ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}` : null,
      vehicle.registration ? `Immatriculation : ${vehicle.registration}` : null,
      vehicle.vin ? `N° de série (VIN) : ${vehicle.vin}` : null,
    ].filter(Boolean)
    vLines.forEach(line => { doc.text(line, MARGIN, y); y += 6 })
    y += 6
  }

  para('Cette procuration est valable pour les seules démarches désignées ci-dessus.', 14)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.text(`Fait à ${place || '.......................'}, le ${date ? fmtFR(date) : '.......................'}`, MARGIN, y)
  y += 22

  const halfW = (PAGE_W - 2 * MARGIN) / 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Signature du mandant', MARGIN, y)
  doc.text('Signature du mandataire', MARGIN + halfW, y)
  y += 4
  doc.setDrawColor(LINE)
  doc.rect(MARGIN, y, halfW - 10, 28)
  doc.rect(MARGIN + halfW, y, halfW - 10, 28)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(MUTED)
  doc.text('(précédée de la mention « Bon pour pouvoir »)', MARGIN, y + 34)
  doc.text('(précédée de la mention « Bon pour pouvoir »)', MARGIN + halfW, y + 34)

  footer(doc, 'Procuration')
  return doc
}
