const { z } = require('zod')

const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim()
    .refine(
      val => !/<[^>]*>/.test(val),
      'Name contains invalid characters'
    ),

  email: z
    .string()
    .email('Invalid email format')
    .max(254, 'Email too long')
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .refine(
      val => /[A-Z]/.test(val),
      'Password must contain at least one uppercase letter'
    )
    .refine(
      val => /[0-9]/.test(val),
      'Password must contain at least one number'
    )
    .refine(
      val => /[^A-Za-z0-9]/.test(val),
      'Password must contain at least one special character'
    ),

  role: z
    .enum(['admin', 'analyst', 'defender'])
    .optional()
    .default('analyst'),

  organizationId: z
    .string()
    .optional()
    .nullable()
})

const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(254)
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password too long')
})

module.exports = { registerSchema, loginSchema }