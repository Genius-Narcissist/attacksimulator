const PDFDocument = require('pdfkit')
const crypto = require('crypto')

// ── PDF Generator ──────────────────────────────────────────────────

async function generateFakeInvoicePDF({ employeeName, orgName, amount, invoiceNumber, daysOverdue, trackingUrl }) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    doc.fontSize(20).fillColor('#c62828').text(orgName.toUpperCase(), { align: 'left' })
    doc.fontSize(10).fillColor('#666').text('Finance Department', { align: 'left' })
    doc.moveDown(2)

    // Invoice title
    doc.fontSize(16).fillColor('#000').text('INVOICE', { align: 'right' })
    doc.fontSize(10).fillColor('#333')
    doc.text(`Invoice #: ${invoiceNumber}`, { align: 'right' })
    doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
    doc.text(`Status: OVERDUE (${daysOverdue} days)`, { align: 'right' })
    doc.moveDown(2)

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#c62828').lineWidth(2).stroke()
    doc.moveDown()

    // Body
    doc.fontSize(11).fillColor('#000')
    doc.text(`Dear ${employeeName},`)
    doc.moveDown()
    doc.text(`This invoice for ${amount} is now ${daysOverdue} days overdue. Immediate payment is required to avoid service interruption and late fees.`)
    doc.moveDown(2)

    // CTA
    doc.fontSize(12).fillColor('#c62828').text('ACTION REQUIRED', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(10).fillColor('#1565c0').text(`Click here to authorize payment: ${trackingUrl}`, { align: 'center', link: trackingUrl, underline: true })
    doc.moveDown(2)

    // Footer
    doc.fontSize(8).fillColor('#999').text(`This document is confidential and intended only for ${employeeName}.`, { align: 'center' })

    doc.end()
  })
}

async function generateFakeAuthorizationPDF({ employeeName, orgName, managerName, trackingUrl }) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(18).fillColor('#1565c0').text('AUTHORIZATION REQUEST', { align: 'center' })
    doc.moveDown()
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#1565c0').lineWidth(1).stroke()
    doc.moveDown()

    doc.fontSize(10).fillColor('#333')
    doc.text(`To: ${employeeName}`)
    doc.text(`From: ${managerName}`)
    doc.text(`Date: ${new Date().toLocaleDateString()}`)
    doc.text(`Organization: ${orgName}`)
    doc.moveDown(2)

    doc.fontSize(11).fillColor('#000')
    doc.text(`Please review and authorize the attached request at your earliest convenience. This requires your digital verification.`)
    doc.moveDown(2)

    doc.fontSize(12).fillColor('#1565c0')
    doc.text(`Verify and Authorize: ${trackingUrl}`, { link: trackingUrl, underline: true, align: 'center' })
    doc.moveDown(2)

    doc.fontSize(8).fillColor('#999').text(`Ref: ${crypto.randomBytes(8).toString('hex').toUpperCase()} | Confidential`, { align: 'center' })

    doc.end()
  })
}

async function generateFakeVendorUpdatePDF({ employeeName, orgName, vendorName, trackingUrl }) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(18).fillColor('#2e7d32').text(`${vendorName} — Security Update`, { align: 'center' })
    doc.moveDown()
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#2e7d32').lineWidth(1).stroke()
    doc.moveDown()

    doc.fontSize(10).fillColor('#333')
    doc.text(`Dear ${employeeName},`)
    doc.moveDown()
    doc.text(`A critical security patch is available for your ${vendorName} installation. This update addresses a high-severity vulnerability (CVE-2024-${Math.floor(Math.random()*9000+1000)}) that could allow unauthorized access to your system.`)
    doc.moveDown()
    doc.text(`Please install this update immediately to protect ${orgName}'s systems.`)
    doc.moveDown(2)

    doc.fontSize(12).fillColor('#2e7d32')
    doc.text(`Download Security Patch: ${trackingUrl}`, { link: trackingUrl, underline: true, align: 'center' })
    doc.moveDown(2)

    doc.fontSize(8).fillColor('#999').text(`${vendorName} Security Team | Version 4.2.1-security | ${new Date().toLocaleDateString()}`, { align: 'center' })

    doc.end()
  })
}

// ── Delivery Selector ──────────────────────────────────────────────

function selectDelivery({ attackType, archetype, aggressionLevel = 1 }) {
  // Rushed Responder — on phone constantly, hits WhatsApp first
  if (archetype === 'rushed_responder') {
    if (['sim_swap', 'ai_deepfake'].includes(attackType)) {
      return { channel: 'voice', contentType: 'audio' }
    }
    if (['bec', 'social_engineering'].includes(attackType)) {
      return { channel: 'whatsapp', contentType: 'text' }
    }
    return { channel: 'whatsapp', contentType: 'text' }
  }

  // Trusting Delegator — responds to official documents
  if (archetype === 'trusting_delegator') {
    if (['email_phishing', 'bec', 'supply_chain'].includes(attackType)) {
      return { channel: 'email', contentType: 'pdf' }
    }
    if (['social_engineering'].includes(attackType)) {
      return { channel: 'whatsapp', contentType: 'pdf' }
    }
    return { channel: 'email', contentType: 'pdf' }
  }

  // Distracted Clicker — at desktop, email works
  if (archetype === 'distracted_clicker') {
    return { channel: 'email', contentType: 'html' }
  }

  // High aggression — escalate to voice
  if (aggressionLevel >= 4) {
    return { channel: 'voice', contentType: 'audio' }
  }

  // Default fallback
  return { channel: 'email', contentType: 'html' }
}

// ── Content Builder ────────────────────────────────────────────────

async function buildContent({ attackType, contentType, employee, orgName, managerName, trackingUrl }) {
  const invoiceNumber = 'INV-2024-' + Math.floor(Math.random() * 9000 + 1000)
  const amount = '$' + (Math.floor(Math.random() * 50000 + 5000)).toLocaleString() + '.00'
  const daysOverdue = Math.floor(Math.random() * 10 + 3)

  if (contentType === 'pdf') {
    if (['email_phishing', 'credential_harvesting'].includes(attackType)) {
      return {
        type: 'pdf',
        buffer: await generateFakeInvoicePDF({
          employeeName: employee.displayName,
          orgName, amount, invoiceNumber, daysOverdue, trackingUrl
        }),
        filename: `Invoice_${invoiceNumber}.pdf`
      }
    }
    if (['bec', 'social_engineering'].includes(attackType)) {
      return {
        type: 'pdf',
        buffer: await generateFakeAuthorizationPDF({
          employeeName: employee.displayName,
          orgName, managerName, trackingUrl
        }),
        filename: 'Authorization_Request.pdf'
      }
    }
    if (['supply_chain', 'watering_hole'].includes(attackType)) {
      return {
        type: 'pdf',
        buffer: await generateFakeVendorUpdatePDF({
          employeeName: employee.displayName,
          orgName, vendorName: 'SecureIT Pro', trackingUrl
        }),
        filename: 'Security_Update.pdf'
      }
    }
  }

  // Default — return text content for WhatsApp/SMS/HTML
  return { type: 'text', content: null }
}

module.exports = { selectDelivery, buildContent, generateFakeInvoicePDF, generateFakeAuthorizationPDF, generateFakeVendorUpdatePDF }