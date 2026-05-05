import {
  handleTokenCreate,
  handleTokenList,
  handleTokenStatusUpdate,
  handleTokenUpdate,
} from './_lib/tokens.js'

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return handleTokenList(req, res)
  }
  if (req.method === 'POST') {
    return handleTokenCreate(req, res)
  }
  if (req.method === 'PUT') {
    if (req.query?.status_only === 'true') {
      return handleTokenStatusUpdate(req, res)
    }
    return handleTokenUpdate(req, res)
  }
  if (req.method === 'DELETE') {
    return res
      .status(405)
      .json({ success: false, message: 'Use /api/token/:id to delete a key' })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
