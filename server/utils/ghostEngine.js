const Employee = require('../models/Employee')
const GhostPersona = require('../models/GhostPersona')
const Scenario = require('../models/Scenario')
const SimulationEvent = require('../models/SimulationEvent')
const { selectTechnique, getNextTargets } = require('./techniqueSelector')
const { createAuditLog } = require('./auditLogger')
const { nanoid } = require('nanoid')

// Spawn ghost on patient zero
async function spawnGhost(scenarioId, patientZeroId) {
  const scenario = await Scenario.findById(scenarioId)
  if (!scenario) throw new Error('Scenario not found')

  const patientZero = await Employee.findById(patientZeroId)
    .populate('department', 'name')
  if (!patientZero) throw new Error('Patient zero not found')

  // Find colleagues — never store passwords or credentials
  const colleagues = await Employee.find({
    department: patientZero.department._id,
    _id: { $ne: patientZero._id },
    isActive: true
  }).select('_id')

  const ghost = new GhostPersona({
    scenario: scenarioId,
    organization: scenario.organization,
    sourceEmployee: {
      employeeId: patientZero._id,
      displayName: patientZero.displayName,
      department: patientZero.department.name,
      role: patientZero.role,
      manager: patientZero.manager,
      colleagues: colleagues.map(c => c._id)
    },
    compromisedNodes: [patientZero._id],
    state: 'SPAWNED',
    spawnedAt: new Date(),
    aggressionLevel: 1
  })

  await ghost.save()

  // Mark patient zero as compromised
  await Employee.findByIdAndUpdate(patientZeroId, { isCompromised: true })

  scenario.patientZero = patientZeroId
  scenario.ghostPersonaId = ghost._id
  scenario.ghostState = 'SPAWNED'
  scenario.compromisedCount = 1
  await scenario.save()

  await createAuditLog({
    actorId: null, actorRole: 'system',
    action: 'ghost.spawned',
    outcome: 'SUCCESS',
    metadata: { scenarioId, patientZeroId, ghostId: ghost._id }
  })

  return ghost
}

// Execute one ghost hop
async function executeGhostHop(ghostId) {
  const ghost = await GhostPersona.findById(ghostId)
  if (!ghost) throw new Error('Ghost not found')
  if (['TERMINATED', 'BREACHED'].includes(ghost.state)) return { terminated: true, reason: ghost.state }

  const scenario = await Scenario.findById(ghost.scenario)
  const allEmployees = await Employee.find({
    organization: ghost.organization,
    isActive: true
  }).populate('department', 'name')

  const compromisedIds = ghost.compromisedNodes.map(id => id.toString())
  const failedIds = ghost.failedAttempts.map(a => a.employeeId.toString())

  // Find last compromised employee as spread source
  const lastCompromised = await Employee.findById(
    ghost.compromisedNodes[ghost.compromisedNodes.length - 1]
  )
  if (!lastCompromised) return { terminated: true, reason: 'no_source' }

  const { lateral, longitudinal } = getNextTargets({
    sourceEmployee: lastCompromised,
    allEmployees,
    compromisedIds,
    failedIds
  })

  // Prefer lateral first, then longitudinal
  const candidates = [...lateral, ...longitudinal]
  if (candidates.length === 0) {
    // No targets — escalate aggression and try other departments
    ghost.aggressionLevel = Math.min(ghost.aggressionLevel + 1, 5)
    ghost.state = 'ESCALATING'
    await ghost.save()
    scenario.ghostState = 'ESCALATING'
    await scenario.save()
    return { escalated: true, aggressionLevel: ghost.aggressionLevel }
  }

  const target = candidates[0]

  // Select technique based on target archetype
  const technique = selectTechnique({
    targetArchetype: target.behavioralArchetype,
    failedTechniques: ghost.techniqueHistory,
    aggressionLevel: ghost.aggressionLevel
  })

  // Skeptical verifier — ghost cannot compromise
  if (!technique) {
    ghost.failedAttempts.push({ employeeId: target._id, technique: 'none', failedAt: new Date() })
    await ghost.save()
    return { blocked: true, targetId: target._id, reason: 'skeptical_verifier' }
  }

  // Check if target is admin — if yes, BREACHED
  const isAdmin = target.role === 'admin'

  // Create simulation event for ghost hop
  const token = nanoid(32)
  const hopNumber = ghost.compromisedNodes.length

  const event = new SimulationEvent({
    scenario: ghost.scenario,
    employee: target._id,
    organization: ghost.organization,
    attackType: 'social_engineering',
    result: 'clicked',
    credentialsCaptured: false,
    tokenUsed: token,
    isGhostHop: true,
    hopNumber
  })
  await event.save()

  // Compromise the target
  ghost.compromisedNodes.push(target._id)
  ghost.techniqueHistory.push(technique.id)
  ghost.currentTarget = target._id
  ghost.currentTechnique = technique.id
  ghost.state = isAdmin ? 'BREACHED' : 'SPREADING'
  await ghost.save()

  await Employee.findByIdAndUpdate(target._id, { isCompromised: true })

  scenario.compromisedCount += 1
  scenario.totalHops = hopNumber
  scenario.ghostState = ghost.state

  if (isAdmin) {
    scenario.status = 'completed'
    scenario.completedAt = new Date()
    scenario.terminationReason = 'admin_breached'
  }
  await scenario.save()

  await createAuditLog({
    actorId: null, actorRole: 'system',
    action: isAdmin ? 'ghost.breached' : 'ghost.hop',
    outcome: 'SUCCESS',
    metadata: {
      ghostId, targetId: target._id, technique: technique.id,
      hopNumber, isAdmin, scenarioId: ghost.scenario
    }
  })

  return {
    hop: true,
    targetId: target._id,
    targetName: target.displayName,
    targetRole: target.role,
    technique: technique.name,
    hopNumber,
    breached: isAdmin,
    ghostState: ghost.state
  }
}

// Terminate ghost — called by defender
async function terminateGhost(ghostId, terminatedBy) {
  const ghost = await GhostPersona.findById(ghostId)
  if (!ghost) throw new Error('Ghost not found')

  ghost.state = 'TERMINATED'
  ghost.terminatedAt = new Date()
  ghost.terminatedBy = terminatedBy
  await ghost.save()

  const scenario = await Scenario.findById(ghost.scenario)
  if (scenario) {
    scenario.ghostState = 'TERMINATED'
    scenario.status = 'completed'
    scenario.completedAt = new Date()
    scenario.terminationReason = 'defender_caught'
    await scenario.save()
  }

  await createAuditLog({
    actorId: terminatedBy, actorRole: 'defender',
    action: 'ghost.terminated',
    outcome: 'SUCCESS',
    metadata: { ghostId, scenarioId: ghost.scenario }
  })

  return { terminated: true, ghostId }
}

module.exports = { spawnGhost, executeGhostHop, terminateGhost }