const { Resend } = require('resend')
const resend = new Resend(process.env.RESEND_API_KEY)

const twilio = require('twilio')
const { sendSimulationEmail } = require('./mailer')
const { buildContent, selectDelivery } = require('./contentGenerator')
const fs = require('fs/promises')
const path = require('path')

function getTwilioClient() {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN) return null
  return twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
}

//
// ───────────────── EMAIL (RESEND) ─────────────────
//

async function sendEmailResend({ to, subject, html }) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html
    })

    console.log('[EMAIL SENT]', to)

    return { sent: true, channel: 'email' }

  } catch (err) {
    console.error('[EMAIL ERROR]', err.message)
    return { sent: false, channel: 'email', error: err.message }
  }
}

//
// ───────────────── EMAIL WITH PDF ─────────────────
//

async function sendEmailWithPDF({
  to,
  subject,
  employeeName,
  orgName,
  pdfBuffer,
  filename,
  trackingUrl
}) {
  try {

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html: `
        <div style="font-family: Arial; max-width:600px">
          <p>Dear ${employeeName},</p>
          <p>Please review the attached document.</p>
          <p>If you cannot open the attachment, <a href="${trackingUrl}">click here</a>.</p>
          <p>${orgName}</p>
        </div>
      `,
      attachments: [{
        filename,
        content: pdfBuffer
      }]
    })

    return { sent: true, channel: 'email', contentType: 'pdf' }

  } catch (err) {
    console.error('[EMAIL PDF] Failed:', err.message)
    return { sent: false, channel: 'email', error: err.message }
  }
}

//
// ───────────────── SMS ─────────────────
//

async function sendSMS({ to, message }) {
  const client = getTwilioClient()

  if (!client) {
    console.warn('[SMS] Twilio not configured')
    return { sent: false, channel: 'sms' }
  }

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_PHONE,
      to
    })

    return { sent: true, channel: 'sms' }

  } catch (err) {
    console.error('[SMS] Failed:', err.message)
    return { sent: false, channel: 'sms', error: err.message }
  }
}

//
// ───────────────── WHATSAPP TEXT ─────────────────
//

async function sendWhatsAppText({ to, message }) {
  const client = getTwilioClient()

  if (!client) {
    console.warn('[WHATSAPP] Twilio not configured')
    return { sent: false, channel: 'whatsapp' }
  }

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${to}`
    })

    return { sent: true, channel: 'whatsapp' }

  } catch (err) {
    console.error('[WHATSAPP] Failed:', err.message)
    return { sent: false, channel: 'whatsapp', error: err.message }
  }
}

//
// ───────────────── WHATSAPP PDF ─────────────────
//

async function sendWhatsAppPDF({ to, pdfBuffer, filename, caption }) {
  const client = getTwilioClient()

  if (!client) {
    console.warn('[WHATSAPP PDF] Twilio not configured')
    return { sent: false, channel: 'whatsapp' }
  }

  try {

    const tmpPath = `/tmp/${Date.now()}_${filename}`

    await fs.writeFile(tmpPath, pdfBuffer)

    const publicUrl = `${process.env.PUBLIC_URL}/api/sim/media/${path.basename(tmpPath)}`

    await fs.copyFile(
      tmpPath,
      path.join(__dirname, '../uploads', path.basename(tmpPath))
    )

    await fs.unlink(tmpPath)

    await client.messages.create({
      body: caption || 'Please review the attached document.',
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${to}`,
      mediaUrl: [publicUrl]
    })

    return { sent: true, channel: 'whatsapp', mediaUrl: publicUrl }

  } catch (err) {
    console.error('[WHATSAPP PDF] Failed:', err.message)
    return { sent: false, channel: 'whatsapp', error: err.message }
  }
}

//
// ───────────────── VOICE CALL ─────────────────
//

async function sendVoiceCall({ to, employeeName, managerName, orgName, trackingUrl }) {
  const client = getTwilioClient()

  if (!client) {
    console.warn('[VOICE] Twilio not configured')
    return { sent: false, channel: 'voice' }
  }

  try {

    const twiml = `
<Response>
<Say voice="alice" language="en-IN">
Hello ${employeeName}. This is ${managerName} from ${orgName}.
Please verify your account immediately.
</Say>
</Response>
`

    await client.calls.create({
      twiml,
      from: process.env.TWILIO_FROM_PHONE,
      to
    })

    return { sent: true, channel: 'voice' }

  } catch (err) {
    console.error('[VOICE] Failed:', err.message)
    return { sent: false, channel: 'voice', error: err.message }
  }
}

//
// ───────────────── MASTER DISPATCHER ─────────────────
//

async function dispatchAttack({
  employee,
  attackType,
  trackingUrl,
  orgName,
  managerName = 'IT Security',
  aggressionLevel = 1
}) {

  const results = []

  const phone = employee.phone
  const email = employee.email

  const archetype = employee.behavioralArchetype || 'unknown'

  const { channel, contentType } =
    selectDelivery({ attackType, archetype, aggressionLevel })

  let content = null

  if (contentType === 'pdf') {
    content = await buildContent({
      attackType,
      contentType,
      employee,
      orgName,
      managerName,
      trackingUrl
    })
  }

  if (channel === 'email') {

    if (contentType === 'pdf' && content?.buffer) {

      results.push(await sendEmailWithPDF({
        to: email,
        subject: 'Important Document',
        employeeName: employee.displayName,
        orgName,
        pdfBuffer: content.buffer,
        filename: content.filename,
        trackingUrl
      }))

    } else {

      results.push(await sendEmailResend({
        to: email,
        subject: 'Security Alert',
        html: `
          <p>Hello ${employee.displayName}</p>
          <p>Please verify your account:</p>
          <a href="${trackingUrl}">${trackingUrl}</a>
        `
      }))
    }
  }

  return results
}

module.exports = {
  dispatchAttack,
  sendSMS,
  sendWhatsAppText,
  sendWhatsAppPDF,
  sendVoiceCall
}