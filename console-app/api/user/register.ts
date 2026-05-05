import bcrypt from 'bcryptjs'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' })
    return
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''

  if (!email || !password || !name) {
    res.status(400).json({
      success: false,
      message: 'Email, password and name are required',
    })
    return
  }

  if (password.length < 6) {
    res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters',
    })
    return
  }

  const existing = await redis.hget('vault:users', email)
  if (existing) {
    res.status(409).json({
      success: false,
      message: 'Email already registered',
    })
    return
  }

  const ADMIN_EMAILS = new Set([
    'yuqingchen02@gmail.com',
    'nicole.chen@sitesfy.ai',
    'steve@sitesfy.ai',
  ])

  const user = {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    email,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    role: ADMIN_EMAILS.has(email) ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  }

  await redis.hset('vault:users', {
    [email]: JSON.stringify(user),
  })

  res.status(201).json({
    success: true,
    message: 'OK',
    data: {
      id: Number(user.id) || 1,
    },
  })
}
