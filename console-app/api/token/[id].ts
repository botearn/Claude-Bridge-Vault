import { handleTokenDelete, handleTokenGet } from '../_lib/tokens.js'

export default async function handler(req: any, res: any) {
  const id = Number(req.query?.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ success: false, message: 'Invalid token id' })
    return
  }

  if (req.method === 'GET') {
    return handleTokenGet(req, res, id)
  }

  if (req.method === 'DELETE') {
    return handleTokenDelete(req, res, id)
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
