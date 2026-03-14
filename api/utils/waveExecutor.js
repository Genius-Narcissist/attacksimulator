const Employee = require('../models/Employee')
const SimulationEvent = require('../models/SimulationEvent')
const Scenario = require('../models/Scenario')
const Organization = require('../models/Organization')

const { createAuditLog } = require('../utils/auditLogger')
const { dispatchAttack } = require('../utils/channelSender')
const { emitSimulationEvent } = require('./socketManager') // NEW

const { nanoid } = require('nanoid')


// Attack type → template mapping
const ATTACK_TEMPLATES = {
  email_phishing: ['invoice_fraud', 'it_password_reset', 'security_alert'],
  credential_harvesting: ['fake_sso_portal'],
  social_engineering: ['it_impersonation', 'hr_impersonation', 'manager_request'],
  malware_simulation: ['fake_attachment'],
  sim_swap: ['carrier_verification']
}


// Select template based on employee behavioral archetype
function selectTemplate(attackType, archetype) {

  const templates = ATTACK_TEMPLATES[attackType]

  if (attackType === 'email_phishing') {

    if (archetype === 'rushed_responder')
      return 'invoice_fraud'

    if (archetype === 'trusting_delegator')
      return 'it_password_reset'

    return 'security_alert'
  }

  return templates?.[0] || 'default'
}


// Execute first attack wave
async function executeWave1(scenarioId) {

  const scenario = await Scenario.findById(scenarioId)
    .populate('targetEmployees')

  if (!scenario)
    throw new Error('Scenario not found')

  if (scenario.status !== 'active')
    throw new Error('Scenario not active')


  const employees = await Employee.find({
    _id: { $in: scenario.targetEmployees },
    isActive: true
  })


  const org = await Organization.findById(scenario.organization)

  const events = []


  for (const employee of employees) {

    for (const attackType of scenario.attackTypes) {

      const token = nanoid(32)

      const template = selectTemplate(
        attackType,
        employee.behavioralArchetype
      )


      const event = new SimulationEvent({
        scenario: scenario._id,
        employee: employee._id,
        organization: scenario.organization,
        attackType,
        result: 'pending',
        credentialsCaptured: false,
        tokenUsed: token,
        hopNumber: 0
      })

      await event.save()


      const trackingUrl =
        `${process.env.PUBLIC_URL}/api/sim/click/${token}`


      // Send real phishing attack
      await dispatchAttack({
        employee,
        attackType,
        template,
        trackingUrl,
        orgName: org?.name || 'Your Organization',
        managerName: 'IT Support',
        aggressionLevel: 1
      })


      events.push({
        event,
        employee,
        template,
        token
      })
    }
  }


  await createAuditLog({
    actorId: null,
    actorRole: 'system',
    action: 'wave1.executed',
    outcome: 'SUCCESS',
    metadata: {
      scenarioId: scenario._id,
      targetCount: employees.length,
      attackTypes: scenario.attackTypes,
      eventsCreated: events.length
    }
  })


  return {
    eventsCreated: events.length,
    targetCount: employees.length
  }
}


// Record simulation event result
async function recordEventResult(token, result, metadata = {}) {

  const event = await SimulationEvent.findOne({ tokenUsed: token })

  if (!event)
    return null

  if (event.result !== 'pending')
    return event


  event.result = result
  event.timeToActionSeconds = metadata.timeToActionSeconds || null
  event.deviceType = metadata.deviceType || null
  event.sessionId = metadata.sessionId || null
  event.deviceFingerprint = metadata.deviceFingerprint || null

  await event.save()


  // NEW — emit live socket event for infection map
  emitSimulationEvent(event.scenario.toString(), {
    employeeId: event.employee.toString(),
    attackType: event.attackType,
    result
  })


  const scenario = await Scenario.findById(event.scenario)

  if (scenario) {

    if (
      result === 'clicked' ||
      result === 'submitted_form' ||
      result === 'downloaded'
    ) {
      scenario.clickedCount += 1
    }

    if (result === 'reported') {
      scenario.reportedCount += 1
    }

    await scenario.save()
  }


  await Employee.findByIdAndUpdate(
    event.employee,
    { lastSimulationResult: result }
  )


  return event
}


module.exports = {
  executeWave1,
  recordEventResult,
  selectTemplate
}