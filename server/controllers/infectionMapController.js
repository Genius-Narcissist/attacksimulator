const Employee = require('../models/Employee')
const Scenario = require('../models/Scenario')

async function getInfectionMap(request, reply) {

  const { scenarioId } = request.params

  const scenario = await Scenario.findById(scenarioId)

  if (!scenario)
    return reply.status(404).send({ error: 'Scenario not found' })

  const employees = await Employee.find({
    organization: scenario.organization,
    isActive: true
  }).populate('department', 'name')

  const nodes = employees.map(e => ({
    id: e._id.toString(),
    data: {
      name: e.displayName,
      role: e.role,
      department: e.department?.name,
      archetype: e.behavioralArchetype,
      compromised: e.isCompromised
    },
    position: { x: 0, y: 0 } // frontend layout will reposition
  }))

  const edges = employees
    .filter(e => e.manager)
    .map(e => ({
      id: `${e.manager}-${e._id}`,
      source: e.manager.toString(),
      target: e._id.toString(),
      animated: false
    }))

  return reply.send({
    scenarioId,
    patientZero: scenario.patientZero,
    nodes,
    edges
  })
}

module.exports = { getInfectionMap }