const mongoose = require('mongoose')
const mongoSanitize = require('mongo-sanitize')
const crypto = require('crypto')

const ENCRYPTION_KEY = Buffer.from(process.env.EMAIL_ENCRYPTION_KEY || 'a'.repeat(64), 'hex')
const IV_LENGTH = 16

function encryptEmail(text) {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decryptEmail(text) {
  const [ivHex, encrypted] = text.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

const employeeSchema = new mongoose.Schema({
  emailEncrypted: { type: String, required: true },
  emailHash: { type: String, required: true, unique: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  role: {
    type: String,
    required: true,
    enum: ['admin', 'it_support', 'finance_manager', 'finance_analyst', 'hr_manager', 'general_employee']
  },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  displayName: { type: String },
  behavioralArchetype: {
    type: String,
    enum: ['rushed_responder', 'trusting_delegator', 'distracted_clicker', 'skeptical_verifier', 'unknown'],
    default: 'unknown'
  },
  roleSensitivityWeight: { type: Number, default: 0.4 },
  securityScore: { type: Number, default: 0, min: 0, max: 100 },
  scenariosCompleted: { type: Number, default: 0 },
  scenariosFailed: { type: Number, default: 0 },
  awarModulesCompleted: { type: Number, default: 0 },
  badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SecurityBadge' }],
  isActive: { type: Boolean, default: true },
  isCompromised: { type: Boolean, default: false },
  lastSimulationResult: {
    type: String,
    enum: ['clicked', 'reported', 'ignored', 'submitted_form', null],
    default: null
  }
}, { timestamps: true })

employeeSchema.virtual('email').get(function() {
  if (!this.emailEncrypted) return null
  try { return decryptEmail(this.emailEncrypted) } catch { return null }
})

employeeSchema.pre('save', function() {
  this.firstName = mongoSanitize(this.firstName)
  this.lastName = mongoSanitize(this.lastName)
  this.displayName = `${this.firstName} ${this.lastName}`
  const ROLE_WEIGHTS = {
    admin: 1.0, it_support: 0.9, finance_manager: 0.8,
    finance_analyst: 0.6, hr_manager: 0.7, general_employee: 0.4
  }
  this.roleSensitivityWeight = ROLE_WEIGHTS[this.role] ?? 0.4
  
})

employeeSchema.statics.setEmail = function(employeeDoc, rawEmail) {
  const normalized = rawEmail.toLowerCase().trim()
  employeeDoc.emailEncrypted = encryptEmail(normalized)
  employeeDoc.emailHash = crypto.createHash('sha256').update(normalized).digest('hex')
}

employeeSchema.statics.findByEmail = function(rawEmail) {
  const hash = crypto.createHash('sha256').update(rawEmail.toLowerCase().trim()).digest('hex')
  return this.findOne({ emailHash: hash })
}

employeeSchema.set('toJSON', { virtuals: true })
employeeSchema.set('toObject', { virtuals: true })

module.exports = mongoose.model('Employee', employeeSchema)