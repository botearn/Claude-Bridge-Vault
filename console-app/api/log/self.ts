import { handleLogList } from '../_lib/logs.js'

export default async function handler(req: any, res: any) {
  return handleLogList(req, res, false)
}
