async function getEmployees(request, reply) {
  try {

    const { departmentId, archetype, role, page = 1, limit = 50 } = request.query

    const filter = {
      organization: mongoSanitize(request.params.orgId),
      isActive: true
    }

    if (departmentId) filter.department = mongoSanitize(departmentId)
    if (archetype) filter.behavioralArchetype = mongoSanitize(archetype)
    if (role) filter.role = mongoSanitize(role)

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const employees = await Employee.find(filter)
      .populate('department', 'name')
      .sort({ lastName: 1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await Employee.countDocuments(filter)

    return reply.status(200).send({
      employees: employees.map(e => ({
        id: e._id,
        firstName: e.firstName,
        lastName: e.lastName,
        displayName: e.displayName,
        role: e.role,
        department: e.department,
        behavioralArchetype: e.behavioralArchetype,
        securityScore: e.securityScore,
        scenariosCompleted: e.scenariosCompleted,
        scenariosFailed: e.scenariosFailed,
        isCompromised: e.isCompromised,
        roleSensitivityWeight: e.roleSensitivityWeight
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    })

  } catch (err) {
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}


async function getEmployee(request, reply) {
  try {

    const emp = await Employee.findOne({
      _id: mongoSanitize(request.params.employeeId),
      organization: mongoSanitize(request.params.orgId)
    }).populate('department', 'name')

    if (!emp)
      return reply.status(404).send({ error: 'Employee not found' })

    return reply.status(200).send({
      employee: {
        id: emp._id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        displayName: emp.displayName,
        role: emp.role,
        department: emp.department,
        behavioralArchetype: emp.behavioralArchetype,
        securityScore: emp.securityScore,
        scenariosCompleted: emp.scenariosCompleted,
        scenariosFailed: emp.scenariosFailed,
        awarModulesCompleted: emp.awarModulesCompleted,
        badges: emp.badges,
        isCompromised: emp.isCompromised,
        roleSensitivityWeight: emp.roleSensitivityWeight,
        lastSimulationResult: emp.lastSimulationResult,
        createdAt: emp.createdAt
      }
    })

  } catch (err) {
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}


async function updateOrgSecurityCultureScore(orgId) {

  const employees = await Employee.find({
    organization: orgId,
    isActive: true
  })

  if (employees.length === 0) return

  const total = employees.length

  const reported = employees.filter(
    e => e.lastSimulationResult === 'reported'
  ).length

  const reportRate = (reported / total) * 100

  const completionRate =
    (employees.reduce((sum, e) => sum + e.awarModulesCompleted, 0) / (total * 5)) * 100

  const avgScore =
    employees.reduce((sum, e) => sum + e.securityScore, 0) / total

  const score =
    reportRate * 0.3 +
    Math.min(completionRate, 100) * 0.2 +
    avgScore * 0.5

  await Organization.findByIdAndUpdate(orgId, {
    securityCultureScore: Math.round(score),
    'securityCultureBreakdown.reportRate': Math.round(reportRate),
    'securityCultureBreakdown.moduleCompletion': Math.round(completionRate)
  })
}