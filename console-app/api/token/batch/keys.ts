import { handleTokenKeysBatch } from '../../_lib/tokens.js'

export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    return handleTokenKeysBatch(req, res)
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
