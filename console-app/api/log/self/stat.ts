import { handleLogStats } from '../../_lib/logs.js'

export default async function handler(req: any, res: any) {
  return handleLogStats(req, res, false)
}
