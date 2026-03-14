const mongoSanitize = require('mongo-sanitize')
const { z } = require('zod')
const Organization = require('../models/Organization')
const Department = require('../models/Department')
const Employee = require('../models/Employee')
const { createAuditLog } = require('../utils/auditLogger')
const { processEmployeeCSV } = require('../utils/csvProcessor')

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  domain: z.string().min(3).max(253).toLowerCase().trim()
    .regex(/^[a-z0-9][a-z0-9\-\.]+[a-z0-9]$/, 'Invalid domain format'),
  industry: z.enum(['healthcare', 'financial_services', 'technology', 'education', 'retail', 'other'])
})

const AddDepartmentSchema = z.object({
  name: z.string().min(2).max(100).trim()
})

const AddEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  email: z.string().email().max(254).toLowerCase().trim(),
  role: z.enum(['admin', 'it_support', 'finance_manager', 'finance_analyst', 'hr_manager', 'general_employee']),
  departmentId: z.string().min(1),
  managerId: z.string().optional()
})

function actor(request) {
  return {
    actorId: request.user?.id,
    actorRole: request.user?.role,
    ipAddress: request.ip
  }
}

async function createOrganization(request, reply) {
  try {
    const body = mongoSanitize(request.body)
    const validated = CreateOrgSchema.parse(body)

    const existing = await Organization.findOne({ domain: validated.domain })
    if (existing) {
      await createAuditLog({ ...actor(request), action: 'org.create', outcome: 'FAILED', metadata: { reason: 'duplicate_domain' } })
      return reply.status(409).send({ error: 'Domain already registered' })
    }

    const org = new Organization({ ...validated, createdBy: request.user.id })
    await org.save()

    await createAuditLog({ ...actor(request), action: 'org.create', outcome: 'SUCCESS', metadata: { orgId: org._id } })

    return reply.status(201).send({
      org: { id: org._id, name: org.name, domain: org.domain, industry: org.industry, employeeCount: 0, securityCultureScore: 0, createdAt: org.createdAt }
    })
  } catch (err) {
    if (err.name === 'ZodError') return reply.status(400).send({ error: 'Validation failed', details: err.errors })
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function getOrganization(request, reply) {
  try {
    const org = await Organization.findById(mongoSanitize(request.params.orgId))
    if (!org) return reply.status(404).send({ error: 'Organization not found' })

    const departments = await Department.find({ organization: org._id })

    return reply.status(200).send({
      org: {
        id: org._id, name: org.name, domain: org.domain, industry: org.industry,
        employeeCount: org.employeeCount, securityCultureScore: org.securityCultureScore,
        securityCultureBreakdown: org.securityCultureBreakdown,
        departments: departments.map(d => ({ id: d._id, name: d.name, employeeCount: d.employeeCount, riskScore: d.riskScore, departmentSecurityScore: d.departmentSecurityScore })),
        createdAt: org.createdAt
      }
    })
  } catch (err) {
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function addDepartment(request, reply) {
  try {
    const org = await Organization.findById(mongoSanitize(request.params.orgId))
    if (!org) return reply.status(404).send({ error: 'Organization not found' })

    const validated = AddDepartmentSchema.parse(mongoSanitize(request.body))

    const existing = await Department.findOne({ organization: org._id, name: validated.name })
    if (existing) return reply.status(409).send({ error: 'Department already exists' })

    const dept = new Department({ name: validated.name, organization: org._id })
    await dept.save()

    await createAuditLog({ ...actor(request), action: 'department.create', outcome: 'SUCCESS', metadata: { orgId: org._id, deptId: dept._id } })

    return reply.status(201).send({ department: { id: dept._id, name: dept.name, employeeCount: 0 } })
  } catch (err) {
    if (err.name === 'ZodError') return reply.status(400).send({ error: 'Validation failed', details: err.errors })
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function getDepartments(request, reply) {
  try {
    const org = await Organization.findById(mongoSanitize(request.params.orgId))
    if (!org) return reply.status(404).send({ error: 'Organization not found' })

    const departments = await Department.find({ organization: org._id })
    return reply.status(200).send({
      departments: departments.map(d => ({ id: d._id, name: d.name, employeeCount: d.employeeCount, riskScore: d.riskScore, departmentSecurityScore: d.departmentSecurityScore }))
    })
  } catch (err) {
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function addEmployee(request, reply) {
  try {
    const org = await Organization.findById(mongoSanitize(request.params.orgId))
    if (!org) return reply.status(404).send({ error: 'Organization not found' })

    const validated = AddEmployeeSchema.parse(mongoSanitize(request.body))

    const dept = await Department.findOne({ _id: mongoSanitize(validated.departmentId), organization: org._id })
    if (!dept) return reply.status(404).send({ error: 'Department not found in this org' })

    const existing = await Employee.findByEmail(validated.email)
    if (existing) return reply.status(409).send({ error: 'Employee email already registered' })

    const emp = new Employee({
      firstName: validated.firstName, lastName: validated.lastName,
      role: validated.role, department: dept._id,
      organization: org._id, manager: validated.managerId || null
    })
    Employee.setEmail(emp, validated.email)
    await emp.save()

    dept.employeeCount += 1
    await dept.save()
    org.employeeCount += 1
    await org.save()

    await createAuditLog({ ...actor(request), action: 'employee.create', outcome: 'SUCCESS', metadata: { orgId: org._id, empId: emp._id, role: emp.role } })

    return reply.status(201).send({
      employee: { id: emp._id, firstName: emp.firstName, lastName: emp.lastName, displayName: emp.displayName, role: emp.role, department: { id: dept._id, name: dept.name }, securityScore: 0, behavioralArchetype: emp.behavioralArchetype, createdAt: emp.createdAt }
    })
  } catch (err) {
    if (err.name === 'ZodError') return reply.status(400).send({ error: 'Validation failed', details: err.errors })
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function getEmployees(request, reply) {
  try {
    const { departmentId, archetype, role, page = 1, limit = 50 } = request.query
    const filter = { organization: mongoSanitize(request.params.orgId), isActive: true }
    if (departmentId) filter.department = mongoSanitize(departmentId)
    if (archetype) filter.behavioralArchetype = mongoSanitize(archetype)
    if (role) filter.role = mongoSanitize(role)

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const employees = await Employee.find(filter).populate('department', 'name').sort({ lastName: 1 }).skip(skip).limit(parseInt(limit))
    const total = await Employee.countDocuments(filter)

    return reply.status(200).send({
      employees: employees.map(e => ({
        id: e._id, firstName: e.firstName, lastName: e.lastName, displayName: e.displayName,
        role: e.role, department: e.department, behavioralArchetype: e.behavioralArchetype,
        securityScore: e.securityScore, scenariosCompleted: e.scenariosCompleted,
        scenariosFailed: e.scenariosFailed, isCompromised: e.isCompromised,
        roleSensitivityWeight: e.roleSensitivityWeight
      })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
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

    if (!emp) return reply.status(404).send({ error: 'Employee not found' })

    return reply.status(200).send({
      employee: {
        id: emp._id, firstName: emp.firstName, lastName: emp.lastName, displayName: emp.displayName,
        role: emp.role, department: emp.department, behavioralArchetype: emp.behavioralArchetype,
        securityScore: emp.securityScore, scenariosCompleted: emp.scenariosCompleted,
        scenariosFailed: emp.scenariosFailed, awarModulesCompleted: emp.awarModulesCompleted,
        badges: emp.badges, isCompromised: emp.isCompromised,
        roleSensitivityWeight: emp.roleSensitivityWeight,
        lastSimulationResult: emp.lastSimulationResult, createdAt: emp.createdAt
      }
    })
  } catch (err) {
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function bulkUploadEmployees(request, reply) {
  try {
    const org = await Organization.findById(mongoSanitize(request.params.orgId))
    if (!org) return reply.status(404).send({ error: 'Organization not found' })

    const buffer = request.uploadedBuffer
    if (!buffer) return reply.status(400).send({ error: 'No file data after security scan' })

    const { valid, invalid, duplicateEmails } = processEmployeeCSV(buffer)

    if (valid.length === 0) return reply.status(400).send({ error: 'No valid rows found', invalid, duplicateEmails })

    const deptCache = {}
    const getDept = async (name) => {
      if (deptCache[name]) return deptCache[name]
      let dept = await Department.findOne({ organization: org._id, name })
      if (!dept) { dept = new Department({ name, organization: org._id }); await dept.save() }
      deptCache[name] = dept
      return dept
    }

    const created = []
    const skipped = []

    for (const row of valid) {
      const exists = await Employee.findByEmail(row.email)
      if (exists) { skipped.push({ email: row.email, reason: 'already exists' }); continue }

      const dept = await getDept(row.department)
      const emp = new Employee({ firstName: row.firstName, lastName: row.lastName, role: row.role, department: dept._id, organization: org._id })
      Employee.setEmail(emp, row.email)
      await emp.save()
      dept.employeeCount += 1
      await dept.save()
      created.push(emp._id)
    }

    org.employeeCount = await Employee.countDocuments({ organization: org._id, isActive: true })
    await org.save()

    await createAuditLog({ ...actor(request), action: 'employees.bulk_upload', outcome: 'SUCCESS', metadata: { orgId: org._id, created: created.length, skipped: skipped.length } })

    return reply.status(201).send({
      summary: { created: created.length, skipped: skipped.length, invalid: invalid.length, duplicatesInFile: duplicateEmails.length },
      invalidRows: invalid, skippedRows: skipped
    })
  } catch (err) {
    request.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
}

async function updateOrgSecurityCultureScore(orgId) {
  const employees = await Employee.find({ organization: orgId, isActive: true })
  if (employees.length === 0) return

  const total = employees.length
  const reported = employees.filter(e => e.lastSimulationResult === 'reported').length
  const reportRate = (reported / total) * 100
  const completionRate = (employees.reduce((sum, e) => sum + e.awarModulesCompleted, 0) / (total * 5)) * 100
  const avgScore = employees.reduce((sum, e) => sum + e.securityScore, 0) / total
  const score = reportRate * 0.3 + Math.min(completionRate, 100) * 0.2 + avgScore * 0.5

  await Organization.findByIdAndUpdate(orgId, {
    securityCultureScore: Math.round(score),
    'securityCultureBreakdown.reportRate': Math.round(reportRate),
    'securityCultureBreakdown.moduleCompletion': Math.round(completionRate)
  })
}

module.exports = { createOrganization, getOrganization, addDepartment, getDepartments, addEmployee, getEmployees, getEmployee, bulkUploadEmployees, updateOrgSecurityCultureScore }