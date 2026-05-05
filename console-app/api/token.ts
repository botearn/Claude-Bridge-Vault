import { handleTokenList } from './_lib/tokens.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' })
    return
  }

  return handleTokenList(req, res)
}
