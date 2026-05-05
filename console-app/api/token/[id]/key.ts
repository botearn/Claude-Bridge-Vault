import { handleTokenKey } from '../../_lib/tokens.js'

export default async function handler(req: any, res: any) {
  const id = Number(req.query?.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ success: false, message: 'Invalid token id' })
    return
  }

  if (req.method === 'POST') {
    return handleTokenKey(req, res, id)
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
